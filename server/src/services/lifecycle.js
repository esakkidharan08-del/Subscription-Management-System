import { badRequest } from '../lib/errors.js';

export const SUBSCRIPTION_FLOW = ['draft', 'quotation', 'confirmed', 'active', 'closed'];

export function nextSubscriptionStatus(status) {
  const index = SUBSCRIPTION_FLOW.indexOf(status);
  if (index === -1 || index === SUBSCRIPTION_FLOW.length - 1) return null;
  return SUBSCRIPTION_FLOW[index + 1];
}

// Subscriptions only ever move one step forward. Skipping a step or going back
// would let a quotation start billing without being confirmed.
export function assertTransition(from, to) {
  const allowed = nextSubscriptionStatus(from);
  if (allowed !== to) {
    const hint = allowed ? `The next step is ${allowed}.` : 'It is already closed.';
    throw badRequest(`A ${from} subscription cannot move to ${to}. ${hint}`);
  }
}
