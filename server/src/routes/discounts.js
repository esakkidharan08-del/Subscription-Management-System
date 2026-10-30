import { Router } from 'express';
import { AppError, parseId } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { discountSchema } from '../validation/schemas.js';

const DISCOUNT_COLUMNS = [
  'name',
  'type',
  'value',
  'min_amount',
  'min_quantity',
  'scope',
  'product_id',
  'starts_at',
  'ends_at',
  'usage_limit',
  'active',
];

function columnValues(body) {
  // node:sqlite cannot bind booleans.
  return DISCOUNT_COLUMNS.map((column) => (column === 'active' ? Number(body.active) : body[column]));
}

export function discountsRouter(db) {
  const router = Router();
  router.use(requireRole('admin', 'staff'));

  function getDiscount(id) {
    const discount = db.prepare('SELECT * FROM discounts WHERE id = ?').get(id);
    if (!discount) throw new AppError(404, 'Discount not found');
    return discount;
  }

  router.get('/', (req, res) => {
    const items = db
      .prepare(
        `SELECT d.*, pr.name AS product_name FROM discounts d
         LEFT JOIN products pr ON pr.id = d.product_id ORDER BY d.id DESC`,
      )
      .all();
    res.json({ items });
  });

  router.post('/', requireRole('admin'), validateBody(discountSchema), (req, res) => {
    const placeholders = DISCOUNT_COLUMNS.map(() => '?').join(', ');
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO discounts (${DISCOUNT_COLUMNS.join(', ')}) VALUES (${placeholders})`)
      .run(...columnValues(req.body));
    res.status(201).json(getDiscount(lastInsertRowid));
  });

  router.put('/:id', requireRole('admin'), validateBody(discountSchema), (req, res) => {
    const id = parseId(req.params.id);
    getDiscount(id);
    const assignments = DISCOUNT_COLUMNS.map((column) => `${column} = ?`).join(', ');
    db.prepare(`UPDATE discounts SET ${assignments} WHERE id = ?`).run(...columnValues(req.body), id);
    res.json(getDiscount(id));
  });

  return router;
}
