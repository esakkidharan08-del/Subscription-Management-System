import { db, transaction } from '../db/index.js';
import { addDays, today } from '../lib/dates.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { pagedResult } from '../lib/pagination.js';
import { listUsableDiscounts } from './discountService.js';
import { buildInvoice } from './invoiceMath.js';
import { nextNumber } from './numbering.js';

const PAYMENT_TERM_DAYS = { immediate: 0, net_15: 15, net_30: 30 };

// Overdue is worked out at read time from the due date, never stored, so it can't go stale.
const INVOICE_COLUMNS = `
  i.*, u.name AS customer_name, s.number AS subscription_number,
  (SELECT COALESCE(SUM(pay.amount), 0) FROM payments pay WHERE pay.invoice_id = i.id) AS amount_paid,
  CASE WHEN i.status = 'confirmed' AND i.due_date < ? THEN 1 ELSE 0 END AS is_overdue`;

const INVOICE_JOINS = `
  FROM invoices i
  JOIN users u ON u.id = i.customer_id
  JOIN subscriptions s ON s.id = i.subscription_id`;

function subscriptionLinesForBilling(subscriptionId) {
  return db
    .prepare(
      `SELECT sl.product_id, sl.quantity, sl.unit_price, p.name AS product_name,
         COALESCE(t.rate_bp, 0) AS rate_bp
       FROM subscription_lines sl
       JOIN products p ON p.id = sl.product_id
       LEFT JOIN taxes t ON t.id = sl.tax_id
       WHERE sl.subscription_id = ? ORDER BY sl.id`,
    )
    .all(subscriptionId);
}

function markDiscountsUsed(discountIds) {
  const use = db.prepare(
    `UPDATE discounts SET times_used = times_used + 1
     WHERE id = ? AND (usage_limit IS NULL OR times_used < usage_limit)`,
  );
  for (const id of discountIds) {
    // Rolls back the whole invoice if the last use was taken in the meantime.
    if (use.run(id).changes === 0) throw conflict('A discount ran out while billing, please retry');
  }
}

// Must run inside the billing transaction so the invoice, its lines and the
// discount usage are saved together or not at all.
export function createInvoiceForPeriod(subscription, periodStart, periodEnd) {
  const lines = subscriptionLinesForBilling(subscription.id).map((line) => ({
    ...line,
    description: `${line.product_name} (${periodStart} to ${periodEnd})`,
  }));
  const invoice = buildInvoice(lines, listUsableDiscounts(periodStart), periodStart);
  const dueDate = addDays(periodStart, PAYMENT_TERM_DAYS[subscription.payment_terms] ?? 0);
  // A fully discounted invoice has nothing to collect.
  const status = invoice.total === 0 ? 'paid' : 'confirmed';

  const result = db
    .prepare(
      `INSERT INTO invoices (number, subscription_id, customer_id, period_start, period_end, status,
         subtotal, tax_total, discount_total, total, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      nextNumber('invoices', 'INV'),
      subscription.id,
      subscription.customer_id,
      periodStart,
      periodEnd,
      status,
      invoice.subtotal,
      invoice.tax_total,
      invoice.discount_total,
      invoice.total,
      dueDate,
    );
  const invoiceId = Number(result.lastInsertRowid);

  const insertLine = db.prepare(
    `INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, tax_amount, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const line of invoice.lines) {
    insertLine.run(
      invoiceId,
      line.product_id,
      line.description,
      line.quantity,
      line.unit_price,
      line.tax_amount,
      line.amount,
    );
  }

  markDiscountsUsed(invoice.appliedDiscountIds);
  return invoiceId;
}

function assertCanView(invoice, viewer) {
  if (viewer?.role === 'customer' && invoice.customer_id !== viewer.id) throw notFound('Invoice');
}

export function getInvoice(id, viewer) {
  const invoice = db.prepare(`SELECT ${INVOICE_COLUMNS} ${INVOICE_JOINS} WHERE i.id = ?`).get(today(), id);
  if (!invoice) throw notFound('Invoice');
  assertCanView(invoice, viewer);

  const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id').all(id);
  const payments = db
    .prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on, id')
    .all(id);
  return { ...invoice, lines, payments, balance: invoice.total - invoice.amount_paid };
}

export function listInvoices({ status, overdue, customerId, subscriptionId, search }, paging) {
  const asOf = today();
  const filters = [];
  const params = [];

  if (overdue) {
    filters.push("i.status = 'confirmed' AND i.due_date < ?");
    params.push(asOf);
  } else if (status) {
    filters.push('i.status = ?');
    params.push(status);
  }
  if (customerId) {
    filters.push('i.customer_id = ?');
    params.push(customerId);
  }
  if (subscriptionId) {
    filters.push('i.subscription_id = ?');
    params.push(subscriptionId);
  }
  if (search) {
    filters.push('i.number LIKE ?');
    params.push(`%${search}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM invoices i ${where}`).get(...params);
  const rows = db
    .prepare(
      `SELECT ${INVOICE_COLUMNS} ${INVOICE_JOINS} ${where}
       ORDER BY i.period_start DESC, i.id DESC LIMIT ? OFFSET ?`,
    )
    .all(asOf, ...params, paging.limit, paging.offset);

  return pagedResult(rows, total, paging);
}

export function confirmInvoice(id) {
  return transaction(() => {
    const invoice = getInvoice(id);
    if (invoice.status !== 'draft') throw badRequest(`A ${invoice.status} invoice cannot be confirmed`);
    db.prepare("UPDATE invoices SET status = 'confirmed' WHERE id = ?").run(id);
    return getInvoice(id);
  });
}

export function cancelInvoice(id) {
  return transaction(() => {
    const invoice = getInvoice(id);
    if (!['draft', 'confirmed'].includes(invoice.status)) {
      throw badRequest(`A ${invoice.status} invoice cannot be cancelled`);
    }
    if (invoice.payments.length > 0) {
      throw badRequest('This invoice has payments recorded and cannot be cancelled');
    }
    db.prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ?").run(id);
    return getInvoice(id);
  });
}
