import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { taxRuleSchema, taxSchema } from '../validation/schemas.js';

export function taxesRouter(db) {
  const router = Router();
  router.use(requireRole('admin', 'staff'));

  router.get('/', (req, res) => {
    res.json({ items: db.prepare('SELECT * FROM taxes ORDER BY name').all() });
  });

  router.post('/', requireRole('admin'), validateBody(taxSchema), (req, res) => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO taxes (name, rate_bp) VALUES (?, ?)')
      .run(req.body.name, req.body.rate_bp);
    res.status(201).json(db.prepare('SELECT * FROM taxes WHERE id = ?').get(lastInsertRowid));
  });

  router.get('/rules', (req, res) => {
    const items = db
      .prepare(
        `SELECT r.*, t.name AS tax_name, t.rate_bp, pr.name AS product_name
         FROM tax_rules r
         JOIN taxes t ON t.id = r.tax_id
         LEFT JOIN products pr ON pr.id = r.product_id
         ORDER BY r.priority DESC`,
      )
      .all();
    res.json({ items });
  });

  router.post('/rules', requireRole('admin'), validateBody(taxRuleSchema), (req, res) => {
    const { tax_id, product_id, product_type, priority } = req.body;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO tax_rules (tax_id, product_id, product_type, priority) VALUES (?, ?, ?, ?)')
      .run(tax_id, product_id, product_type, priority);
    res.status(201).json(db.prepare('SELECT * FROM tax_rules WHERE id = ?').get(lastInsertRowid));
  });

  return router;
}
