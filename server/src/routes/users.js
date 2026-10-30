import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { buildWhere, parsePagination } from '../lib/pagination.js';
import { createUser } from '../services/authService.js';
import { signupSchema } from '../validation/schemas.js';

export function usersRouter(db) {
  const router = Router();

  router.get('/', requireRole('admin', 'staff'), (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    // Staff only need customers, to pick one when creating a subscription.
    const role = req.user.role === 'staff' ? 'customer' : req.query.role;
    const { clause, params } = buildWhere([['role = ?', role]]);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM users ${clause}`).get(...params);
    const items = db
      .prepare(`SELECT id, email, name, role, created_at FROM users ${clause} ORDER BY name LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);
    res.json({ items, total, page, pageSize });
  });

  router.post('/', requireRole('admin'), validateBody(signupSchema), async (req, res) => {
    const user = await createUser(db, { ...req.body, role: 'staff' });
    res.status(201).json(user);
  });

  return router;
}
