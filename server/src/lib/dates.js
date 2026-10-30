// Dates are 'YYYY-MM-DD' strings in UTC, so they compare correctly as text.

export function today() {
  return new Date().toISOString().slice(0, 10);
}

function parse(date) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month: month - 1, day };
}

function format(utcDate) {
  return utcDate.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const { year, month, day } = parse(date);
  return format(new Date(Date.UTC(year, month, day + days)));
}

export function addMonths(date, months) {
  const { year, month, day } = parse(date);
  const lastDayOfTarget = new Date(Date.UTC(year, month + months + 1, 0)).getUTCDate();
  return format(new Date(Date.UTC(year, month + months, Math.min(day, lastDayOfTarget))));
}

export function addPeriod(date, period) {
  switch (period) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addMonths(date, 12);
    default:
      throw new Error(`Unknown billing period: ${period}`);
  }
}
