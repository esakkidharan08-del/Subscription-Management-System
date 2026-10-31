import './setup-env.js';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { addDays, today } from '../src/lib/dates.js';
import { setMailer } from '../src/lib/mailer.js';
import { runBilling } from '../src/services/billingService.js';
import { createProduct } from '../src/services/productService.js';
import { changeStatus, createSubscription } from '../src/services/subscriptionService.js';
import { createTemplate } from '../src/services/quotationTemplateService.js';
import { PASSWORD, activeSubscription, freshDatabase, seedBasics } from './helpers.js';

async function loginAs(app, email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  return agent;
}

describe('variants change the price', () => {
  beforeEach(() => freshDatabase());

  test('choosing the Odoo brand adds 560 to each unit, through to the invoice', async () => {
    const fixtures = seedBasics();
    const crm = createProduct({
      name: 'CRM',
      type: 'software',
      sales_price: 100000,
      cost_price: 0,
      notes: null,
      variants: [{ attribute: 'brand', value: 'Odoo', price_delta: 56000 }],
    });
    const odoo = crm.variants[0];

    const subscription = createSubscription({
      customer_id: fixtures.customer.id,
      plan_id: fixtures.plan.id,
      start_date: '2026-01-01',
      lines: [
        { product_id: fixtures.product.id, quantity: 1 },
        { product_id: crm.id, variant_id: odoo.id, quantity: 2 },
      ],
    });
    const line = subscription.lines.find((l) => l.product_id === crm.id);
    assert.equal(line.unit_price, 156000);
    assert.equal(line.amount, 312000);
    assert.equal(line.variant_value, 'Odoo');

    for (const status of ['quotation', 'confirmed', 'active'])
      changeStatus(subscription.id, status);
    runBilling('2026-01-01');
    const invoiceLine = db.prepare('SELECT * FROM invoice_lines WHERE product_id = ?').get(crm.id);
    assert.match(invoiceLine.description, /brand: Odoo/);
    assert.equal(invoiceLine.unit_price, 156000);
  });

  test('a variant from another product is refused', async () => {
    const fixtures = seedBasics();
    const other = createProduct({
      name: 'Other',
      type: 'software',
      sales_price: 100,
      cost_price: 0,
      notes: null,
      variants: [{ attribute: 'size', value: 'L', price_delta: 10 }],
    });
    const staff = await loginAs(createApp(), 'staff@test.dev');
    const response = await staff.post('/api/subscriptions').send({
      customer_id: fixtures.customer.id,
      plan_id: fixtures.plan.id,
      start_date: '2026-01-01',
      lines: [{ product_id: fixtures.product.id, quantity: 1, variant_id: other.variants[0].id }],
    });
    assert.equal(response.status, 400);
  });
});

describe('quotation validity', () => {
  beforeEach(() => freshDatabase());

  test('a quotation from a template is valid for the template days, then cannot be confirmed', async () => {
    const fixtures = seedBasics();
    const template = createTemplate({
      name: 'Starter',
      plan_id: fixtures.plan.id,
      validity_days: 15,
      lines: [{ product_id: fixtures.product.id, quantity: 3 }],
    });
    const app = createApp();
    const staff = await loginAs(app, 'staff@test.dev');

    const created = await staff.post('/api/subscriptions/from-template').send({
      template_id: template.id,
      customer_id: fixtures.customer.id,
      start_date: today(),
    });
    const id = created.body.id;
    const quoted = await staff
      .post(`/api/subscriptions/${id}/status`)
      .send({ status: 'quotation' });
    assert.equal(quoted.body.quote_valid_until, addDays(today(), 15));

    db.prepare('UPDATE subscriptions SET quote_valid_until = ? WHERE id = ?').run(
      addDays(today(), -1),
      id,
    );
    const late = await staff.post(`/api/subscriptions/${id}/status`).send({ status: 'confirmed' });
    assert.equal(late.status, 400);
    assert.match(late.body.error, /expired/);

    await staff.post(`/api/subscriptions/${id}/extend-quote`);
    const confirmed = await staff
      .post(`/api/subscriptions/${id}/status`)
      .send({ status: 'confirmed' });
    assert.equal(confirmed.status, 200);
  });
});

describe('renewing', () => {
  beforeEach(() => freshDatabase());

  test('renew moves the expiry on one period and billing carries on', async () => {
    const fixtures = seedBasics({ endBehavior: 'manual_close' });
    const subscription = activeSubscription(fixtures, { expiry_date: '2026-03-01' });
    assert.equal(runBilling('2026-04-15').invoicesCreated, 2);

    const staff = await loginAs(createApp(), 'staff@test.dev');
    const renewed = await staff.post(`/api/subscriptions/${subscription.id}/renew`);
    assert.equal(renewed.body.expiry_date, '2026-04-01');
    assert.equal(runBilling('2026-04-15').invoicesCreated, 1);
  });

  test('a subscription with no end date has nothing to renew', async () => {
    const fixtures = seedBasics();
    const subscription = activeSubscription(fixtures);
    const staff = await loginAs(createApp(), 'staff@test.dev');
    assert.equal((await staff.post(`/api/subscriptions/${subscription.id}/renew`)).status, 400);
  });
});

