import { db, transaction } from '../db/index.js';
import { recordAudit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { formatPaise } from '../lib/money.js';
import { getInvoice } from './invoiceService.js';

export function recordPayment(invoiceId, { method, amount, paid_on, note }, actor) {
  return transaction(() => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) throw notFound('Invoice');
    if (invoice.status === 'paid') throw badRequest('This invoice is already paid');
    if (invoice.status !== 'confirmed') throw badRequest('Only confirmed invoices can take payments');

    const { paid } = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?')
      .get(invoiceId);
    const balance = invoice.total - paid;
    if (amount > balance) {
      throw badRequest(`Payment is more than the balance due of ${formatPaise(balance)}`);
    }

    db.prepare('INSERT INTO payments (invoice_id, method, amount, paid_on, note) VALUES (?, ?, ?, ?, ?)').run(
      invoiceId,
      method,
      amount,
      paid_on,
      note,
    );
    recordAudit(actor, 'payment_recorded', 'invoice', invoiceId, { method, amount });

    // Paid only when the payments add up to the full total, never on a partial payment.
    if (paid + amount === invoice.total) {
      db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(invoiceId);
    }
    return getInvoice(invoiceId);
  });
}
