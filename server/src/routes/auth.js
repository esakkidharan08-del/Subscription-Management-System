import { Router } from 'express';
import {
  SESSION_COOKIE,
  requireAuth,
  sessionCookieOptions,
  signSession,
} from '../middleware/auth.js';
import { accountLimiter, loginLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import * as authService from '../services/authService.js';
import { notFound } from '../lib/errors.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '../validation/auth.js';

const router = Router();

function startSession(res, user) {
  res.cookie(SESSION_COOKIE, signSession(user), sessionCookieOptions());
}

router.post('/signup', accountLimiter, validateBody(signupSchema), (req, res) => {
  const user = authService.signup(req.body);
  startSession(res, user);
  res.status(201).json({ user });
});

router.post('/login', loginLimiter, validateBody(loginSchema), (req, res) => {
  const user = authService.login(req.body);
  startSession(res, user);
  res.json({ user });
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  const user = authService.findUserById(req.user.id);
  if (!user) throw notFound('User');
  res.json({ user });
});

router.post(
  '/forgot-password',
  accountLimiter,
  validateBody(forgotPasswordSchema),
  async (req, res) => {
    await authService.requestPasswordReset(req.body.email);
    res.json({ message: 'If that email is registered, a reset link has been sent' });
  },
);

router.post('/reset-password', accountLimiter, validateBody(resetPasswordSchema), (req, res) => {
  authService.resetPassword(req.body);
  res.json({ message: 'Password updated, you can log in now' });
});

// Other devices are signed out; this one gets a fresh cookie so it stays logged in.
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), (req, res) => {
  authService.changePassword(req.user.id, req.body);
  startSession(res, req.user);
  res.json({ message: 'Password changed. Other devices have been signed out.' });
});

export default router;
