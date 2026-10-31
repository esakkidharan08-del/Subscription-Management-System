import { badRequest } from './errors.js';

export function readId(req, name = 'id') {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id < 1) throw badRequest(`Invalid ${name}`);
  return id;
}
