import { db } from '../db/index.js';
import { recordAudit } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { pagedResult } from '../lib/pagination.js';

const DISCOUNT_COLUMNS = 'd.*, p.name AS product_name';
const DISCOUNT_JOIN = 'FROM discounts d LEFT JOIN products p ON p.id = d.product_id';

export function listDiscounts(paging) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM discounts').get();
  const rows = db
    .prepare(
      `SELECT ${DISCOUNT_COLUMNS} ${DISCOUNT_JOIN} ORDER BY d.active DESC, d.id DESC LIMIT ? OFFSET ?`,
    )
    .all(paging.limit, paging.offset);
  return pagedResult(rows, total, paging);
}

export function getDiscount(id) {
  const discount = db.prepare(`SELECT ${DISCOUNT_COLUMNS} ${DISCOUNT_JOIN} WHERE d.id = ?`).get(id);
  if (!discount) throw notFound('Discount');
  return discount;
}

function discountValues(d) {
  return [
    d.name,
    d.type,
    d.value,
    d.min_amount,
    d.min_quantity,
    d.scope,
    d.scope === 'product' ? d.product_id : null,
    d.starts_at,
    d.ends_at,
    d.usage_limit,
    d.active ? 1 : 0,
  ];
}

export function createDiscount(discount, actor) {
  const result = db
    .prepare(
      `INSERT INTO discounts (name, type, value, min_amount, min_quantity, scope, product_id,
         starts_at, ends_at, usage_limit, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(...discountValues(discount));
  const id = Number(result.lastInsertRowid);
  recordAudit(actor, 'discount_created', 'discount', id, { name: discount.name });
  return getDiscount(id);
}

export function updateDiscount(id, discount, actor) {
  getDiscount(id);
  db.prepare(
    `UPDATE discounts SET name = ?, type = ?, value = ?, min_amount = ?, min_quantity = ?, scope = ?,
       product_id = ?, starts_at = ?, ends_at = ?, usage_limit = ?, active = ?
     WHERE id = ?`,
  ).run(...discountValues(discount), id);
  recordAudit(actor, 'discount_updated', 'discount', id);
  return getDiscount(id);
}

// A discount that has been used stays for the invoice history and is switched off instead.
export function deleteDiscount(id, actor) {
  const discount = getDiscount(id);
  if (discount.times_used > 0) {
    db.prepare('UPDATE discounts SET active = 0 WHERE id = ?').run(id);
    recordAudit(actor, 'discount_deactivated', 'discount', id);
    return { deactivated: true };
  }
  db.prepare('DELETE FROM discounts WHERE id = ?').run(id);
  recordAudit(actor, 'discount_deleted', 'discount', id, { name: discount.name });
  return { deleted: true };
}

// The SQL filter keeps the list short; discounts.js re-checks each one as the real rule.
export function listUsableDiscounts(onDate) {
  return db
    .prepare(
      `SELECT * FROM discounts
       WHERE active = 1
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
         AND (usage_limit IS NULL OR times_used < usage_limit)`,
    )
    .all(onDate, onDate);
}
