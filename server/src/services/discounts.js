// Pure discount rules. The database decides which discounts exist; these decide
// whether one applies and how much it takes off.
import { percentOf } from '../lib/money.js';

export function isDiscountUsable(discount, onDate) {
  if (!discount.active) return false;
  if (discount.starts_at && onDate < discount.starts_at) return false;
  if (discount.ends_at && onDate > discount.ends_at) return false;
  if (discount.usage_limit != null && discount.times_used >= discount.usage_limit) return false;
  return true;
}

export function meetsMinimums(discount, { amount, quantity }) {
  return amount >= discount.min_amount && quantity >= discount.min_quantity;
}

// A fixed discount bigger than the bill only brings it to zero, never below.
export function discountValue(discount, base) {
  const value = discount.type === 'percent' ? percentOf(base, discount.value) : discount.value;
  return Math.min(value, base);
}

// Discounts don't stack within a scope: the customer gets the single best one.
export function bestDiscount(candidates, basis) {
  let best = null;
  for (const discount of candidates) {
    if (!meetsMinimums(discount, basis)) continue;
    const amount = discountValue(discount, basis.amount);
    if (amount > 0 && (!best || amount > best.amount)) best = { discount, amount };
  }
  return best;
}
