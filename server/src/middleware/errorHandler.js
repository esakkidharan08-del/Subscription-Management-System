import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

function fieldErrors(zodError) {
  const fields = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join('.') || 'body';
    fields[key] ??= [];
    fields[key].push(issue.message);
  }
  return fields;
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: fieldErrors(err) });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  }

  if (err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message)) {
    return res.status(409).json({ error: 'A record with these details already exists' });
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}
