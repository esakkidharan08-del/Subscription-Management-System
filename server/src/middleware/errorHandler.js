import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Some fields need attention',
      fields: err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (/UNIQUE constraint failed/.test(err.message)) {
    return res.status(409).json({ error: 'A record with these details already exists' });
  }
  if (/FOREIGN KEY constraint failed/.test(err.message)) {
    return res.status(400).json({ error: 'A referenced record does not exist' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}
