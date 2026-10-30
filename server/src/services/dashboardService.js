import { addMonths, today } from '../lib/dates.js';

export function getDashboard(db, asOf = today()) {
  const subscriptionsByStatus = db
    .prepare('SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status')
    .all();

  const invoiceTotals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'confirmed' THEN total END), 0) AS confirmed_total,
         COALESCE(SUM(CASE WHEN status = 'confirmed' AND due_date < ? THEN 1 END), 0) AS overdue_count,
         COALESCE(SUM(CASE WHEN status = 'confirmed' AND due_date < ? THEN total END), 0) AS overdue_total
       FROM invoices`,
    )
    .get(asOf, asOf);

  const { paid_on_open } = db
    .prepare(
      `SELECT COALESCE(SUM(p.amount), 0) AS paid_on_open
       FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE i.status = 'confirmed'`,
    )
    .get();

  const sixMonthsAgo = `${addMonths(asOf, -5).slice(0, 7)}-01`;
  const revenueByMonth = db
    .prepare(
      `SELECT substr(paid_on, 1, 7) AS month, SUM(amount) AS amount
       FROM payments WHERE paid_on >= ?
       GROUP BY month ORDER BY month`,
    )
    .all(sixMonthsAgo);

  return {
    asOf,
    subscriptionsByStatus,
    outstanding: invoiceTotals.confirmed_total - paid_on_open,
    overdueCount: invoiceTotals.overdue_count,
    overdueTotal: invoiceTotals.overdue_total,
    revenueByMonth,
  };
}
