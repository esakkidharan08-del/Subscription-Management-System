import { withTransaction } from '../db/index.js';
import { today } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';
import { buildWhere } from '../lib/pagination.js';

// Overdue is derived on read so it never goes stale.
const OVERDUE_SQL = "(i.status = 'confirmed' AND i.due_date < ?)";

export function listInvoices(db, viewer, { status, subscriptionId, page, pageSize, offset }, asOf = today()) {
  const isOverdueFilter = status === 'overdue';
  const { clause, params } = buildWhere([
    ['i.customer_id = ?', viewer.role === 'customer' ? viewer.id : null],
    ['i.subscription_id = ?', subscriptionId],
    ['i.status = ?', isOverdueFilter ? null : status],
    [OVERDUE_SQL, isOverdueFilter ? asOf : null],
  ]);

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM invoices i ${clause}`).get(...params);
  const items = db
    .prepare(
      `SELECT i.id, i.number, i.status, i.period_start, i.period_end, i.total, i.due_date,
              s.number AS subscription_number, u.name AS customer_name,
              ${OVERDUE_SQL} AS is_overdue
       FROM invoices i
       JOIN subscriptions s ON s.id = i.subscription_id
       JOIN users u ON u.id = i.customer_id
       ${clause}
       ORDER BY i.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(asOf, ...params, pageSize, offset);
  return { items, total, page, pageSize };
}

export function getInvoice(db, id, viewer, asOf = today()) {
  const invoice = db
    .prepare(
      `SELECT i.*, s.number AS subscription_number, u.name AS customer_name, u.email AS customer_email,
              ${OVERDUE_SQL} AS is_overdue
       FROM invoices i
       JOIN subscriptions s ON s.id = i.subscription_id
       JOIN users u ON u.id = i.customer_id
       WHERE i.id = ?`,
    )
    .get(asOf, id);

  if (!invoice || (viewer?.role === 'customer' && invoice.customer_id !== viewer.id)) {
    throw new AppError(404, 'Invoice not found');
  }

  invoice.lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(id);
  invoice.payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on').all(id);
  invoice.amount_paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  invoice.balance = invoice.total - invoice.amount_paid;
  return invoice;
}

export function recordPayment(db, invoiceId, payment) {
  return withTransaction(db, () => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) throw new AppError(404, 'Invoice not found');
    if (invoice.status !== 'confirmed') {
      throw new AppError(409, 'Payments can only be added to confirmed invoices');
    }

    const { paid } = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?')
      .get(invoiceId);
    const balance = invoice.total - paid;
    if (payment.amount > balance) {
      throw new AppError(400, `Payment is more than the remaining balance of ${balance} paise`);
    }

    db.prepare('INSERT INTO payments (invoice_id, method, amount, paid_on, note) VALUES (?, ?, ?, ?, ?)').run(
      invoiceId,
      payment.method,
      payment.amount,
      payment.paid_on,
      payment.note,
    );
    if (paid + payment.amount === invoice.total) {
      db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(invoiceId);
    }
    return getInvoice(db, invoiceId);
  });
}

export function cancelInvoice(db, invoiceId) {
  const invoice = getInvoice(db, invoiceId);
  if (!['draft', 'confirmed'].includes(invoice.status)) {
    throw new AppError(409, `A ${invoice.status} invoice cannot be cancelled`);
  }
  if (invoice.payments.length > 0) {
    throw new AppError(409, 'This invoice has payments and cannot be cancelled');
  }
  db.prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ?").run(invoiceId);
  return getInvoice(db, invoiceId);
}
