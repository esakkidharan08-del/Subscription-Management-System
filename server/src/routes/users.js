import { Router } from 'express';
import { adminOnly, requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { readPagination } from '../lib/pagination.js';
import { createUser } from '../services/authService.js';
import { listUsers } from '../services/userService.js';
import { createUserSchema } from '../validation/auth.js';

const router = Router();

router.use(requireAuth);

// Staff need the customer list to create subscriptions.
router.get('/', staffOnly, (req, res) => {
  const { role, search } = req.query;
  res.json(listUsers({ role, search }, readPagination(req.query)));
});

router.post('/', adminOnly, validateBody(createUserSchema), (req, res) => {
  res.status(201).json(createUser(req.body));
});

export default router;
