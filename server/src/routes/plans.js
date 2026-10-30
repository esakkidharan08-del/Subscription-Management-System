import { Router } from 'express';
import { AppError, parseId } from '../lib/errors.js';
import { parsePagination } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { planSchema } from '../validation/schemas.js';

const PLAN_COLUMNS = [
  'product_id',
  'name',
  'price',
  'billing_period',
  'min_quantity',
  'available_from',
  'available_to',
  'end_behavior',
];

export function plansRouter(db) {
  const router = Router();
  router.use(requireRole('admin', 'staff'));

  function getPlan(id) {
    const plan = db
      .prepare('SELECT p.*, pr.name AS product_name FROM plans p JOIN products pr ON pr.id = p.product_id WHERE p.id = ?')
      .get(id);
    if (!plan) throw new AppError(404, 'Plan not found');
    return plan;
  }

  router.get('/', (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM plans').get();
    const items = db
      .prepare(
        `SELECT p.*, pr.name AS product_name FROM plans p JOIN products pr ON pr.id = p.product_id
         ORDER BY p.name LIMIT ? OFFSET ?`,
      )
      .all(pageSize, offset);
    res.json({ items, total, page, pageSize });
  });

  router.get('/:id', (req, res) => res.json(getPlan(parseId(req.params.id))));

  router.post('/', requireRole('admin'), validateBody(planSchema), (req, res) => {
    const placeholders = PLAN_COLUMNS.map(() => '?').join(', ');
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO plans (${PLAN_COLUMNS.join(', ')}) VALUES (${placeholders})`)
      .run(...PLAN_COLUMNS.map((column) => req.body[column]));
    res.status(201).json(getPlan(lastInsertRowid));
  });

  router.put('/:id', requireRole('admin'), validateBody(planSchema), (req, res) => {
    const id = parseId(req.params.id);
    getPlan(id);
    const assignments = PLAN_COLUMNS.map((column) => `${column} = ?`).join(', ');
    db.prepare(`UPDATE plans SET ${assignments} WHERE id = ?`).run(
      ...PLAN_COLUMNS.map((column) => req.body[column]),
      id,
    );
    res.json(getPlan(id));
  });

  return router;
}
