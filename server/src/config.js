import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  dbPath: process.env.DB_PATH || path.join(serverDir, 'data', 'app.db'),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  sessionHours: 8,
  resetTokenMinutes: 30,
};
