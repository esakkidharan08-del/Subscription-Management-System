import { Router } from 'express';
import { requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { readPagination } from '../lib/pagination.js';
import { readId } from '../lib/params.js';
import * as subscriptions from '../services/subscriptionService.js';
import {
  statusChangeSchema,
  subscriptionFromTemplateSchema,
  subscriptionSchema,
} from '../validation/billing.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const isCustomer = req.user.role === 'customer';
  const filters = {
    status: req.query.status || null,
    search: req.query.search || null,
    // Customers are always limited to their own, whatever the query string says.
    customerId: isCustomer ? req.user.id : Number(req.query.customer_id) || null,
  };
  res.json(subscriptions.listSubscriptions(filters, readPagination(req.query)));
});

router.get('/:id', (req, res) => {
  res.json(subscriptions.getSubscription(readId(req), req.user));
});

router.post('/', staffOnly, validateBody(subscriptionSchema), (req, res) => {
  res.status(201).json(subscriptions.createSubscription(req.body, req.user));
});

router.post(
  '/from-template',
  staffOnly,
  validateBody(subscriptionFromTemplateSchema),
  (req, res) => {
    res.status(201).json(subscriptions.createFromTemplate(req.body, req.user));
  },
);

router.put('/:id', staffOnly, validateBody(subscriptionSchema), (req, res) => {
  res.json(subscriptions.updateSubscription(readId(req), req.body, req.user));
});

router.post('/:id/pause', staffOnly, (req, res) => {
  res.json(subscriptions.pauseSubscription(readId(req), req.user));
});

router.post('/:id/resume', staffOnly, (req, res) => {
  res.json(subscriptions.resumeSubscription(readId(req), req.user));
});

router.post('/:id/status', staffOnly, validateBody(statusChangeSchema), (req, res) => {
  res.json(subscriptions.changeStatus(readId(req), req.body.status, req.user));
});

export default router;
