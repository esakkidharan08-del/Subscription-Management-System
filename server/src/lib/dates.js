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
  const lastDayOfTarget = new Date(
    Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0),
  ).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTarget);
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), targetMonth, day)));
}

// Monthly and yearly dates are counted from the subscription's start, not from
// the last bill. Otherwise a 31st start slips to the 30th after one short month
// and never comes back.
export function nextBillingDate(startDate, currentDate, period) {
  if (period !== 'monthly' && period !== 'yearly') return addBillingPeriod(currentDate, period);
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [currentYear, currentMonth] = currentDate.split('-').map(Number);
  const monthsSoFar = (currentYear - startYear) * 12 + (currentMonth - startMonth);
  return addMonths(startDate, monthsSoFar + (period === 'monthly' ? 1 : 12));
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
