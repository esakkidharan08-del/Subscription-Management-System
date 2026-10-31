import { db } from '../db/index.js';
import { pagedResult } from '../lib/pagination.js';

export function listUsers({ role, search }, paging) {
  const filters = [];
  const params = [];

  if (role) {
    filters.push('role = ?');
    params.push(role);
  }
  if (search) {
    filters.push('(name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get(...params);
  const rows = db
    .prepare(
      `SELECT id, name, email, role, created_at FROM users ${where}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, paging.limit, paging.offset);

  return pagedResult(rows, total, paging);
}
