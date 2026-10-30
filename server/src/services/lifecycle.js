import { AppError } from '../lib/errors.js';

const NEXT_STATUS = {
  draft: 'quotation',
  quotation: 'confirmed',
  confirmed: 'active',
  active: 'closed',
};

export function nextStatus(status) {
  return NEXT_STATUS[status] ?? null;
}

export function canTransition(from, to) {
  return NEXT_STATUS[from] === to;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const allowed = nextStatus(from);
    const hint = allowed ? ` It can only move to ${allowed}.` : ' It is already closed.';
    throw new AppError(409, `A ${from} subscription cannot move to ${to}.${hint}`);
  }
}
