import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getCustomerSummary, getDashboard } from '../services/dashboardService.js';

const router = Router();

router.use(requireAuth);

// Staff get the finance dashboard; customers get a summary of their own account.
router.get('/', (req, res) => {
  if (req.user.role === 'customer') {
    return res.json({ customer: getCustomerSummary(req.user.id) });
  }
  res.json(getDashboard());
});

export default router;
