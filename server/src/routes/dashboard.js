import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getDashboard } from '../services/dashboardService.js';

export function dashboardRouter(db) {
  const router = Router();
  router.get('/', requireRole('admin', 'staff'), (req, res) => res.json(getDashboard(db)));
  return router;
}
