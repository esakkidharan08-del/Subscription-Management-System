import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const SESSION_COOKIE = 'session';

export function signSession(user) {
  const { token_version } = db.prepare('SELECT token_version FROM users WHERE id = ?').get(user.id);
  return jwt.sign({ sub: user.id, tv: token_version }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: config.sessionHours * 60 * 60 * 1000,
  };
}

// The user is re-read on every request (a primary key lookup) so a role change,
// a deleted account or a password reset takes effect straight away instead of
// when the token expires.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(unauthorized('Your session has expired, please log in again'));
  }

  const user = db
    .prepare('SELECT id, name, email, role, token_version FROM users WHERE id = ?')
    .get(payload.sub);
  if (!user || user.token_version !== payload.tv) {
    return next(unauthorized('Your session has ended, please log in again'));
  }

  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const staffOnly = requireRole('admin', 'staff');
export const adminOnly = requireRole('admin');
