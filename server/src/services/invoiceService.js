import { config } from '../config.js';
import { db, transaction } from '../db/index.js';
import { recordAudit } from '../lib/audit.js';
import { addDays, today } from '../lib/dates.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { pagedResult } from '../lib/pagination.js';
import { listUsableDiscounts } from './discountService.js';
import { buildInvoice } from './invoiceMath.js';
import { nextNumber } from './numbering.js';
import { calculateTaxes } from './tax.js';
import { sendMail } from '../lib/mailer.js';
import { formatPaise } from '../lib/money.js';

const PAYMENT_TERM_DAYS = { immediate: 0, net_15: 15, net_30: 30 };

// Overdue is worked out at read time from the due date, never stored, so it can't go stale.
const INVOICE_COLUMNS = `
  i.*, u.name AS customer_name, u.email AS customer_email, s.number AS subscription_number,
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
         v.attribute AS variant_attribute, v.value AS variant_value,
         COALESCE(t.rate_bp, 0) AS rate_bp
       FROM subscription_lines sl
       JOIN products p ON p.id = sl.product_id
       LEFT JOIN product_variants v ON v.id = sl.variant_id
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
    description: `${line.product_name}${line.variant_value ? ` · ${line.variant_attribute}: ${line.variant_value}` : ''} (${periodStart} to ${periodEnd})`,
  }));
  const invoice = buildInvoice(lines, listUsableDiscounts(periodStart), periodStart);
  const dueDate = addDays(periodStart, PAYMENT_TERM_DAYS[subscription.payment_terms] ?? 0);
  // A fully discounted invoice has nothing to collect. Otherwise it is confirmed
  // straight away, or left as a draft for staff to review when auto-confirm is off.
  let status = config.autoConfirmInvoices ? 'confirmed' : 'draft';
  if (invoice.total === 0) status = 'paid';

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
    `INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price,
       tax_rate_bp, discount, tax_amount, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  invoice.lines.forEach((line, i) => {
    insertLine.run(
      invoiceId,
      line.product_id,
      line.description,
      line.quantity,
      line.unit_price,
      lines[i].rate_bp,
      line.discount,
      line.tax_amount,
      line.amount,
    );
  });

  markDiscountsUsed(invoice.appliedDiscountIds);
  return invoiceId;
}

function assertCanView(invoice, viewer) {
  if (viewer?.role === 'customer' && invoice.customer_id !== viewer.id) throw notFound('Invoice');
}

export function getInvoice(id, viewer) {
  const invoice = db
    .prepare(`SELECT ${INVOICE_COLUMNS} ${INVOICE_JOINS} WHERE i.id = ?`)
    .get(today(), id);
  if (!invoice) throw notFound('Invoice');
  assertCanView(invoice, viewer);

  const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id').all(id);
  const payments = db
    .prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on, id')
    .all(id);
  return { ...invoice, lines, payments, balance: invoice.total - invoice.amount_paid };
}

function invoiceFilters({ status, overdue, customerId, subscriptionId, search }, asOf) {
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

  return { where: filters.length ? `WHERE ${filters.join(' AND ')}` : '', params };
}

