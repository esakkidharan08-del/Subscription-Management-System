import { Router } from 'express';
import { adminOnly, requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { readPagination } from '../lib/pagination.js';
import { readId } from '../lib/params.js';
import * as discounts from '../services/discountService.js';
import { discountSchema } from '../validation/billing.js';

const router = Router();

// Staff can see discount rules; only admins create or change them.
router.use(requireAuth, staffOnly);

router.get('/', (req, res) => {
  res.json(discounts.listDiscounts(readPagination(req.query)));
});

router.get('/:id', (req, res) => {
  res.json(discounts.getDiscount(readId(req)));
});

router.post('/', adminOnly, validateBody(discountSchema), (req, res) => {
  res.status(201).json(discounts.createDiscount(req.body));
});

router.put('/:id', adminOnly, validateBody(discountSchema), (req, res) => {
  res.json(discounts.updateDiscount(readId(req), req.body));
});

router.delete('/:id', adminOnly, (req, res) => {
  res.json(discounts.deleteDiscount(readId(req)));
});

export default router;
