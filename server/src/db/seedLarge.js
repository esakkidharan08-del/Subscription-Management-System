import { addDays, addMonths, nextBillingDate, today } from '../lib/dates.js';
import { hashPassword } from '../services/authService.js';
import { createRandom, fakeCustomer, fakePaymentNote } from './fakeData.js';
import { db } from './index.js';

const CUSTOMERS = 500;
const BILLED_SUBSCRIPTIONS = 5000;
const UNBILLED_SUBSCRIPTIONS = 250;
const MONTHS_BILLED = 10;
const TERM_DAYS = { immediate: 0, net_15: 15, net_30: 30 };

// Earlier versions named everyone "Bulk Customer N". Rename them in place so an
// existing database gets realistic names without a reset.
function renameOldBulkCustomers(random) {
  const old = db.prepare("SELECT id FROM users WHERE email LIKE 'bulk%@example.com'").all();
  const rename = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
  old.forEach((row, i) => {
    const { name, email } = fakeCustomer(random, i + 1);
    rename.run(name, email, row.id);
  });
  return old.length;
}

function loadMonthlyPlans() {
  const plans = db
    .prepare(
      `SELECT pl.id, pl.product_id, pl.price, pl.end_behavior, p.name AS product_name,
         tr.tax_id, COALESCE(t.rate_bp, 0) AS rate_bp
       FROM plans pl
       JOIN products p ON p.id = pl.product_id
       LEFT JOIN tax_rules tr ON tr.category = p.type
       LEFT JOIN taxes t ON t.id = tr.tax_id
       WHERE pl.billing_period = 'monthly'
       GROUP BY pl.id`,
    )
    .all();
  if (!plans.length) throw new Error('Run the normal seed first so there are monthly plans');
  return plans;
}

