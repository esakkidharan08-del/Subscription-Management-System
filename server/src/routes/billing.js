import { Router } from 'express';
import { requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { runBilling } from '../services/billingService.js';
import { billingRunSchema } from '../validation/billing.js';

const router = Router();

router.use(requireAuth, staffOnly);

// as_of lets the demo bill a future date without changing the clock.
router.post('/run', validateBody(billingRunSchema), (req, res) => {
  res.json(runBilling(req.body.as_of));
});

export default router;
