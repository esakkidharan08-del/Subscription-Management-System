import { Router } from 'express';
import { parseId } from '../lib/errors.js';
import { parsePagination } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createSubscription,
  getSubscription,
  listSubscriptions,
  transitionSubscription,
} from '../services/subscriptionService.js';
import { SUBSCRIPTION_STATUSES, subscriptionSchema, transitionSchema } from '../validation/schemas.js';

export function subscriptionsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const status = SUBSCRIPTION_STATUSES.includes(req.query.status) ? req.query.status : null;
    res.json(listSubscriptions(db, req.user, { status, ...parsePagination(req.query) }));
  });

  router.get('/:id', (req, res) => {
    res.json(getSubscription(db, parseId(req.params.id), req.user));
  });

  router.post('/', requireRole('admin', 'staff'), validateBody(subscriptionSchema), (req, res) => {
    res.status(201).json(createSubscription(db, req.body));
  });

  router.post('/:id/transition', requireRole('admin', 'staff'), validateBody(transitionSchema), (req, res) => {
    res.json(transitionSubscription(db, parseId(req.params.id), req.body.to));
  });

  return router;
}
