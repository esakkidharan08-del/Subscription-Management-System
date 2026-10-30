import { divideRounded } from '../lib/money.js';

/**
 * Lines are { amount, rateBp, discount }. Tax is rounded once for the whole invoice,
 * and an order-level discount reduces each line's taxable amount by its share.
 */
export function calculateInvoiceTotals(lines, orderDiscount = 0) {
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const lineDiscountTotal = lines.reduce((sum, line) => sum + (line.discount ?? 0), 0);
  const net = subtotal - lineDiscountTotal;
  const appliedOrderDiscount = Math.min(orderDiscount, net);
  const discountTotal = lineDiscountTotal + appliedOrderDiscount;

  if (net <= 0) {
    return { subtotal, discountTotal, taxTotal: 0, total: subtotal - discountTotal };
  }

  const weightedTax = lines.reduce(
    (sum, line) => sum + BigInt(line.amount - (line.discount ?? 0)) * BigInt(line.rateBp),
    0n,
  );
  const taxTotal = divideRounded(
    weightedTax * BigInt(net - appliedOrderDiscount),
    BigInt(net) * 10000n,
  );

  return { subtotal, discountTotal, taxTotal, total: subtotal - discountTotal + taxTotal };
}
