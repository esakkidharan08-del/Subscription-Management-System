import { addDays, addMonths, nextBillingDate, today } from '../lib/dates.js';
import { hashPassword } from '../services/authService.js';
import { createRandom, fakeCustomer, fakePaymentNote } from './fakeData.js';
import { db } from './index.js';

const CUSTOMERS = 500;
const TARGET_INVOICES = 50000;
const UNBILLED_SUBSCRIPTIONS = 250;
const TERM_DAYS = { immediate: 0, net_15: 15, net_30: 30 };

// How a customer pays decides every one of their invoices, so a slow payer's
// rows are late month after month, the way a real ledger looks.
const PAYERS = {
  // [share of customers, days paid relative to the due date, chance they ever pay]
  prompt: { share: 52, payDays: [-12, 2], paysAtAll: 0.99, earlyWhenNotDue: 0.4 },
  regular: { share: 30, payDays: [-3, 18], paysAtAll: 0.96, earlyWhenNotDue: 0.15 },
  slow: { share: 14, payDays: [10, 75], paysAtAll: 0.85, earlyWhenNotDue: 0.03 },
  struggling: { share: 4, payDays: [40, 160], paysAtAll: 0.45, earlyWhenNotDue: 0 },
};

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

function loadMonthlyPlans() {
  const plans = db
    .prepare(
      `SELECT pl.id, pl.product_id, pl.price, p.name AS product_name,
         MAX(tr.tax_id) AS tax_id, COALESCE(MAX(t.rate_bp), 0) AS rate_bp
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
  const taken = new Set(
    db
      .prepare('SELECT email FROM users')
      .all()
      .map((row) => row.email),
  );
  const payerKinds = Object.entries(PAYERS).map(([kind, p]) => [kind, p.share]);

  const customers = [];
  for (let i = 0; i < CUSTOMERS; i++) {
    const { name, email } = fakeCustomer(random, taken);
    const joined = `${addDays(today(), -random.int(30, 480))} ${String(random.int(9, 19)).padStart(2, '0')}:${String(random.int(0, 59)).padStart(2, '0')}:00`;
    const id = Number(insert.run(name, email, passwordHash, joined).lastInsertRowid);
    // A few big accounts hold many subscriptions; most hold one or two.
    customers.push({ id, payer: random.weighted(payerKinds), weight: 1 / (i + 1) ** 0.45 });
  }
  return customers;
}

// What happened to one invoice by today, given who the customer is.
function invoiceOutcome(random, payer, dueDate, asOf) {
  const habit = PAYERS[payer];
  const daysLate = daysBetween(dueDate, asOf);

  if (daysLate < 0) {
    // Not due yet: most are waiting, prompt payers often settle early, and a
    // few fresh ones still sit as drafts for staff to review.
    if (random.chance(0.06)) return { status: 'draft' };
    if (random.chance(habit.earlyWhenNotDue)) {
      return { status: 'paid', paidOn: addDays(dueDate, -random.int(1, 10)) };
    }
    return { status: 'confirmed' };
  }

  if (daysLate > 45 && random.chance(0.015)) return { status: 'cancelled' };
  if (!random.chance(habit.paysAtAll)) return { status: 'confirmed' };

  const payAfter = random.int(habit.payDays[0], habit.payDays[1]);
  if (payAfter > daysLate) return { status: 'confirmed' };

  const paidOn = addDays(dueDate, payAfter);
  // Some pay part now and owe the rest.
  if (random.chance(0.05)) return { status: 'confirmed', paidOn, partial: true };
  return { status: 'paid', paidOn };
}

// Writes rows directly instead of going through the billing run: the point is a
// realistic volume for timing pages, and 50,000 invoices one by one would take minutes.
export function seedLargeDataset() {
  const { invoices } = db.prepare('SELECT COUNT(*) AS invoices FROM invoices').get();
  if (invoices > 10000) {
    console.log('Large dataset already present. Delete server/data/app.db* to reseed it.');
    return;
  }

  const random = createRandom();
  const asOf = today();
  const plans = loadMonthlyPlans();
  const customers = insertCustomers(random);
  const customerPicks = customers.map((c) => [c, c.weight]);
  const pad = (n) => String(n).padStart(5, '0');

  let subId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM subscriptions').get().n;
  const insertSub = db.prepare(
    `INSERT INTO subscriptions (id, number, customer_id, plan_id, start_date, expiry_date,
       payment_terms, status, next_billing_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSubLine = db.prepare(
    `INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price, tax_id, amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  // Invoices are collected first and numbered afterwards in date order, so
  // neighbouring invoice numbers belong to different customers, as they would
  // after months of real billing runs.
  const pending = [];

  function addSubscription(billed) {
    const id = subId++;
    const plan = random.pick(plans);
    const customer = random.weighted(customerPicks);
    const quantity = random.weighted([
      [1, 30],
      [2, 18],
      [3, 12],
      [4, 8],
      [5, 8],
      [8, 5],
      [10, 6],
      [12, 3],
      [15, 3],
      [20, 3],
      [25, 2],
      [40, 1],
      [60, 1],
    ]);
    const terms = random.weighted([
      ['immediate', 3],
      ['net_15', 4],
      ['net_30', 3],
    ]);
    // Negotiated prices for some accounts.
    const unitPrice = random.chance(0.18)
      ? Math.round((plan.price * random.pick([80, 85, 88, 90, 95])) / 100)
      : plan.price;
    const amount = unitPrice * quantity;

    if (!billed) {
      const start = addDays(asOf, random.int(-25, 20));
      const status = random.weighted([
        ['draft', 4],
        ['quotation', 4],
        ['confirmed', 2],
      ]);
      insertSub.run(
        id,
        `SUB-${pad(id)}`,
        customer.id,
        plan.id,
        start,
        null,
        terms,
        status,
        null,
        `${addDays(start, -random.int(1, 15))} 11:20:00`,
      );
      insertSubLine.run(id, plan.product_id, quantity, unitPrice, plan.tax_id, amount);
      return;
    }

    // Started anywhere from 2 to 16 months ago, on any day of the month.
    const startDate = addDays(addMonths(asOf, -random.int(2, 16)), -random.int(0, 27));
    // About one in ten stopped after a few months.
    const stoppedAfter = random.chance(0.1) ? random.int(2, 8) : null;

    let periodStart = startDate;
    let months = 0;
    while (periodStart <= asOf && (stoppedAfter === null || months < stoppedAfter)) {
      const nextStart = nextBillingDate(startDate, periodStart, 'monthly');
      const discount = random.chance(0.05) ? Math.round(amount * 0.1) : 0;
      const taxable = amount - discount;
      const tax = Math.round((taxable * plan.rate_bp) / 10000);
      const dueDate = addDays(periodStart, TERM_DAYS[terms]);
      pending.push({
        subscriptionId: id,
        customer,
        plan,
        quantity,
        unitPrice,
        amount,
        discount,
        tax,
        total: taxable + tax,
        periodStart,
        periodEnd: addDays(nextStart, -1),
        dueDate,
        // Billing runs at different times of day; this also mixes the order within a date.
        createdAt: `${periodStart} ${String(random.int(0, 23)).padStart(2, '0')}:${String(random.int(0, 59)).padStart(2, '0')}:00`,
        outcome: invoiceOutcome(random, customer.payer, dueDate, asOf),
      });
      periodStart = nextStart;
      months += 1;
    }

    const closed = stoppedAfter !== null;
    insertSub.run(
      id,
      `SUB-${pad(id)}`,
      customer.id,
      plan.id,
      startDate,
      closed
        ? periodStart
        : random.chance(0.25)
          ? addMonths(startDate, random.pick([12, 24]))
          : null,
      terms,
      closed ? 'closed' : 'active',
      closed ? null : periodStart,
      `${addDays(startDate, -random.int(0, 10))} 10:00:00`,
    );
    insertSubLine.run(id, plan.product_id, quantity, unitPrice, plan.tax_id, amount);
  }

  while (pending.length < TARGET_INVOICES) addSubscription(true);
  for (let n = 0; n < UNBILLED_SUBSCRIPTIONS; n++) addSubscription(false);

  pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  writeInvoices(random, pending);

  const statuses = Object.groupBy(pending, (invoice) => invoice.outcome.status);
  console.log(
    `Large dataset: ${CUSTOMERS} customers, ${subId - 1} subscriptions, ${pending.length} invoices ` +
      `(${Object.entries(statuses)
        .map(([status, rows]) => `${rows.length} ${status}`)
        .join(', ')}).`,
  );
}

function writeInvoices(random, pending) {
  let invoiceId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM invoices').get().n;
  const pad = (n) => String(n).padStart(5, '0');
  const insertInvoice = db.prepare(
    `INSERT INTO invoices (id, number, subscription_id, customer_id, period_start, period_end, status,
       subtotal, tax_total, discount_total, total, due_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price,
       tax_rate_bp, discount, tax_amount, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPayment = db.prepare(
    'INSERT INTO payments (invoice_id, method, amount, paid_on, note) VALUES (?, ?, ?, ?, ?)',
  );

  for (const inv of pending) {
    const id = invoiceId++;
    const { status, paidOn, partial } = inv.outcome;
    insertInvoice.run(
      id,
      `INV-${pad(id)}`,
      inv.subscriptionId,
      inv.customer.id,
      inv.periodStart,
      inv.periodEnd,
      status,
      inv.amount,
      inv.tax,
      inv.discount,
      inv.total,
      inv.dueDate,
      inv.createdAt,
    );
    insertLine.run(
      id,
      inv.plan.product_id,
      `${inv.plan.product_name} (${inv.periodStart} to ${inv.periodEnd})`,
      inv.quantity,
      inv.unitPrice,
      inv.plan.rate_bp,
      inv.discount,
      inv.tax,
      inv.amount - inv.discount,
    );

    if (paidOn) {
      const method = random.weighted([
        ['upi', 45],
        ['bank_transfer', 25],
        ['card', 22],
        ['cash', 8],
      ]);
      const paid = partial ? Math.round(inv.total * random.pick([0.3, 0.4, 0.5, 0.6])) : inv.total;
      // A payment can't be dated before the invoice existed.
      const date = paidOn < inv.periodStart ? inv.periodStart : paidOn;
      insertPayment.run(
        id,
        method,
        paid,
        date,
        partial ? 'Part payment, balance pending' : fakePaymentNote(random),
      );
    }
  }
}
