import { db } from '../db/index.js';
import { addMonths, today } from '../lib/dates.js';

// Everything here is aggregated in SQL so the dashboard stays fast with tens of
// thousands of invoices: JavaScript only ever sees the summed rows.

// Recurring revenue normalised to one month, whatever the billing period.
const MONTHLY_FACTOR = `
  CASE pl.billing_period
    WHEN 'daily' THEN 30.0
    WHEN 'weekly' THEN 52.0 / 12
    WHEN 'monthly' THEN 1.0
    WHEN 'yearly' THEN 1.0 / 12
  END`;

function recurringRevenue() {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(sl.amount * ${MONTHLY_FACTOR}), 0) AS mrr, COUNT(DISTINCT s.id) AS active
       FROM subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       JOIN subscription_lines sl ON sl.subscription_id = s.id
       WHERE s.status = 'active'`,
    )
    .get();
  return { mrr: Math.round(row.mrr), activeSubscriptions: row.active };
}

function subscriptionsByStatus() {
  const rows = db.prepare('SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status').all();
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

function receivables(asOf) {
  return db
    .prepare(
      `SELECT
         COUNT(*) AS open_count,
         COALESCE(SUM(i.total - COALESCE(p.paid, 0)), 0) AS outstanding,
         COALESCE(SUM(CASE WHEN i.due_date < ? THEN 1 ELSE 0 END), 0) AS overdue_count,
         COALESCE(SUM(CASE WHEN i.due_date < ? THEN i.total - COALESCE(p.paid, 0) ELSE 0 END), 0) AS overdue
       FROM invoices i
       LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p
         ON p.invoice_id = i.id
       WHERE i.status = 'confirmed'`,
    )
    .get(asOf, asOf);
}

// Twelve calendar months, oldest first, with zero-filled gaps so a quiet month
// still shows as a month rather than vanishing from the chart.
function monthlyRevenue(asOf) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(asOf, i - 11).slice(0, 7));
  const from = `${months[0]}-01`;

  const billed = db
    .prepare(
      `SELECT substr(period_start, 1, 7) AS month, SUM(total) AS amount
       FROM invoices WHERE period_start >= ? AND status <> 'cancelled' GROUP BY month`,
    )
    .all(from);
  const collected = db
    .prepare(
      `SELECT substr(paid_on, 1, 7) AS month, SUM(amount) AS amount
       FROM payments WHERE paid_on >= ? GROUP BY month`,
    )
    .all(from);

  const byMonth = (rows) => new Map(rows.map((row) => [row.month, row.amount]));
  const billedMap = byMonth(billed);
  const collectedMap = byMonth(collected);
  return months.map((month) => ({
    month,
    billed: billedMap.get(month) ?? 0,
    collected: collectedMap.get(month) ?? 0,
  }));
}

function topCustomers() {
  return db
    .prepare(
      `SELECT u.id, u.name, SUM(pay.amount) AS paid
       FROM payments pay
       JOIN invoices i ON i.id = pay.invoice_id
       JOIN users u ON u.id = i.customer_id
       GROUP BY u.id ORDER BY paid DESC LIMIT 5`,
    )
    .all();
}

function overdueInvoices(asOf) {
  return db
    .prepare(
      `SELECT i.id, i.number, i.due_date, u.name AS customer_name,
         i.total - COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS balance
       FROM invoices i JOIN users u ON u.id = i.customer_id
       WHERE i.status = 'confirmed' AND i.due_date < ?
       ORDER BY i.due_date LIMIT 8`,
    )
    .all(asOf);
}

export function getDashboard() {
  const started = performance.now();
  const asOf = today();

  const dashboard = {
    asOf,
    ...recurringRevenue(),
    subscriptionsByStatus: subscriptionsByStatus(),
    receivables: receivables(asOf),
    monthlyRevenue: monthlyRevenue(asOf),
    topCustomers: topCustomers(),
    overdueInvoices: overdueInvoices(asOf),
  };
  // Reported so the demo can state how long the numbers took on the large seed.
  dashboard.queryMs = Math.round((performance.now() - started) * 10) / 10;
  return dashboard;
}

export function getCustomerSummary(customerId) {
  const asOf = today();
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM subscriptions WHERE customer_id = ? AND status = 'active') AS active_subscriptions,
         COALESCE(SUM(i.total - COALESCE(p.paid, 0)), 0) AS balance_due,
         COALESCE(SUM(CASE WHEN i.due_date < ? THEN 1 ELSE 0 END), 0) AS overdue_count
       FROM invoices i
       LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p
         ON p.invoice_id = i.id
       WHERE i.customer_id = ? AND i.status = 'confirmed'`,
    )
    .get(customerId, asOf, customerId);
}
