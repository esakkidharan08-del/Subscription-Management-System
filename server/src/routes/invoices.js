import { Router } from 'express';
import { requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { readPagination } from '../lib/pagination.js';
import { readId } from '../lib/params.js';
import * as invoices from '../services/invoiceService.js';
import { recordPayment } from '../services/paymentService.js';
import { paymentSchema } from '../validation/billing.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const isCustomer = req.user.role === 'customer';
  const filters = {
    status: req.query.status || null,
    overdue: req.query.overdue === 'true',
    search: req.query.search || null,
    subscriptionId: Number(req.query.subscription_id) || null,
    customerId: isCustomer ? req.user.id : Number(req.query.customer_id) || null,
  };
  res.json(invoices.listInvoices(filters, readPagination(req.query)));
});

router.get('/:id', (req, res) => {
  res.json(invoices.getInvoice(readId(req), req.user));
});

router.post('/:id/confirm', staffOnly, (req, res) => {
  res.json(invoices.confirmInvoice(readId(req)));
});

router.post('/:id/cancel', staffOnly, (req, res) => {
  res.json(invoices.cancelInvoice(readId(req)));
});

router.post('/:id/payments', staffOnly, validateBody(paymentSchema), (req, res) => {
  res.status(201).json(recordPayment(readId(req), req.body));
});

export default router;
