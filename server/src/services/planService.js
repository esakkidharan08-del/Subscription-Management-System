import { db } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { pagedResult } from '../lib/pagination.js';

const PLAN_COLUMNS = `pl.*, p.name AS product_name`;

export function isPlanAvailable(plan, onDate) {
  if (plan.available_from && onDate < plan.available_from) return false;
  if (plan.available_to && onDate > plan.available_to) return false;
  return true;
}

export function listPlans({ productId, availableOn }, paging) {
  const filters = [];
  const params = [];

  if (productId) {
    filters.push('pl.product_id = ?');
    params.push(productId);
  }
  if (availableOn) {
    filters.push('(pl.available_from IS NULL OR pl.available_from <= ?)');
    filters.push('(pl.available_to IS NULL OR pl.available_to >= ?)');
    params.push(availableOn, availableOn);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM plans pl ${where}`).get(...params);
  const rows = db
    .prepare(
      `SELECT ${PLAN_COLUMNS} FROM plans pl JOIN products p ON p.id = pl.product_id
       ${where} ORDER BY p.name, pl.price LIMIT ? OFFSET ?`,
    )
    .all(...params, paging.limit, paging.offset);

  return pagedResult(rows, total, paging);
}

export function getPlan(id) {
  const plan = db
    .prepare(
      `SELECT ${PLAN_COLUMNS} FROM plans pl JOIN products p ON p.id = pl.product_id WHERE pl.id = ?`,
    )
    .get(id);
  if (!plan) throw notFound('Plan');
  return plan;
}

export function createPlan(plan) {
  const result = db
    .prepare(
      `INSERT INTO plans (product_id, name, price, billing_period, min_quantity,
         available_from, available_to, end_behavior)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      plan.product_id,
      plan.name,
      plan.price,
      plan.billing_period,
      plan.min_quantity,
      plan.available_from,
      plan.available_to,
      plan.end_behavior,
    );
  return getPlan(Number(result.lastInsertRowid));
}

export function updatePlan(id, plan) {
  getPlan(id);
  db.prepare(
    `UPDATE plans SET product_id = ?, name = ?, price = ?, billing_period = ?, min_quantity = ?,
       available_from = ?, available_to = ?, end_behavior = ?
     WHERE id = ?`,
  ).run(
    plan.product_id,
    plan.name,
    plan.price,
    plan.billing_period,
    plan.min_quantity,
    plan.available_from,
    plan.available_to,
    plan.end_behavior,
    id,
  );
  return getPlan(id);
}

export function deletePlan(id) {
  getPlan(id);
  const { used } = db
    .prepare('SELECT COUNT(*) AS used FROM subscriptions WHERE plan_id = ?')
    .get(id);
  if (used > 0) throw conflict('This plan has subscriptions and cannot be deleted');
  db.prepare('DELETE FROM plans WHERE id = ?').run(id);
}
