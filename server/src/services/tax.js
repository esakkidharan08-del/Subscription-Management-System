// Pure tax rules, kept free of the database so billing tests can call them directly.
import { applyBasisPoints } from '../lib/money.js';

// A rule for the exact product beats a category rule at the same priority.
export function pickTaxRule(rules, product) {
  const matching = rules.filter(
    (rule) =>
      rule.product_id === product.id || (rule.product_id == null && rule.category === product.type),
  );
  matching.sort(
    (a, b) =>
      b.priority - a.priority || Number(b.product_id != null) - Number(a.product_id != null),
  );
  return matching[0] ?? null;
}

// Each line shows its own rounded tax, but the invoice total is rounded once from
// the exact sum, so half-paise don't pile up across many lines.
export function calculateTaxes(lines) {
  const exact = lines.map((line) => applyBasisPoints(line.amount, line.rate_bp));
  const lineTaxes = exact.map((tax) => Math.round(tax));
  const taxTotal = Math.round(exact.reduce((sum, tax) => sum + tax, 0));
  return { lineTaxes, taxTotal };
}
