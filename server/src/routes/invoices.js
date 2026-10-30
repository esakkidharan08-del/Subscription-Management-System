import { Router } from 'express';
import { parseId } from '../lib/errors.js';
import { parsePagination } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { cancelInvoice, getInvoice, listInvoices, recordPayment } from '../services/invoiceService.js';
import { paymentSchema } from '../validation/schemas.js';

const STATUS_FILTERS = ['draft', 'confirmed', 'paid', 'cancelled', 'overdue'];

export function invoicesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const status = STATUS_FILTERS.includes(req.query.status) ? req.query.status : null;
    const subscriptionId = req.query.subscriptionId ? parseId(req.query.subscriptionId) : null;
    res.json(listInvoices(db, req.user, { status, subscriptionId, ...parsePagination(req.query) }));
  });

  router.get('/:id', (req, res) => {
    res.json(getInvoice(db, parseId(req.params.id), req.user));
  });

  router.post('/:id/payments', requireRole('admin', 'staff'), validateBody(paymentSchema), (req, res) => {
    res.status(201).json(recordPayment(db, parseId(req.params.id), req.body));
  });

  router.post('/:id/cancel', requireRole('admin', 'staff'), (req, res) => {
    res.json(cancelInvoice(db, parseId(req.params.id)));
  });

  return router;
}
