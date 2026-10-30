import { percentOf } from '../lib/money.js';

export function isDiscountEligible(discount, { date, amount, quantity }) {
  if (!discount.active) return false;
  if (discount.starts_at && date < discount.starts_at) return false;
  if (discount.ends_at && date > discount.ends_at) return false;
  if (discount.usage_limit != null && discount.times_used >= discount.usage_limit) return false;
  return amount >= discount.min_amount && quantity >= discount.min_quantity;
}

export function discountValue(discount, base) {
  const raw = discount.type === 'percent' ? percentOf(base, discount.value) : discount.value;
  return Math.min(raw, base);
}

function bestDiscount(candidates, context, base) {
  let best = null;
  for (const discount of candidates) {
    if (!isDiscountEligible(discount, context)) continue;
    const value = discountValue(discount, base);
    if (!best || value > best.value) best = { discount, value };
  }
  return best;
}

/** Picks the single best product discount per line, then the best subscription discount. */
export function chooseDiscounts(discounts, lines, date) {
  const lineDiscounts = new Map();
  const appliedIds = new Set();

  for (const line of lines) {
    const candidates = discounts.filter((d) => d.scope === 'product' && d.product_id === line.product_id);
    const best = bestDiscount(candidates, { date, amount: line.amount, quantity: line.quantity }, line.amount);
    if (best && best.value > 0) {
      lineDiscounts.set(line.id, best.value);
      appliedIds.add(best.discount.id);
    }
  }

  const netSubtotal = lines.reduce((sum, l) => sum + l.amount - (lineDiscounts.get(l.id) ?? 0), 0);
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const orderCandidates = discounts.filter((d) => d.scope === 'subscription');
  const bestOrder = bestDiscount(
    orderCandidates,
    { date, amount: netSubtotal, quantity: totalQuantity },
    netSubtotal,
  );

  let orderDiscount = 0;
  if (bestOrder && bestOrder.value > 0) {
    orderDiscount = bestOrder.value;
    appliedIds.add(bestOrder.discount.id);
  }

  return { lineDiscounts, orderDiscount, appliedIds: [...appliedIds] };
}
