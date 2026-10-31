import { addDays, addMonths, today } from '../lib/dates.js';
import { hashPassword } from '../services/authService.js';
import { db } from './index.js';

const CUSTOMERS = 500;
const SUBSCRIPTIONS = 5000;
const MONTHS_BILLED = 10;

// Writes rows directly instead of going through the billing run: the point is a
// realistic volume for timing pages, and 50,000 invoices one by one would take minutes.
export function seedLargeDataset() {
  const { existing } = db
    .prepare("SELECT COUNT(*) AS existing FROM users WHERE email LIKE 'bulk%@example.com'")
    .get();
  if (existing > 0) {
    console.log('Large dataset already present, skipping.');
    return;
  }

  const plans = db
    .prepare(
      `SELECT pl.id, pl.product_id, pl.price, p.name AS product_name, tr.tax_id, t.rate_bp
       FROM plans pl
       JOIN products p ON p.id = pl.product_id
       LEFT JOIN tax_rules tr ON tr.category = p.type
       LEFT JOIN taxes t ON t.id = tr.tax_id
       WHERE pl.billing_period = 'monthly'`,
    )
    .all();
  if (!plans.length) throw new Error('Run the normal seed first so there are monthly plans');

  // One hash for every bulk account; bcrypt on 500 passwords would dominate the run.
  const passwordHash = hashPassword('Customer@123');
  const insertUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'customer')",
  );
  const customerIds = [];
  for (let i = 1; i <= CUSTOMERS; i++) {
    const result = insertUser.run(`Bulk Customer ${i}`, `bulk${i}@example.com`, passwordHash);
    customerIds.push(Number(result.lastInsertRowid));
  }

  const firstSubId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM subscriptions').get().n;
  let invoiceId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM invoices').get().n;
  const pad = (n) => String(n).padStart(5, '0');

  const insertSub = db.prepare(
    `INSERT INTO subscriptions (id, number, customer_id, plan_id, start_date, payment_terms, status, next_billing_date)
     VALUES (?, ?, ?, ?, ?, 'net_15', 'active', ?)`,
  );
  const insertSubLine = db.prepare(
    `INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price, tax_id, amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertInvoice = db.prepare(
    `INSERT INTO invoices (id, number, subscription_id, customer_id, period_start, period_end, status,
       subtotal, tax_total, discount_total, total, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  );
  const insertInvoiceLine = db.prepare(
    `INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, tax_amount, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPayment = db.prepare(
    "INSERT INTO payments (invoice_id, method, amount, paid_on) VALUES (?, 'upi', ?, ?)",
  );

  const startOfRun = addMonths(today(), -MONTHS_BILLED);

  for (let n = 0; n < SUBSCRIPTIONS; n++) {
    const subId = firstSubId + n;
    const plan = plans[n % plans.length];
    const quantity = 1 + (n % 5);
    const customerId = customerIds[n % customerIds.length];
    const amount = plan.price * quantity;
    const tax = Math.round((amount * (plan.rate_bp ?? 0)) / 10000);

    insertSub.run(subId, `SUB-${pad(subId)}`, customerId, plan.id, startOfRun, addMonths(startOfRun, MONTHS_BILLED));
    insertSubLine.run(subId, plan.product_id, quantity, plan.price, plan.tax_id, amount);

    for (let month = 0; month < MONTHS_BILLED; month++) {
      const periodStart = addMonths(startOfRun, month);
      const periodEnd = addDays(addMonths(startOfRun, month + 1), -1);
      const dueDate = addDays(periodStart, 15);
      // Older invoices are mostly paid; the last two months leave a realistic unpaid tail.
      const paid = month < MONTHS_BILLED - 2 ? n % 10 !== 0 : n % 3 === 0;

      insertInvoice.run(
        invoiceId,
        `INV-${pad(invoiceId)}`,
        subId,
        customerId,
        periodStart,
        periodEnd,
        paid ? 'paid' : 'confirmed',
        amount,
        tax,
        amount + tax,
        dueDate,
      );
      insertInvoiceLine.run(invoiceId, plan.product_id, plan.product_name, quantity, plan.price, tax, amount);
      if (paid) insertPayment.run(invoiceId, amount + tax, dueDate);
      invoiceId += 1;
    }
  }

  console.log(
    `Large dataset: ${CUSTOMERS} customers, ${SUBSCRIPTIONS} subscriptions, ${SUBSCRIPTIONS * MONTHS_BILLED} invoices.`,
  );
}
