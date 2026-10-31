// The API speaks paise; forms speak rupees. These are the only conversions.

const rupeeFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export function formatMoney(paise) {
  return rupeeFormat.format((paise ?? 0) / 100);
}

export function toPaise(rupees) {
  if (rupees === '' || rupees === null || rupees === undefined) return null;
  return Math.round(Number(rupees) * 100);
}

export function toRupees(paise) {
  return paise === null || paise === undefined ? '' : String(paise / 100);
}

export function formatPercent(basisPoints) {
  return `${basisPoints / 100}%`;
}

export function toNumberOrNull(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

export const labelFor = (value) => value.replace(/_/g, ' ');

const METHOD_LABELS = { upi: 'UPI', bank_transfer: 'Bank transfer', card: 'Card', cash: 'Cash' };

export const methodLabel = (method) => METHOD_LABELS[method] ?? labelFor(method);
