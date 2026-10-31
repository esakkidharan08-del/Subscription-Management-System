import { db } from '../db/index.js';
import { addDays, addMonths, today } from '../lib/dates.js';

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
  const rows = db
    .prepare('SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status')
    .all();
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

// The chosen number of calendar months, oldest first, with zero-filled gaps so a quiet month
// still shows as a month rather than vanishing from the chart.
function monthlyRevenue(asOf, count) {
  const months = Array.from({ length: count }, (_, i) =>
    addMonths(asOf, i - count + 1).slice(0, 7),
  );
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

// Unpaid balances by how late they are. Every bucket is always returned, even at
// zero, so the screen can draw the full ladder and a reader sees nothing is 90+ late.
const AGEING_BUCKETS = [
  { key: 'not_due', label: 'Not yet due' },
  { key: 'd1_30', label: '1–30 days late' },
  { key: 'd31_60', label: '31–60 days late' },
  { key: 'd61_90', label: '61–90 days late' },
  { key: 'd90_plus', label: 'Over 90 days late' },
];

function receivablesAgeing(asOf) {
  const rows = db
    .prepare(
      `SELECT
         CASE
           WHEN i.due_date >= ? THEN 'not_due'
           WHEN julianday(?) - julianday(i.due_date) <= 30 THEN 'd1_30'
           WHEN julianday(?) - julianday(i.due_date) <= 60 THEN 'd31_60'
           WHEN julianday(?) - julianday(i.due_date) <= 90 THEN 'd61_90'
           ELSE 'd90_plus'
         END AS bucket,
         COUNT(*) AS count,
         SUM(i.total - COALESCE(p.paid, 0)) AS balance
       FROM invoices i
       LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p
         ON p.invoice_id = i.id
       WHERE i.status = 'confirmed'
       GROUP BY bucket`,
    )
    .all(asOf, asOf, asOf, asOf);
  const byKey = new Map(rows.map((row) => [row.bucket, row]));
  return AGEING_BUCKETS.map(({ key, label }) => ({
    key,
    label,
    count: byKey.get(key)?.count ?? 0,
    balance: byKey.get(key)?.balance ?? 0,
  }));
}

// What the next billing runs will raise, before tax, so staff know what is coming.
function upcomingBilling(asOf) {
  const until = addDays(asOf, 7);
  return db
    .prepare(
      `SELECT COUNT(DISTINCT s.id) AS subscriptions, COALESCE(SUM(sl.amount), 0) AS amount
       FROM subscriptions s
       JOIN subscription_lines sl ON sl.subscription_id = s.id
       WHERE s.status = 'active' AND s.paused_at IS NULL
         AND s.next_billing_date > ? AND s.next_billing_date <= ?`,
    )
    .get(asOf, until);
}

export const DASHBOARD_PERIODS = [3, 6, 12, 24];

// months is the reporting window for the chart and its totals; the balances
// (outstanding, overdue, ageing) are always as of today.
export function getDashboard({ months = 12 } = {}) {
  const started = performance.now();
  const asOf = today();

  const dashboard = {
    asOf,
    ...recurringRevenue(),
    subscriptionsByStatus: subscriptionsByStatus(),
    receivables: receivables(asOf),
    ageing: receivablesAgeing(asOf),
    upcoming: upcomingBilling(asOf),
    months,
    monthlyRevenue: monthlyRevenue(asOf, months),
    topCustomers: topCustomers(),
    overdueInvoices: overdueInvoices(asOf),
  };
  dashboard.periodTotals = {
    billed: dashboard.monthlyRevenue.reduce((sum, m) => sum + m.billed, 0),
    collected: dashboard.monthlyRevenue.reduce((sum, m) => sum + m.collected, 0),
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
