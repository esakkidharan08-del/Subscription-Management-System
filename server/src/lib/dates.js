// Dates are stored as 'YYYY-MM-DD' strings in UTC, which also sort correctly as text.

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function today() {
  return toIsoDate(new Date());
}

function parse(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(isoDate, days) {
  const date = parse(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

// Jan 31 plus one month lands on Feb 28, not Mar 3.
export function addMonths(isoDate, months) {
  const date = parse(isoDate);
  const targetMonth = date.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTarget);
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), targetMonth, day)));
}

export function addBillingPeriod(isoDate, period) {
  switch (period) {
    case 'daily':
      return addDays(isoDate, 1);
    case 'weekly':
      return addDays(isoDate, 7);
    case 'monthly':
      return addMonths(isoDate, 1);
    case 'yearly':
      return addMonths(isoDate, 12);
    default:
      throw new Error(`Unknown billing period: ${period}`);
  }
}
