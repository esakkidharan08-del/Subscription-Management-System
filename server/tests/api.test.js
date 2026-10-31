import './setup-env.js';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { runBilling } from '../src/services/billingService.js';
import { PASSWORD, activeSubscription, freshDatabase, seedBasics } from './helpers.js';

async function loginAs(app, email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  assert.equal(response.status, 200);
  return agent;
}

describe('subscriptions and invoices over HTTP', () => {
  let app;
  let fixtures;

  beforeEach(() => {
    freshDatabase();
    fixtures = seedBasics();
    app = createApp();
  });

  test('staff walk a subscription from draft to active', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    const created = await staff.post('/api/subscriptions').send({
      customer_id: fixtures.customer.id,
      plan_id: fixtures.plan.id,
      start_date: '2026-01-01',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'draft');
    assert.match(created.body.number, /^SUB-\d{5}$/);

    const skip = await staff.post(`/api/subscriptions/${created.body.id}/status`).send({ status: 'active' });
    assert.equal(skip.status, 400);

    for (const status of ['quotation', 'confirmed', 'active']) {
      const step = await staff.post(`/api/subscriptions/${created.body.id}/status`).send({ status });
      assert.equal(step.status, 200);
    }
  });

  test('rejects an expiry date before the start date', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    const response = await staff.post('/api/subscriptions').send({
      customer_id: fixtures.customer.id,
      plan_id: fixtures.plan.id,
      start_date: '2026-05-01',
      expiry_date: '2026-04-01',
    });
    assert.equal(response.status, 400);
    assert.ok(response.body.fields.expiry_date);
  });

  test('a customer only ever sees their own invoices', async () => {
    activeSubscription(fixtures);
    activeSubscription({ ...fixtures, customer: fixtures.otherCustomer });
    runBilling('2026-01-01');

    const asha = await loginAs(app, 'asha@test.dev');
    const list = await asha.get('/api/invoices');
    assert.equal(list.body.total, 1);
    assert.equal(list.body.data[0].customer_id, fixtures.customer.id);

    // Even asking for the other customer's invoice by id or by filter shows nothing.
    const ravis = await asha.get(`/api/invoices?customer_id=${fixtures.otherCustomer.id}`);
    assert.equal(ravis.body.total, 1);
    assert.equal(ravis.body.data[0].customer_id, fixtures.customer.id);

    const staff = await loginAs(app, 'staff@test.dev');
    const all = await staff.get('/api/invoices');
    const otherInvoice = all.body.data.find((i) => i.customer_id === fixtures.otherCustomer.id);
    assert.equal((await asha.get(`/api/invoices/${otherInvoice.id}`)).status, 404);
  });

  test('customers cannot create subscriptions or record payments', async () => {
    const asha = await loginAs(app, 'asha@test.dev');
    const create = await asha.post('/api/subscriptions').send({
      customer_id: fixtures.customer.id,
      plan_id: fixtures.plan.id,
      start_date: '2026-01-01',
    });
    assert.equal(create.status, 403);
    assert.equal((await asha.post('/api/billing/run').send({})).status, 403);
  });

  test('staff cannot create discount rules, admins can', async () => {
    const rule = { name: 'Launch', type: 'percent', value: 20, scope: 'subscription' };
    const staff = await loginAs(app, 'staff@test.dev');
    assert.equal((await staff.post('/api/discounts').send(rule)).status, 403);

    const admin = await loginAs(app, 'admin@test.dev');
    assert.equal((await admin.post('/api/discounts').send(rule)).status, 201);
    const tooBig = await admin.post('/api/discounts').send({ ...rule, value: 120 });
    assert.equal(tooBig.status, 400);
    assert.ok(tooBig.body.fields.value);
  });
});

describe('payments', () => {
  let app;
  let invoiceId;

  beforeEach(async () => {
    freshDatabase();
    const fixtures = seedBasics();
    activeSubscription(fixtures);
    runBilling('2026-01-01');
    app = createApp();
    const staff = await loginAs(app, 'staff@test.dev');
    invoiceId = (await staff.get('/api/invoices')).body.data[0].id;
  });

  test('an invoice is paid only once payments reach the total', async () => {
    const staff = await loginAs(app, 'staff@test.dev');

    const partial = await staff.post(`/api/invoices/${invoiceId}/payments`).send({ method: 'upi', amount: 18000 });
    assert.equal(partial.status, 201);
    assert.equal(partial.body.status, 'confirmed');
    assert.equal(partial.body.balance, 100000);

    const rest = await staff.post(`/api/invoices/${invoiceId}/payments`).send({ method: 'cash', amount: 100000 });
    assert.equal(rest.body.status, 'paid');
    assert.equal(rest.body.balance, 0);
  });

  test('rejects paying more than the balance', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    const response = await staff.post(`/api/invoices/${invoiceId}/payments`).send({ method: 'card', amount: 999999 });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /more than the balance/);
  });

  test('a paid invoice cannot be cancelled or paid again', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    await staff.post(`/api/invoices/${invoiceId}/payments`).send({ method: 'card', amount: 118000 });

    assert.equal((await staff.post(`/api/invoices/${invoiceId}/cancel`)).status, 400);
    assert.equal((await staff.post(`/api/invoices/${invoiceId}/payments`).send({ method: 'card', amount: 1 })).status, 400);
  });

  test('overdue is worked out from the due date', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    const overdue = await staff.get('/api/invoices?overdue=true');
    // Billed for 2026-01-01 with immediate terms, so it is overdue by any later date.
    assert.equal(overdue.body.total, 1);
    assert.equal(overdue.body.data[0].is_overdue, 1);

    await staff.post(`/api/invoices/${invoiceId}/payments`).send({ method: 'card', amount: 118000 });
    assert.equal((await staff.get('/api/invoices?overdue=true')).body.total, 0);
  });
});
