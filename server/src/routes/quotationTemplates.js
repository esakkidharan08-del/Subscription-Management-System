import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { quotationTemplateSchema } from '../validation/schemas.js';

function toTemplate(row) {
  return { ...row, lines: JSON.parse(row.lines) };
}

export function quotationTemplatesRouter(db) {
  const router = Router();
  router.use(requireRole('admin', 'staff'));

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT q.*, p.name AS plan_name FROM quotation_templates q
         JOIN plans p ON p.id = q.plan_id ORDER BY q.name`,
      )
      .all();
    res.json({ items: rows.map(toTemplate) });
  });

  router.post('/', requireRole('admin'), validateBody(quotationTemplateSchema), (req, res) => {
    const { name, plan_id, validity_days, lines } = req.body;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO quotation_templates (name, plan_id, validity_days, lines) VALUES (?, ?, ?, ?)')
      .run(name, plan_id, validity_days, JSON.stringify(lines));
    res.status(201).json(toTemplate(db.prepare('SELECT * FROM quotation_templates WHERE id = ?').get(lastInsertRowid)));
  });

  return router;
}