function insertCustomers(random) {
  // One hash for every sample account; bcrypt on 500 passwords would dominate the run.
  const passwordHash = hashPassword('Customer@123');
  const insert = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, created_at)
     VALUES (?, ?, ?, 'customer', ?)`,
  );
  const ids = [];
  for (let i = 1; i <= CUSTOMERS; i++) {
    const { name, email } = fakeCustomer(random, i);
    const joined = `${addDays(today(), -random.int(320, 420))} ${String(random.int(8, 20)).padStart(2, '0')}:${String(random.int(0, 59)).padStart(2, '0')}:00`;
    ids.push(Number(insert.run(name, email, passwordHash, joined).lastInsertRowid));
  }
  return ids;
}

// Writes rows directly instead of going through the billing run: the point is a
// realistic volume for timing pages, and 50,000 invoices one by one would take minutes.
export function seedLargeDataset() {
  const random = createRandom();

  const renamed = renameOldBulkCustomers(random);
  if (renamed > 0) {
    console.log(`Renamed ${renamed} old "Bulk Customer" accounts with sample names.`);
    return;
  }

  const { invoices } = db.prepare('SELECT COUNT(*) AS invoices FROM invoices').get();
  if (invoices > 10000) {
    console.log('Large dataset already present, skipping.');
    return;
  }

  const plans = loadMonthlyPlans();
  const customerIds = insertCustomers(random);
  const asOf = today();
  const pad = (n) => String(n).padStart(5, '0');

  let subId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM subscriptions').get().n;
  let invoiceId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM invoices').get().n;

  const insertSub = db.prepare(
    `INSERT INTO subscriptions (id, number, customer_id, plan_id, start_date, expiry_date,
       payment_terms, status, next_billing_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSubLine = db.prepare(
    `INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price, tax_id, amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertInvoice = db.prepare(
    `INSERT INTO invoices (id, number, subscription_id, customer_id, period_start, period_end, status,
       subtotal, tax_total, discount_total, total, due_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertInvoiceLine = db.prepare(
    `INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, tax_amount, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPayment = db.prepare(
    'INSERT INTO payments (invoice_id, method, amount, paid_on, note) VALUES (?, ?, ?, ?, ?)',
  );

  function addSubscription({ billed }) {
    const id = subId++;
    const plan = random.pick(plans);
    const customerId = random.pick(customerIds);
    const quantity = random.weighted([
      [1, 40],
      [2, 20],
      [3, 12],
      [5, 12],
      [10, 8],
      [25, 5],
      [50, 3],
    ]);
    const terms = random.weighted([
      ['immediate', 3],
      ['net_15', 4],
      ['net_30', 3],
    ]);
    const startDate = billed
      ? addDays(addMonths(asOf, -MONTHS_BILLED), -random.int(0, 27))
      : addDays(asOf, random.int(-20, 10));

    // Most billed subscriptions are still running; a few were closed after their last invoice.
    const closed = billed && random.chance(0.08);
    const status = billed
      ? closed
        ? 'closed'
        : 'active'
      : random.pick(['draft', 'quotation', 'confirmed']);
    const expiry = closed
      ? addMonths(startDate, MONTHS_BILLED)
      : random.chance(0.3)
        ? addMonths(startDate, random.pick([12, 18, 24]))
        : null;
    const nextBill = status === 'active' ? addMonths(startDate, MONTHS_BILLED) : null;

    // Some customers negotiated a lower unit price.
    const unitPrice = random.chance(0.15)
      ? Math.round(plan.price * random.pick([0.8, 0.85, 0.9]))
      : plan.price;
    const amount = unitPrice * quantity;

    insertSub.run(
      id,
      `SUB-${pad(id)}`,
      customerId,
      plan.id,
      startDate,
      expiry,
      terms,
      status,
      nextBill,
      `${startDate} 10:00:00`,
    );
    insertSubLine.run(id, plan.product_id, quantity, unitPrice, plan.tax_id, amount);

    if (!billed) return;
    let periodStart = startDate;
    for (let month = 0; month < MONTHS_BILLED; month++) {
      addInvoice({
        id,
        customerId,
        plan,
        quantity,
        unitPrice,
        amount,
        terms,
        startDate,
        periodStart,
        month,
      });
      periodStart = nextBillingDate(startDate, periodStart, 'monthly');
    }
  }

  function addInvoice({
    id,
    customerId,
    plan,
    quantity,
    unitPrice,
    amount,
    terms,
    startDate,
    periodStart,
    month,
  }) {
    const nextStart = nextBillingDate(startDate, periodStart, 'monthly');
    const periodEnd = addDays(nextStart, -1);
    const dueDate = addDays(periodStart, TERM_DAYS[terms]);

    // An occasional loyalty discount, so discount totals aren't all zero.
    const discount = random.chance(0.06) ? Math.round(amount * 0.1) : 0;
    const taxable = amount - discount;
    const tax = Math.round((taxable * plan.rate_bp) / 10000);
    const total = taxable + tax;

    // Older invoices are mostly settled; the last couple of months leave an unpaid tail.
    const isRecent = month >= MONTHS_BILLED - 2;
    const outcome = random.weighted(
      isRecent
        ? [
            ['unpaid', 55],
            ['paid', 40],
            ['partial', 5],
          ]
        : [
            ['paid', 85],
            ['unpaid', 8],
            ['partial', 5],
            ['cancelled', 2],
          ],
    );
    const status =
      outcome === 'paid' ? 'paid' : outcome === 'cancelled' ? 'cancelled' : 'confirmed';

    insertInvoice.run(
      invoiceId,
      `INV-${pad(invoiceId)}`,
      id,
      customerId,
      periodStart,
      periodEnd,
      status,
      amount,
      tax,
      discount,
      total,
      dueDate,
      `${periodStart} 02:00:00`,
    );
    insertInvoiceLine.run(
      invoiceId,
      plan.product_id,
      `${plan.product_name} (${periodStart} to ${periodEnd})`,
      quantity,
      unitPrice,
      tax,
      taxable,
    );

    if (outcome === 'paid' || outcome === 'partial') {
      // Most pay a few days early, some pay late.
      const paidOn = random.chance(0.8)
        ? addDays(dueDate, -random.int(0, 10))
        : addDays(dueDate, random.int(1, 25));
      const method = random.weighted([
        ['upi', 45],
        ['card', 25],
        ['bank_transfer', 22],
        ['cash', 8],
      ]);
      const paid = outcome === 'paid' ? total : Math.round(total * random.pick([0.25, 0.5, 0.6]));
      insertPayment.run(
        invoiceId,
        method,
        paid,
        paidOn < periodStart ? periodStart : paidOn,
        fakePaymentNote(random),
      );
    }
    invoiceId += 1;
  }

  for (let n = 0; n < BILLED_SUBSCRIPTIONS; n++) addSubscription({ billed: true });
  for (let n = 0; n < UNBILLED_SUBSCRIPTIONS; n++) addSubscription({ billed: false });

  console.log(
    `Large dataset: ${CUSTOMERS} customers, ${BILLED_SUBSCRIPTIONS + UNBILLED_SUBSCRIPTIONS} subscriptions, ` +
      `${BILLED_SUBSCRIPTIONS * MONTHS_BILLED} invoices.`,
  );
}
