import './setup-env.js';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { db } from '../src/db/index.js';
import { runBilling } from '../src/services/billingService.js';
import { getSubscription } from '../src/services/subscriptionService.js';
import { activeSubscription, countInvoices, freshDatabase, insertDiscount, seedBasics } from './helpers.js';

describe('billing run', () => {
  beforeEach(() => freshDatabase());

  test('running billing twice never bills the same period twice', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);

    const first = runBilling('2026-01-15');
    const second = runBilling('2026-01-15');

    assert.equal(first.invoicesCreated, 1);
    assert.equal(second.invoicesCreated, 0);
    assert.equal(countInvoices(subscription.id), 1);
  });

  test('a retry after a crash skips the period that was already billed', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);
    runBilling('2026-01-15');

    // Simulate a run that saved the invoice but died before moving the date on.
    db.prepare('UPDATE subscriptions SET next_billing_date = ? WHERE id = ?').run('2026-01-01', subscription.id);
    const retry = runBilling('2026-01-15');

    assert.equal(retry.invoicesCreated, 0);
    assert.equal(retry.periodsSkipped, 1);
    assert.equal(countInvoices(subscription.id), 1);
    assert.equal(getSubscription(subscription.id).next_billing_date, '2026-02-01');
  });

  test('the database itself rejects a second invoice for one period', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);
    runBilling('2026-01-15');

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO invoices (number, subscription_id, customer_id, period_start, period_end, due_date)
             VALUES ('INV-X', ?, ?, '2026-01-01', '2026-01-31', '2026-01-01')`,
          )
          .run(subscription.id, fixtures.customer.id),
      /UNIQUE constraint failed/,
    );
  });

  test('catches up every missed period in one run', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);

    const summary = runBilling('2026-03-10');

    assert.equal(summary.invoicesCreated, 3);
    assert.equal(getSubscription(subscription.id).next_billing_date, '2026-04-01');
  });

  test('a subscription starting on the 31st returns to the 31st after short months', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures, { start_date: '2026-07-31' });

    runBilling('2026-10-31');

    const starts = db
      .prepare('SELECT period_start FROM invoices WHERE subscription_id = ? ORDER BY period_start')
      .all(subscription.id)
      .map((row) => row.period_start);
    assert.deepEqual(starts, ['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31']);
    assert.equal(getSubscription(subscription.id).next_billing_date, '2026-11-30');
  });

  test('invoice totals include 18% tax on the line amount', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);
    runBilling('2026-01-01');

    const invoice = db.prepare('SELECT * FROM invoices WHERE subscription_id = ?').get(subscription.id);
    assert.equal(invoice.subtotal, 100000);
    assert.equal(invoice.tax_total, 18000);
    assert.equal(invoice.total, 118000);
    assert.equal(invoice.period_end, '2026-01-31');
    assert.equal(invoice.status, 'confirmed');
  });

  test('payment terms set the due date', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures, { payment_terms: 'net_15' });
    runBilling('2026-01-01');

    const invoice = db.prepare('SELECT due_date FROM invoices WHERE subscription_id = ?').get(subscription.id);
    assert.equal(invoice.due_date, '2026-01-16');
  });

  test('draft and closed subscriptions are not billed', () => {
    const fixtures = seedBasics();
    const active = activeSubscription(fixtures);
    db.prepare("UPDATE subscriptions SET status = 'closed' WHERE id = ?").run(active.id);

    assert.equal(runBilling('2026-02-15').invoicesCreated, 0);
  });
});

describe('plan end behaviour', () => {
  beforeEach(() => freshDatabase());

  test('auto_close bills up to expiry, then closes the subscription', () => {
    const fixtures = seedBasics({ endBehavior: 'auto_close' });
    const subscription = activeSubscription(fixtures, { expiry_date: '2026-03-01' });

    const summary = runBilling('2026-04-15');

    assert.equal(summary.invoicesCreated, 2);
    assert.equal(summary.subscriptionsClosed, 1);
    assert.equal(getSubscription(subscription.id).status, 'closed');
  });

  test('manual_close stops billing at expiry but stays active for staff to close', () => {
    const fixtures = seedBasics({ endBehavior: 'manual_close' });
    const subscription = activeSubscription(fixtures, { expiry_date: '2026-03-01' });

    const summary = runBilling('2026-05-15');

    assert.equal(summary.invoicesCreated, 2);
    assert.equal(summary.subscriptionsClosed, 0);
    assert.equal(getSubscription(subscription.id).status, 'active');
  });

  test('renewable keeps billing past expiry and moves the expiry along', () => {
    const fixtures = seedBasics({ endBehavior: 'renewable' });
    const subscription = activeSubscription(fixtures, { expiry_date: '2026-02-01' });

    const summary = runBilling('2026-03-15');

    assert.equal(summary.invoicesCreated, 3);
    assert.equal(getSubscription(subscription.id).expiry_date, '2026-04-01');
  });
});

describe('discounts during billing', () => {
  beforeEach(() => freshDatabase());

  test('applies before tax and counts the use', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);
    const discountId = insertDiscount({ type: 'percent', value: 10 });

    runBilling('2026-01-01');

    const invoice = db.prepare('SELECT * FROM invoices WHERE subscription_id = ?').get(subscription.id);
    assert.equal(invoice.discount_total, 10000);
    assert.equal(invoice.tax_total, 16200);
    assert.equal(invoice.total, 106200);
    assert.equal(db.prepare('SELECT times_used FROM discounts WHERE id = ?').get(discountId).times_used, 1);
  });

  test('stops applying once the usage limit is reached', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);
    insertDiscount({ type: 'fixed', value: 5000, usage_limit: 2 });

    runBilling('2026-03-15');

    const discounts = db
      .prepare('SELECT discount_total FROM invoices WHERE subscription_id = ? ORDER BY period_start')
      .all(subscription.id)
      .map((row) => row.discount_total);
    assert.deepEqual(discounts, [5000, 5000, 0]);
  });

  test('stops applying after the end date', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);
    insertDiscount({ type: 'percent', value: 50, ends_at: '2026-01-31' });

    runBilling('2026-02-15');

    const discounts = db
      .prepare('SELECT discount_total FROM invoices WHERE subscription_id = ? ORDER BY period_start')
      .all(subscription.id)
      .map((row) => row.discount_total);
    assert.deepEqual(discounts, [50000, 0]);
  });

  test('a 100% discount produces an invoice that is already paid', () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);
    insertDiscount({ type: 'percent', value: 100 });

    runBilling('2026-01-01');

    const invoice = db.prepare('SELECT * FROM invoices WHERE subscription_id = ?').get(subscription.id);
    assert.equal(invoice.total, 0);
    assert.equal(invoice.status, 'paid');
  });
});
