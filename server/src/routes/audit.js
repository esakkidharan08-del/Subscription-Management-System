import { Router } from 'express';
import { db } from '../db/index.js';
import { adminOnly, requireAuth } from '../middleware/auth.js';
import { pagedResult, readPagination } from '../lib/pagination.js';

const router = Router();

router.use(requireAuth, adminOnly);

router.get('/', (req, res) => {
  const paging = readPagination(req.query);
  const entity = req.query.entity || null;
  const where = entity ? 'WHERE a.entity = ?' : '';
  const params = entity ? [entity] : [];

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM audit_log a ${where}`).get(...params);
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS actor_name FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, paging.limit, paging.offset)
    .map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null }));

  res.json(pagedResult(rows, total, paging));
});

export default router;
