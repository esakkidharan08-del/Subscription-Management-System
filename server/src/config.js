import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const isTest = process.env.NODE_ENV === 'test';

export const config = {
  isTest,
  rateLimitEnabled: !isTest,
  port: Number(process.env.PORT) || 4000,
  isProduction,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  sessionHours: 8,
  dbPath: process.env.DB_PATH || path.join(serverRoot, 'data', 'app.db'),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  resetTokenMinutes: 30,
  billingIntervalMinutes: Number(process.env.BILLING_INTERVAL_MINUTES ?? 60),
};
