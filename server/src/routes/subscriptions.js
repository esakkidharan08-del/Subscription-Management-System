import { Router } from 'express';
import { requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { forbidden } from '../lib/errors.js';
import { readPagination } from '../lib/pagination.js';
import { readId } from '../lib/params.js';
import * as subscriptions from '../services/subscriptionService.js';
import {
  addonSchema,
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

router.get('/addons', (req, res) => {
  res.json({ data: subscriptions.listAddons() });
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

// Staff move a subscription through every step. A customer may only close
// (cancel) their own active subscription; the service checks it is theirs.
router.post('/:id/status', validateBody(statusChangeSchema), (req, res) => {
  if (req.user.role === 'customer' && req.body.status !== 'closed') {
    throw forbidden('You can cancel your subscription, but other changes go through our team');
  }
  res.json(subscriptions.changeStatus(readId(req), req.body.status, req.user));
});

router.post('/:id/extend-quote', staffOnly, (req, res) => {
  res.json(subscriptions.extendQuotation(readId(req), req.user));
});

router.post('/:id/renew', staffOnly, (req, res) => {
  res.json(subscriptions.renewSubscription(readId(req), req.user));
});

// Pausing and add-ons are self-service: customers act on their own subscriptions.
router.post('/:id/pause', (req, res) => {
  res.json(subscriptions.pauseSubscription(readId(req), req.user));
});

router.post('/:id/resume', (req, res) => {
  res.json(subscriptions.resumeSubscription(readId(req), req.user));
});

router.post('/:id/addons', validateBody(addonSchema), (req, res) => {
  res.status(201).json(subscriptions.addAddon(readId(req), req.body, req.user));
});

router.delete('/:id/addons/:lineId', (req, res) => {
  res.json(subscriptions.removeAddon(readId(req), readId(req, 'lineId'), req.user));
});

export default router;
