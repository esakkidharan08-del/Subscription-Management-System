import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import { authenticate, clearSession, issueSession } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createUser,
  findUser,
  requestPasswordReset,
  resetPassword,
  verifyLogin,
} from '../services/authService.js';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '../validation/schemas.js';

export function authRouter(db) {
  const router = Router();

  router.post('/signup', validateBody(signupSchema), async (req, res) => {
    const user = await createUser(db, { ...req.body, role: 'customer' });
    issueSession(res, user);
    res.status(201).json({ user });
  });

  router.post('/login', validateBody(loginSchema), async (req, res) => {
    const user = await verifyLogin(db, req.body);
    issueSession(res, user);
    res.json({ user });
  });

  router.post('/logout', (req, res) => {
    clearSession(res);
    res.status(204).end();
  });

  router.get('/me', authenticate, (req, res) => {
    const user = findUser(db, req.user.id);
    if (!user) throw new AppError(401, 'Please log in');
    res.json({ user });
  });

  router.post('/forgot-password', validateBody(forgotPasswordSchema), async (req, res) => {
    await requestPasswordReset(db, req.body.email);
    res.json({ message: 'If that email has an account, a reset link is on its way.' });
  });

  router.post('/reset-password', validateBody(resetPasswordSchema), async (req, res) => {
    await resetPassword(db, req.body);
    res.json({ message: 'Password updated. You can log in now.' });
  });

  return router;
}
