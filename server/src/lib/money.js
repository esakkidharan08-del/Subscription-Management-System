// BigInt keeps amount * rate * share exact; Number loses precision above 2^53.
export function divideRounded(numerator, denominator) {
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

export function percentOf(amount, percent) {
  return Math.round((amount * percent) / 100);
}
