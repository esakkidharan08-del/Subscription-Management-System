import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { readPagination } from '../lib/pagination.js';
import { listPayments } from '../services/paymentService.js';

const router = Router();

router.use(requireAuth);

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');

router.get('/', (req, res) => {
  const isCustomer = req.user.role === 'customer';
  const filters = {
    from: isIsoDate(req.query.from) ? req.query.from : null,
    to: isIsoDate(req.query.to) ? req.query.to : null,
    method: req.query.method || null,
    search: isCustomer ? null : req.query.search || null,
    customerId: isCustomer ? req.user.id : Number(req.query.customer_id) || null,
  };
  res.json(listPayments(filters, readPagination(req.query)));
});

export default router;
