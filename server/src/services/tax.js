// Pure tax rules, kept free of the database so billing tests can call them directly.

// A rule for the exact product beats a category rule at the same priority.
export function pickTaxRule(rules, product) {
  const matching = rules.filter(
    (rule) =>
      rule.product_id === product.id || (rule.product_id == null && rule.category === product.type),
  );
  matching.sort(
    (a, b) => b.priority - a.priority || Number(b.product_id != null) - Number(a.product_id != null),
  );
  return matching[0] ?? null;
}
