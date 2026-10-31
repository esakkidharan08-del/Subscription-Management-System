import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

// In memory is enough for a single server process. Counts reset when it restarts.
export function rateLimit({ windowMinutes, max, keyFor = (req) => req.ip }) {
  const hits = new Map();
  const windowMs = windowMinutes * 60 * 1000;

  // Drop old windows now and then so the map can't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    if (!config.rateLimitEnabled) return next();

    const key = keyFor(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return next(new AppError(429, `Too many attempts, try again in ${Math.ceil(retryAfter / 60)} minutes`));
    }
    next();
  };
}

// Keyed on IP and email so one attacker can't lock out every account from one address,
// and many addresses can't hammer one account.
export const loginLimiter = rateLimit({
  windowMinutes: 15,
  max: 10,
  keyFor: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`,
});

export const accountLimiter = rateLimit({ windowMinutes: 60, max: 20 });
