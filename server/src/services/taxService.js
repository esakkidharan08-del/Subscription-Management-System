import { db } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { pickTaxRule } from './tax.js';

// Taxes and rules are short reference lists used for dropdowns, so they are not paged.

export function listTaxes() {
  return db.prepare('SELECT * FROM taxes ORDER BY rate_bp, name').all();
}

export function getTax(id) {
  const tax = db.prepare('SELECT * FROM taxes WHERE id = ?').get(id);
  if (!tax) throw notFound('Tax');
  return tax;
}

export function createTax({ name, rate_bp }) {
  const result = db.prepare('INSERT INTO taxes (name, rate_bp) VALUES (?, ?)').run(name, rate_bp);
  return getTax(Number(result.lastInsertRowid));
}

export function updateTax(id, { name, rate_bp }) {
  getTax(id);
  db.prepare('UPDATE taxes SET name = ?, rate_bp = ? WHERE id = ?').run(name, rate_bp, id);
  return getTax(id);
}

export function deleteTax(id) {
  getTax(id);
  const { used } = db
    .prepare('SELECT COUNT(*) AS used FROM subscription_lines WHERE tax_id = ?')
    .get(id);
  if (used > 0) throw conflict('This tax is used on subscriptions and cannot be deleted');
  db.prepare('DELETE FROM taxes WHERE id = ?').run(id);
}

export function listTaxRules() {
  return db
    .prepare(
      `SELECT r.*, t.name AS tax_name, t.rate_bp, p.name AS product_name
       FROM tax_rules r
       JOIN taxes t ON t.id = r.tax_id
       LEFT JOIN products p ON p.id = r.product_id
       ORDER BY r.priority DESC, r.id`,
    )
    .all();
}

export function createTaxRule({ tax_id, product_id, category, priority }) {
  const result = db
    .prepare('INSERT INTO tax_rules (tax_id, product_id, category, priority) VALUES (?, ?, ?, ?)')
    .run(tax_id, product_id, category, priority);
  return db.prepare('SELECT * FROM tax_rules WHERE id = ?').get(Number(result.lastInsertRowid));
}

export function deleteTaxRule(id) {
  const result = db.prepare('DELETE FROM tax_rules WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('Tax rule');
}

export function findTaxForProduct(product) {
  const rule = pickTaxRule(listTaxRules(), product);
  return rule ? getTax(rule.tax_id) : null;
}
