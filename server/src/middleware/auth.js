import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

const COOKIE_NAME = 'token';

export function issueSession(res, user) {
  const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: config.sessionHours * 60 * 60 * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

export function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(new AppError(401, 'Please log in'));
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new AppError(401, 'Your session has expired. Please log in again'));
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return next(new AppError(403, 'You do not have access to this action'));
    }
    next();
  };
}
