import { nextNumber, withTransaction } from '../db/index.js';
import { addDays, addPeriod, today } from '../lib/dates.js';
import { chooseDiscounts } from './discounts.js';
import { calculateInvoiceTotals } from './tax.js';

function findTaxRate(db, line) {
  if (line.tax_id) {
    return db.prepare('SELECT rate_bp FROM taxes WHERE id = ?').get(line.tax_id)?.rate_bp ?? 0;
  }
  // A rule for the exact product beats a rule for its product type.
  const rule = db
    .prepare(
      `SELECT t.rate_bp FROM tax_rules r JOIN taxes t ON t.id = r.tax_id
       WHERE r.product_id = ? OR (r.product_id IS NULL AND r.product_type = ?)
       ORDER BY (r.product_id IS NOT NULL) DESC, r.priority DESC
       LIMIT 1`,
    )
    .get(line.product_id, line.product_type);
  return rule?.rate_bp ?? 0;
}

function loadLines(db, subscriptionId) {
  return db
    .prepare(
      `SELECT sl.*, pr.name AS product_name, pr.type AS product_type
       FROM subscription_lines sl JOIN products pr ON pr.id = sl.product_id
       WHERE sl.subscription_id = ?`,
    )
    .all(subscriptionId)
    .map((line) => ({ ...line, rateBp: findTaxRate(db, line) }));
}

function createInvoiceForPeriod(db, subscription, periodStart) {
  const nextPeriodStart = addPeriod(periodStart, subscription.billing_period);
  const advance = () =>
    db.prepare('UPDATE subscriptions SET next_billing_date = ? WHERE id = ?').run(nextPeriodStart, subscription.id);

  const alreadyBilled = db
    .prepare('SELECT 1 FROM invoices WHERE subscription_id = ? AND period_start = ?')
    .get(subscription.id, periodStart);
  if (alreadyBilled) {
    advance();
    return false;
  }

  const lines = loadLines(db, subscription.id);
  const discounts = db.prepare('SELECT * FROM discounts WHERE active = 1').all();
  const { lineDiscounts, orderDiscount, appliedIds } = chooseDiscounts(discounts, lines, periodStart);
  const totals = calculateInvoiceTotals(
    lines.map((line) => ({ amount: line.amount, rateBp: line.rateBp, discount: lineDiscounts.get(line.id) ?? 0 })),
    orderDiscount,
  );

  const { lastInsertRowid: invoiceId } = db
    .prepare(
      `INSERT INTO invoices (number, subscription_id, customer_id, period_start, period_end, status,
                             subtotal, tax_total, discount_total, total, due_date)
       VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?)`,
    )
    .run(
      nextNumber(db, 'invoices', 'INV'),
      subscription.id,
      subscription.customer_id,
      periodStart,
      addDays(nextPeriodStart, -1),
      totals.subtotal,
      totals.taxTotal,
      totals.discountTotal,
      totals.total,
      addDays(periodStart, subscription.payment_terms),
    );

  const insertLine = db.prepare(
    `INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, tax_rate_bp, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const line of lines) {
    insertLine.run(invoiceId, line.product_id, line.product_name, line.quantity, line.unit_price, line.rateBp, line.amount);
  }

  const markUsed = db.prepare('UPDATE discounts SET times_used = times_used + 1 WHERE id = ?');
  for (const discountId of appliedIds) markUsed.run(discountId);

  advance();
  return true;
}

/**
 * Bills every active subscription due on or before `asOf`, catching up missed periods.
 * Safe to re-run: a period that already has an invoice is skipped.
 */
export function runBilling(db, asOf = today()) {
  const summary = { invoiced: 0, skipped: 0, closed: 0 };
  const due = db
    .prepare(
      `SELECT s.*, p.billing_period, p.end_behavior
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'active' AND s.next_billing_date <= ?`,
    )
    .all(asOf);

  for (const subscription of due) {
    let periodStart = subscription.next_billing_date;
    let expiry = subscription.expiry_date;

    while (periodStart <= asOf) {
      if (expiry && periodStart > expiry) {
        if (subscription.end_behavior === 'auto_close') {
          db.prepare("UPDATE subscriptions SET status = 'closed' WHERE id = ?").run(subscription.id);
          summary.closed++;
          break;
        }
        if (subscription.end_behavior !== 'renewable') {
          summary.skipped++;
          break;
        }
        expiry = addPeriod(expiry, subscription.billing_period);
        db.prepare('UPDATE subscriptions SET expiry_date = ? WHERE id = ?').run(expiry, subscription.id);
      }

      const created = withTransaction(db, () => createInvoiceForPeriod(db, subscription, periodStart));
      if (created) summary.invoiced++;
      else summary.skipped++;
      periodStart = addPeriod(periodStart, subscription.billing_period);
    }
  }
  return summary;
}