describe('customer self-service', () => {
  let app;
  let fixtures;
  let subscription;
  let addon;

  beforeEach(() => {
    freshDatabase();
    fixtures = seedBasics();
    subscription = activeSubscription(fixtures);
    addon = createProduct({
      name: 'Priority Support',
      type: 'addon',
      sales_price: 49900,
      cost_price: 0,
      notes: null,
      variants: [],
    });
    app = createApp();
  });

  test('a customer switches an add-on on and off, and it shows on the next invoice', async () => {
    const asha = await loginAs(app, 'asha@test.dev');
    const on = await asha
      .post(`/api/subscriptions/${subscription.id}/addons`)
      .send({ product_id: addon.id, quantity: 1 });
    assert.equal(on.status, 201);
    assert.equal(on.body.recurring_amount, 100000 + 49900);

    runBilling('2026-01-01');
    const invoice = db
      .prepare('SELECT subtotal FROM invoices WHERE subscription_id = ?')
      .get(subscription.id);
    assert.equal(invoice.subtotal, 149900);

    const line = on.body.lines.find((l) => l.product_id === addon.id);
    const off = await asha.delete(`/api/subscriptions/${subscription.id}/addons/${line.id}`);
    assert.equal(off.body.recurring_amount, 100000);
  });

  test('the plan itself cannot be switched off as an add-on, and non add-ons cannot be added', async () => {
    const asha = await loginAs(app, 'asha@test.dev');
    const planLine = subscription.lines[0];
    assert.equal(
      (await asha.delete(`/api/subscriptions/${subscription.id}/addons/${planLine.id}`)).status,
      400,
    );
    const wrong = await asha
      .post(`/api/subscriptions/${subscription.id}/addons`)
      .send({ product_id: fixtures.product.id, quantity: 1 });
    assert.equal(wrong.status, 400);
  });

  test("a customer can cancel their own subscription but not someone else's, and cannot activate", async () => {
    const ravisSubscription = activeSubscription({ ...fixtures, customer: fixtures.otherCustomer });
    const asha = await loginAs(app, 'asha@test.dev');

    const other = await asha
      .post(`/api/subscriptions/${ravisSubscription.id}/status`)
      .send({ status: 'closed' });
    assert.equal(other.status, 404);
    const activate = await asha
      .post(`/api/subscriptions/${subscription.id}/status`)
      .send({ status: 'active' });
    assert.equal(activate.status, 403);

    const cancel = await asha
      .post(`/api/subscriptions/${subscription.id}/status`)
      .send({ status: 'closed' });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.status, 'closed');
  });
});

describe('sending invoices', () => {
  test('sends a confirmed invoice to the customer and records when', async () => {
    freshDatabase();
    activeSubscription(seedBasics());
    runBilling('2026-01-01');
    const sent = [];
    setMailer({ send: async (message) => sent.push(message) });

    const app = createApp();
    const staff = await loginAs(app, 'staff@test.dev');
    const invoice = db.prepare('SELECT id, number FROM invoices').get();
    const response = await staff.post(`/api/invoices/${invoice.id}/send`);

    assert.equal(response.status, 200);
    assert.ok(response.body.sent_at);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'asha@test.dev');
    assert.match(sent[0].subject, new RegExp(invoice.number));

    const asha = await loginAs(app, 'asha@test.dev');
    assert.equal((await asha.post(`/api/invoices/${invoice.id}/send`)).status, 403);
  });
});

describe('payments list and report period', () => {
  let app;

  beforeEach(async () => {
    freshDatabase();
    const fixtures = seedBasics();
    activeSubscription(fixtures);
    activeSubscription({ ...fixtures, customer: fixtures.otherCustomer });
    runBilling('2026-02-15');
    app = createApp();
    const staff = await loginAs(app, 'staff@test.dev');
    const invoices = db.prepare('SELECT id, total FROM invoices ORDER BY id').all();
    await staff
      .post(`/api/invoices/${invoices[0].id}/payments`)
      .send({ method: 'upi', amount: 50000, paid_on: '2026-01-05' });
    await staff
      .post(`/api/invoices/${invoices[1].id}/payments`)
      .send({ method: 'cash', amount: 20000, paid_on: '2026-02-10' });
    await staff
      .post(`/api/invoices/${invoices[2].id}/payments`)
      .send({ method: 'upi', amount: 30000, paid_on: '2026-02-12' });
  });

  test('lists payments with filters and totals over the filtered set', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    const all = await staff.get('/api/payments');
    assert.equal(all.body.summary.count, 3);
    assert.equal(all.body.summary.total, 100000);

    const february = await staff.get('/api/payments?from=2026-02-01&to=2026-02-28');
    assert.equal(february.body.summary.total, 50000);

    const upi = await staff.get('/api/payments?method=upi');
    assert.equal(upi.body.summary.total, 80000);
    assert.deepEqual(
      upi.body.summary.byMethod.map((m) => m.method),
      ['upi'],
    );
  });

  test('a customer sees only their own payments', async () => {
    const asha = await loginAs(app, 'asha@test.dev');
    const own = await asha.get('/api/payments');
    const ashaId = db.prepare("SELECT id FROM users WHERE email = 'asha@test.dev'").get().id;
    assert.ok(own.body.data.every((payment) => payment.customer_id === ashaId));
  });

  test('the dashboard reports over the chosen number of months', async () => {
    const admin = await loginAs(app, 'admin@test.dev');
    const six = await admin.get('/api/dashboard?months=6');
    assert.equal(six.body.monthlyRevenue.length, 6);
    assert.equal(
      six.body.periodTotals.collected,
      six.body.monthlyRevenue.reduce((sum, m) => sum + m.collected, 0),
    );
    const odd = await admin.get('/api/dashboard?months=7');
    assert.equal(odd.body.monthlyRevenue.length, 12);
  });
});
