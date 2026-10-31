// Turns subscription lines and the available discounts into invoice amounts.
// No database access, so every money rule here is covered by plain unit tests.
import { bestDiscount, isDiscountUsable } from './discounts.js';
import { calculateTaxes } from './tax.js';

const sum = (items, field) => items.reduce((total, item) => total + item[field], 0);

// Splits an amount across lines by weight. Leftover paise from rounding go to
// the first lines, so the parts always add back up to exactly the amount.
export function allocate(amount, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0 || amount === 0) return weights.map(() => 0);

  const shares = weights.map((weight) => Math.floor((amount * weight) / totalWeight));
  let leftover = amount - shares.reduce((a, b) => a + b, 0);
  for (let i = 0; leftover > 0; i = (i + 1) % shares.length) {
    if (weights[i] > 0) {
      shares[i] += 1;
      leftover -= 1;
    }
  }
  return shares;
}

function applyProductDiscounts(lines, discounts, applied) {
  const productIds = [...new Set(lines.map((line) => line.product_id))];
  for (const productId of productIds) {
    const group = lines.filter((line) => line.product_id === productId);
    const candidates = discounts.filter((d) => d.scope === 'product' && d.product_id === productId);
    const best = bestDiscount(candidates, {
      amount: sum(group, 'gross'),
      quantity: sum(group, 'quantity'),
    });
    if (!best) continue;

    allocate(best.amount, group.map((line) => line.gross)).forEach((share, i) => {
      group[i].discount += share;
    });
    applied.push(best.discount.id);
  }
}

// Runs after product discounts, on what is left, and is spread over the lines
// so tax is charged on the discounted price of each line.
function applySubscriptionDiscount(lines, discounts, applied) {
  const remaining = lines.map((line) => line.gross - line.discount);
  const best = bestDiscount(
    discounts.filter((d) => d.scope === 'subscription'),
    { amount: remaining.reduce((a, b) => a + b, 0), quantity: sum(lines, 'quantity') },
  );
  if (!best) return;

  allocate(best.amount, remaining).forEach((share, i) => {
    lines[i].discount += share;
  });
  applied.push(best.discount.id);
}

export function buildInvoice(lines, discounts, onDate) {
  const usable = discounts.filter((discount) => isDiscountUsable(discount, onDate));
  const priced = lines.map((line) => ({
    ...line,
    gross: line.quantity * line.unit_price,
    discount: 0,
  }));
  const appliedDiscountIds = [];

  applyProductDiscounts(priced, usable, appliedDiscountIds);
  applySubscriptionDiscount(priced, usable, appliedDiscountIds);

  const taxable = priced.map((line) => line.gross - line.discount);
  const { lineTaxes, taxTotal } = calculateTaxes(
    priced.map((line, i) => ({ amount: taxable[i], rate_bp: line.rate_bp ?? 0 })),
  );

  const subtotal = sum(priced, 'gross');
  const discountTotal = sum(priced, 'discount');

  return {
    lines: priced.map((line, i) => ({
      product_id: line.product_id,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount: line.discount,
      tax_amount: lineTaxes[i],
      amount: taxable[i],
    })),
    subtotal,
    discount_total: discountTotal,
    tax_total: taxTotal,
    total: subtotal - discountTotal + taxTotal,
    appliedDiscountIds,
  };
}
