import './setup-env.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { passwordField } from 'shared/validation/auth.js';
import { discountSchema } from 'shared/validation/discount.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { db } from '../src/db/index.js';
import { runBilling } from '../src/services/billingService.js';
import {
  PASSWORD,
  activeSubscription,
  countInvoices,
  freshDatabase,
  seedBasics,
} from './helpers.js';

async function loginAs(app, email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  return agent;
}

describe('draft invoices', () => {
  let app;
  let invoice;

  beforeEach(() => {
    freshDatabase();
    config.autoConfirmInvoices = false;
    activeSubscription(seedBasics());
    runBilling('2026-01-01');
    invoice = db.prepare('SELECT * FROM invoices').get();
    app = createApp();
  });

  afterEach(() => {
    config.autoConfirmInvoices = true;
  });

  test('billing leaves drafts when auto-confirm is off', () => {
    assert.equal(invoice.status, 'draft');
  });

  test('editing a draft re-totals it with the stored tax rate', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    const line = db.prepare('SELECT id FROM invoice_lines WHERE invoice_id = ?').get(invoice.id);

    const response = await staff.put(`/api/invoices/${invoice.id}`).send({
      due_date: '2026-01-20',
      lines: [{ id: line.id, quantity: 2, description: 'ERP, 2 seats' }],
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.subtotal, 200000);
    assert.equal(response.body.tax_total, 36000);
    assert.equal(response.body.total, 236000);
    assert.equal(response.body.due_date, '2026-01-20');
    assert.equal(response.body.lines[0].description, 'ERP, 2 seats');
  });

  test('a confirmed invoice cannot be edited', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    await staff.post(`/api/invoices/${invoice.id}/confirm`);

    const response = await staff
      .put(`/api/invoices/${invoice.id}`)
      .send({ due_date: '2026-02-01' });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /cannot be edited/);
  });

  test('rejects a line from another invoice', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    const response = await staff
      .put(`/api/invoices/${invoice.id}`)
      .send({ lines: [{ id: 9999, quantity: 1 }] });
    assert.equal(response.status, 400);
  });
});

describe('pausing subscriptions', () => {
  beforeEach(() => freshDatabase());

  test('a paused subscription is skipped and paused months are never billed', async () => {
    const fixtures = seedBasics({ endBehavior: 'pausable' });
    const subscription = activeSubscription(fixtures);
    runBilling('2026-01-15');

    const staff = await loginAs(createApp(), 'staff@test.dev');
    const paused = await staff.post(`/api/subscriptions/${subscription.id}/pause`);
    assert.equal(paused.status, 200);
    assert.ok(paused.body.paused_at);

    assert.equal(runBilling('2026-05-15').invoicesCreated, 0);

    const resumed = await staff.post(`/api/subscriptions/${subscription.id}/resume`);
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.paused_at, null);
    // Picks up from the next billing date after today, skipping the paused gap.
    assert.ok(resumed.body.next_billing_date >= new Date().toISOString().slice(0, 10));
    assert.equal(countInvoices(subscription.id), 1);
  });

  test('only pausable plans can be paused', async () => {
    const fixtures = seedBasics({ endBehavior: 'renewable' });
    const subscription = activeSubscription(fixtures);
    const staff = await loginAs(createApp(), 'staff@test.dev');

    const response = await staff.post(`/api/subscriptions/${subscription.id}/pause`);
    assert.equal(response.status, 400);
    assert.match(response.body.error, /does not allow pausing/);
  });
});

describe('shared validation', () => {
  test('the client and server get the same password messages', () => {
    const result = passwordField.safeParse('weakpass');
    assert.deepEqual(
      result.error.issues.map((issue) => issue.message),
      [
        'Password must be more than 8 characters',
        'Password needs an uppercase letter',
        'Password needs a special character',
      ],
    );
  });

  test('discount rules are enforced before reaching the server', () => {
    const result = discountSchema.safeParse({
      name: 'Big',
      type: 'percent',
      value: 150,
      scope: 'product',
    });
    const paths = result.error.issues.map((issue) => issue.path.join('.'));
    assert.ok(paths.includes('value'));
    assert.ok(paths.includes('product_id'));
  });
});
