// Every amount in the system is integer paise, so only these helpers touch rupees.

export function rupeesToPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

export function formatPaise(paise) {
  const rupees = paise / 100;
  return rupees.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
}

// Basis points keep tax rates like 18% and 2.5% as whole numbers.
export function applyBasisPoints(paise, basisPoints) {
  return (paise * basisPoints) / 10000;
}

export function percentOf(paise, percent) {
  return Math.round((paise * percent) / 100);
}
