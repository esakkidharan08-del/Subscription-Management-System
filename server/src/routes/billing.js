import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { runBilling } from '../services/billingService.js';
import { billingRunSchema } from '../validation/schemas.js';

export function billingRouter(db) {
  const router = Router();

  // `date` lets the demo simulate a future billing day.
  router.post('/run', requireRole('admin', 'staff'), validateBody(billingRunSchema), (req, res) => {
    res.json(runBilling(db, req.body.date));
  });

  return router;
}
