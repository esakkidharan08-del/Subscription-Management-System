import { db, placeholders } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { pagedResult } from '../lib/pagination.js';

function parseLines(template) {
  return { ...template, lines: JSON.parse(template.lines) };
}

function assertProductsExist(lines) {
  const ids = [...new Set(lines.map((line) => line.product_id))];
  if (!ids.length) return;
  const { found } = db
    .prepare(`SELECT COUNT(*) AS found FROM products WHERE id IN (${placeholders(ids)})`)
    .get(...ids);
  if (found !== ids.length) throw badRequest('One of the template lines uses a product that does not exist');
}

export function listTemplates(paging) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM quotation_templates').get();
  const rows = db
    .prepare(
      `SELECT t.*, pl.name AS plan_name FROM quotation_templates t
       JOIN plans pl ON pl.id = t.plan_id
       ORDER BY t.name LIMIT ? OFFSET ?`,
    )
    .all(paging.limit, paging.offset);
  return pagedResult(rows.map(parseLines), total, paging);
}

export function getTemplate(id) {
  const template = db
    .prepare(
      `SELECT t.*, pl.name AS plan_name FROM quotation_templates t
       JOIN plans pl ON pl.id = t.plan_id WHERE t.id = ?`,
    )
    .get(id);
  if (!template) throw notFound('Quotation template');
  return parseLines(template);
}

export function createTemplate({ name, plan_id, validity_days, lines }) {
  assertProductsExist(lines);
  const result = db
    .prepare(
      'INSERT INTO quotation_templates (name, plan_id, validity_days, lines) VALUES (?, ?, ?, ?)',
    )
    .run(name, plan_id, validity_days, JSON.stringify(lines));
  return getTemplate(Number(result.lastInsertRowid));
}

export function updateTemplate(id, { name, plan_id, validity_days, lines }) {
  getTemplate(id);
  assertProductsExist(lines);
  db.prepare(
    'UPDATE quotation_templates SET name = ?, plan_id = ?, validity_days = ?, lines = ? WHERE id = ?',
  ).run(name, plan_id, validity_days, JSON.stringify(lines), id);
  return getTemplate(id);
}

export function deleteTemplate(id) {
  const result = db.prepare('DELETE FROM quotation_templates WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('Quotation template');
}
