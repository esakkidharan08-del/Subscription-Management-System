import { Router } from 'express';
import { adminOnly, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { readPagination } from '../lib/pagination.js';
import { readId } from '../lib/params.js';
import * as plans from '../services/planService.js';
import { planSchema } from '../validation/catalog.js';

const router = Router();

// Customers can browse plans too, so reads only need a login.
router.use(requireAuth);

router.get('/', (req, res) => {
  const filters = {
    productId: Number(req.query.product_id) || null,
    availableOn: req.query.available_on || null,
  };
  res.json(plans.listPlans(filters, readPagination(req.query)));
});

router.get('/:id', (req, res) => {
  res.json(plans.getPlan(readId(req)));
});

router.post('/', adminOnly, validateBody(planSchema), (req, res) => {
  res.status(201).json(plans.createPlan(req.body));
});

router.put('/:id', adminOnly, validateBody(planSchema), (req, res) => {
  res.json(plans.updatePlan(readId(req), req.body));
});

router.delete('/:id', adminOnly, (req, res) => {
  plans.deletePlan(readId(req));
  res.status(204).end();
});

export default router;
