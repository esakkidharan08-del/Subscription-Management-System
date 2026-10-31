import { db, transaction } from '../db/index.js';
import { recordAudit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { formatPaise } from '../lib/money.js';
import { pagedResult } from '../lib/pagination.js';
import { getInvoice } from './invoiceService.js';

export function recordPayment(invoiceId, { method, amount, paid_on, note }, actor) {
  return transaction(() => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) throw notFound('Invoice');
    if (invoice.status === 'paid') throw badRequest('This invoice is already paid');
    if (invoice.status !== 'confirmed')
      throw badRequest('Only confirmed invoices can take payments');

    const { paid } = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?')
      .get(invoiceId);
    const balance = invoice.total - paid;
    if (amount > balance) {
      throw badRequest(`Payment is more than the balance due of ${formatPaise(balance)}`);
    }

    db.prepare(
      'INSERT INTO payments (invoice_id, method, amount, paid_on, note) VALUES (?, ?, ?, ?, ?)',
    ).run(invoiceId, method, amount, paid_on, note);
    recordAudit(actor, 'payment_recorded', 'invoice', invoiceId, { method, amount });

    // Paid only when the payments add up to the full total, never on a partial payment.
    if (paid + amount === invoice.total) {
      db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(invoiceId);
    }
    return getInvoice(invoiceId);
  });
}

function paymentFilters({ from, to, method, customerId, search }) {
  const filters = [];
  const params = [];
  if (from) {
    filters.push('pay.paid_on >= ?');
    params.push(from);
  }
  if (to) {
    filters.push('pay.paid_on <= ?');
    params.push(to);
  }
  if (method) {
    filters.push('pay.method = ?');
    params.push(method);
  }
  if (customerId) {
    filters.push('i.customer_id = ?');
    params.push(customerId);
  }
  if (search) {
    filters.push('(u.name LIKE ? OR i.number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  return { where: filters.length ? `WHERE ${filters.join(' AND ')}` : '', params };
}

const PAYMENT_JOINS = `
  FROM payments pay
  JOIN invoices i ON i.id = pay.invoice_id
  JOIN users u ON u.id = i.customer_id`;

// The summary is computed over the whole filtered set, not just the page shown,
// so the totals at the top always match the filters.
export function listPayments(criteria, paging) {
  const { where, params } = paymentFilters(criteria);

  const summary = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(pay.amount), 0) AS total ${PAYMENT_JOINS} ${where}`,
    )
    .get(...params);
  const byMethod = db
    .prepare(
      `SELECT pay.method, COUNT(*) AS count, SUM(pay.amount) AS total ${PAYMENT_JOINS} ${where}
       GROUP BY pay.method ORDER BY total DESC`,
    )
    .all(...params);
  const rows = db
    .prepare(
      `SELECT pay.*, i.number AS invoice_number, i.customer_id, u.name AS customer_name
       ${PAYMENT_JOINS} ${where}
       ORDER BY pay.paid_on DESC, pay.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, paging.limit, paging.offset);

  return { ...pagedResult(rows, summary.count, paging), summary: { ...summary, byMethod } };
}
