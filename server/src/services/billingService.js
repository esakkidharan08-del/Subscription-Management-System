import { db, transaction } from '../db/index.js';
import { addDays, nextBillingDate, today } from '../lib/dates.js';
import { createInvoiceForPeriod } from './invoiceService.js';

const nextPeriodStart = (subscription, periodStart) =>
  nextBillingDate(subscription.start_date, periodStart, subscription.billing_period);

// Stops a subscription with a very old start date from looping for ages in one run.
const MAX_PERIODS_PER_RUN = 400;

function dueSubscriptions(asOf) {
  return db
    .prepare(
      `SELECT s.*, pl.billing_period, pl.end_behavior
       FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
       WHERE s.status = 'active' AND s.next_billing_date <= ?
       ORDER BY s.id`,
    )
    .all(asOf);
}

// Renewable plans keep billing past expiry. Manual-close and pausable plans stop
// at expiry and wait for staff; auto-close plans are closed by closeExpired().
function canBillPeriod(subscription, periodStart) {
  if (!subscription.expiry_date || periodStart < subscription.expiry_date) return true;
  return subscription.end_behavior === 'renewable';
}

function billPeriod(subscription, periodStart) {
  return transaction(() => {
    const nextBillingDate = nextPeriodStart(subscription, periodStart);
    const periodEnd = addDays(nextBillingDate, -1);

    // The unique (subscription_id, period_start) index is the real guard; this
    // check just lets a retried run skip the period without an error.
    const alreadyBilled = db
      .prepare('SELECT 1 FROM invoices WHERE subscription_id = ? AND period_start = ?')
      .get(subscription.id, periodStart);
    if (!alreadyBilled) createInvoiceForPeriod(subscription, periodStart, periodEnd);

    const renewing =
      subscription.end_behavior === 'renewable' &&
      subscription.expiry_date &&
      nextBillingDate > subscription.expiry_date;
    const expiryDate = renewing ? nextBillingDate : subscription.expiry_date;

    db.prepare('UPDATE subscriptions SET next_billing_date = ?, expiry_date = ? WHERE id = ?').run(
      nextBillingDate,
      expiryDate,
      subscription.id,
    );
    subscription.expiry_date = expiryDate;
    return !alreadyBilled;
  });
}

function closeExpired(asOf) {
  return db
    .prepare(
      `UPDATE subscriptions SET status = 'closed', next_billing_date = NULL
       WHERE status = 'active' AND expiry_date IS NOT NULL AND expiry_date <= ?
         AND plan_id IN (SELECT id FROM plans WHERE end_behavior = 'auto_close')`,
    )
    .run(asOf).changes;
}

export function runBilling(asOf = today()) {
  const summary = { asOf, invoicesCreated: 0, periodsSkipped: 0, subscriptionsClosed: 0, failures: [] };

  for (const subscription of dueSubscriptions(asOf)) {
    let periodStart = subscription.next_billing_date;
    let periods = 0;
    try {
      while (
        periodStart <= asOf &&
        canBillPeriod(subscription, periodStart) &&
        periods < MAX_PERIODS_PER_RUN
      ) {
        if (billPeriod(subscription, periodStart)) summary.invoicesCreated += 1;
        else summary.periodsSkipped += 1;
        periodStart = nextPeriodStart(subscription, periodStart);
        periods += 1;
      }
    } catch (err) {
      // One bad subscription shouldn't stop everyone else from being billed.
      summary.failures.push({ subscription: subscription.number, error: err.message });
    }
  }

  // Closing runs after billing so an auto-close subscription still gets its last invoice.
  summary.subscriptionsClosed = closeExpired(asOf);
  return summary;
}
