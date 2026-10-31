import { config } from '../config.js';
import { forbidden } from '../lib/errors.js';

export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  // API responses carry personal and billing data; never let a shared cache keep them.
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  next();
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// SameSite=Lax cookies already stop most cross-site posts. Checking Origin as
// well covers older browsers and same-site subdomains.
export function checkOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin || !UNSAFE_METHODS.has(req.method)) return next();

  const allowed = [config.clientUrl, `${req.protocol}://${req.get('host')}`];
  if (!allowed.includes(origin)) return next(forbidden('Request origin not allowed'));
  next();
}

export function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}
