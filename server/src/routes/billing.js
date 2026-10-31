import { Router } from 'express';
import { recordAudit } from '../lib/audit.js';
import { requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { runBilling } from '../services/billingService.js';
import { billingRunSchema } from '../validation/billing.js';

const router = Router();

router.use(requireAuth, staffOnly);

// as_of lets the demo bill a future date without changing the clock.
router.post('/run', validateBody(billingRunSchema), (req, res) => {
  const summary = runBilling(req.body.as_of);
  recordAudit(req.user, 'billing_run', 'billing', null, summary);
  res.json(summary);
});

export default router;