export function listInvoices(criteria, paging) {
  const asOf = today();
  const { where, params } = invoiceFilters(criteria, asOf);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM invoices i ${where}`).get(...params);
  const rows = db
    .prepare(
      `SELECT ${INVOICE_COLUMNS} ${INVOICE_JOINS} ${where}
       ORDER BY i.period_start DESC, i.id DESC LIMIT ? OFFSET ?`,
    )
    .all(asOf, ...params, paging.limit, paging.offset);

  return pagedResult(rows, total, paging);
}

const CSV_COLUMNS = [
  'number',
  'customer_name',
  'subscription_number',
  'period_start',
  'period_end',
  'status',
  'due_date',
  'subtotal',
  'discount_total',
  'tax_total',
  'total',
  'amount_paid',
];

// Quotes every field and doubles inner quotes. A leading = + - @ is prefixed so
// a spreadsheet won't run a customer name as a formula.
function csvField(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// Money is written in rupees with two decimals, since that is what accounts expect.
const MONEY_COLUMNS = new Set(['subtotal', 'discount_total', 'tax_total', 'total', 'amount_paid']);

// A generator over a SQLite iterator, so a 50,000 row export is streamed rather
// than built in memory.
export function* exportInvoicesCsv(criteria) {
  const asOf = today();
  const { where, params } = invoiceFilters(criteria, asOf);
  yield `${[...CSV_COLUMNS, 'overdue'].join(',')}\n`;

  const rows = db
    .prepare(
      `SELECT ${INVOICE_COLUMNS} ${INVOICE_JOINS} ${where} ORDER BY i.period_start DESC, i.id DESC`,
    )
    .iterate(asOf, ...params);
  for (const row of rows) {
    const fields = CSV_COLUMNS.map((column) =>
      csvField(MONEY_COLUMNS.has(column) ? (row[column] / 100).toFixed(2) : row[column]),
    );
    fields.push(row.is_overdue ? '"yes"' : '"no"');
    yield `${fields.join(',')}\n`;
  }
}

// Only drafts can change. Once confirmed, the invoice is what the customer was
// sent, so corrections go through cancelling and re-billing instead.
export function updateDraftInvoice(id, { due_date, lines }, actor) {
  return transaction(() => {
    const invoice = getInvoice(id);
    if (invoice.status !== 'draft') {
      throw badRequest(`A ${invoice.status} invoice cannot be edited. Only drafts can change.`);
    }

    const changes = new Map(lines.map((line) => [line.id, line]));
    for (const lineId of changes.keys()) {
      if (!invoice.lines.some((line) => line.id === lineId)) {
        throw badRequest(`Line ${lineId} is not on this invoice`);
      }
    }

    const edited = invoice.lines.map((line) => {
      const change = changes.get(line.id) ?? {};
      const quantity = change.quantity ?? line.quantity;
      const unitPrice = change.unit_price ?? line.unit_price;
      const gross = quantity * unitPrice;
      // The discount stays as billed, but never more than the new line amount.
      const discount = Math.min(line.discount, gross);
      return {
        ...line,
        description: change.description ?? line.description,
        quantity,
        unit_price: unitPrice,
        gross,
        discount,
        amount: gross - discount,
      };
    });

    const { lineTaxes, taxTotal } = calculateTaxes(
      edited.map((line) => ({ amount: line.amount, rate_bp: line.tax_rate_bp })),
    );
    const updateLine = db.prepare(
      `UPDATE invoice_lines SET description = ?, quantity = ?, unit_price = ?, discount = ?,
         tax_amount = ?, amount = ? WHERE id = ?`,
    );
    edited.forEach((line, i) => {
      updateLine.run(
        line.description,
        line.quantity,
        line.unit_price,
        line.discount,
        lineTaxes[i],
        line.amount,
        line.id,
      );
    });

    const subtotal = edited.reduce((sum, line) => sum + line.gross, 0);
    const discountTotal = edited.reduce((sum, line) => sum + line.discount, 0);
    db.prepare(
      `UPDATE invoices SET subtotal = ?, discount_total = ?, tax_total = ?, total = ?, due_date = ?
       WHERE id = ?`,
    ).run(
      subtotal,
      discountTotal,
      taxTotal,
      subtotal - discountTotal + taxTotal,
      due_date ?? invoice.due_date,
      id,
    );

    recordAudit(actor, 'invoice_edited', 'invoice', id, { lines: lines.length });
    return getInvoice(id);
  });
}

export function confirmInvoice(id, actor) {
  return transaction(() => {
    const invoice = getInvoice(id);
    if (invoice.status !== 'draft')
      throw badRequest(`A ${invoice.status} invoice cannot be confirmed`);
    db.prepare("UPDATE invoices SET status = 'confirmed' WHERE id = ?").run(id);
    recordAudit(actor, 'invoice_confirmed', 'invoice', id);
    return getInvoice(id);
  });
}

export function cancelInvoice(id, actor) {
  return transaction(() => {
    const invoice = getInvoice(id);
    if (!['draft', 'confirmed'].includes(invoice.status)) {
      throw badRequest(`A ${invoice.status} invoice cannot be cancelled`);
    }
    if (invoice.payments.length > 0) {
      throw badRequest('This invoice has payments recorded and cannot be cancelled');
    }
    db.prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ?").run(id);
    recordAudit(actor, 'invoice_cancelled', 'invoice', id, { total: invoice.total });
    return getInvoice(id);
  });
}

// Emails the invoice to the customer's registered address through the same
// mailer as reset links (the console, when running offline). A draft is not
// sent: the customer only ever receives confirmed figures.
export async function sendInvoice(id, actor) {
  const invoice = getInvoice(id);
  if (!['confirmed', 'paid'].includes(invoice.status)) {
    throw badRequest(`A ${invoice.status} invoice cannot be sent. Confirm it first.`);
  }

  const rupees = (paise) => formatPaise(paise);
  const lines = invoice.lines
    .map(
      (line) =>
        `  ${line.description}  ×${line.quantity}  ${rupees(line.amount + line.tax_amount)}`,
    )
    .join('\n');
  await sendMail({
    to: invoice.customer_email,
    subject: `Invoice ${invoice.number} from Brightloop Software`,
    text:
      `Hi ${invoice.customer_name},\n\n` +
      `Here is invoice ${invoice.number} for ${invoice.period_start} to ${invoice.period_end}.\n\n` +
      `${lines}\n\nTotal ${rupees(invoice.total)}, ` +
      (invoice.balance > 0
        ? `${rupees(invoice.balance)} due by ${invoice.due_date}.`
        : 'already paid in full. Thank you.') +
      `\n\nView or pay it at ${config.clientUrl}/invoices/${invoice.id}\n`,
  });

  db.prepare("UPDATE invoices SET sent_at = datetime('now') WHERE id = ?").run(id);
  recordAudit(actor, 'invoice_sent', 'invoice', id, { to: invoice.customer_email });
  return getInvoice(id);
}
