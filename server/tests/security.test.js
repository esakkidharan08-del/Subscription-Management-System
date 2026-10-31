import './setup-env.js';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, openDatabase } from '../src/db/index.js';
import { migrations } from '../src/db/migrations.js';
import { runBilling } from '../src/services/billingService.js';
import { PASSWORD, activeSubscription, freshDatabase, seedBasics } from './helpers.js';

async function loginAs(app, email, password = PASSWORD) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  return agent;
}

describe('sessions', () => {
  let app;
  let fixtures;

  beforeEach(() => {
    freshDatabase();
    fixtures = seedBasics();
    app = createApp();
  });

  test('changing the password signs out other sessions but keeps this one', async () => {
    const laptop = await loginAs(app, 'asha@test.dev');
    const phone = await loginAs(app, 'asha@test.dev');

    const change = await laptop
      .post('/api/auth/change-password')
      .send({ current_password: PASSWORD, new_password: 'Changed@123' });
    assert.equal(change.status, 200);

    assert.equal((await laptop.get('/api/auth/me')).status, 200);
    assert.equal((await phone.get('/api/auth/me')).status, 401);
  });

  test('rejects a wrong current password', async () => {
    const agent = await loginAs(app, 'asha@test.dev');
    const response = await agent
      .post('/api/auth/change-password')
      .send({ current_password: 'Wrong@1234', new_password: 'Changed@123' });
    assert.equal(response.status, 400);
  });

  test('a role change takes effect on the next request, not at token expiry', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    assert.equal((await staff.get('/api/products')).status, 200);

    db.prepare("UPDATE users SET role = 'customer' WHERE id = ?").run(fixtures.staff.id);
    assert.equal((await staff.get('/api/products')).status, 403);
  });

  test('a deleted account loses access immediately', async () => {
    const agent = await loginAs(app, 'ravi@test.dev');
    db.prepare('DELETE FROM users WHERE id = ?').run(fixtures.otherCustomer.id);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });
});

describe('request hardening', () => {
  let app;

  beforeEach(() => {
    freshDatabase();
    seedBasics();
    app = createApp();
  });

  test('malformed JSON is a 400, not a server error', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    assert.equal(response.status, 400);
  });

  test('a post from a foreign origin is refused', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'asha@test.dev', password: PASSWORD });
    assert.equal(response.status, 403);
  });

  test('API responses are not cacheable and carry security headers', async () => {
    const response = await request(app).get('/api/health');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-powered-by'], undefined);
  });
});

describe('audit log and customer payments', () => {
  let app;
  let fixtures;

  beforeEach(() => {
    freshDatabase();
    fixtures = seedBasics();
    activeSubscription(fixtures);
    activeSubscription({ ...fixtures, customer: fixtures.otherCustomer });
    runBilling('2026-01-01');
    app = createApp();
  });

  const invoiceFor = (customerId) =>
    db.prepare('SELECT id, total FROM invoices WHERE customer_id = ?').get(customerId);

  test('a customer can pay their own invoice online', async () => {
    const asha = await loginAs(app, 'asha@test.dev');
    const invoice = invoiceFor(fixtures.customer.id);
    const response = await asha
      .post(`/api/invoices/${invoice.id}/payments`)
      .send({ method: 'upi', amount: invoice.total });
    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'paid');
  });

  test("a customer cannot pay someone else's invoice or pay in cash", async () => {
    const asha = await loginAs(app, 'asha@test.dev');
    const ravis = invoiceFor(fixtures.otherCustomer.id);
    const own = invoiceFor(fixtures.customer.id);

    const other = await asha.post(`/api/invoices/${ravis.id}/payments`).send({ method: 'upi', amount: 100 });
    assert.equal(other.status, 404);
    const cash = await asha.post(`/api/invoices/${own.id}/payments`).send({ method: 'cash', amount: 100 });
    assert.equal(cash.status, 400);
  });

  test('payments and status changes are recorded with who made them', async () => {
    const staff = await loginAs(app, 'staff@test.dev');
    const invoice = invoiceFor(fixtures.customer.id);
    await staff.post(`/api/invoices/${invoice.id}/payments`).send({ method: 'cash', amount: 1000 });

    const admin = await loginAs(app, 'admin@test.dev');
    const log = await admin.get('/api/audit');
    const payment = log.body.data.find((entry) => entry.action === 'payment_recorded');
    assert.equal(payment.actor_name, 'Staff');
    assert.deepEqual(payment.details, { method: 'cash', amount: 1000 });

    assert.equal((await staff.get('/api/audit')).status, 403);
  });

  test('CSV export quotes fields and defuses spreadsheet formulas', async () => {
    db.prepare("UPDATE users SET name = '=HYPERLINK(\"x\")' WHERE id = ?").run(fixtures.customer.id);
    const staff = await loginAs(app, 'staff@test.dev');
    const response = await staff.get('/api/invoices/export.csv');

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv/);
    const lines = response.text.trim().split('\n');
    assert.equal(lines.length, 3);
    assert.match(response.text, /"'=HYPERLINK\(""x""\)"/);
  });
});

describe('dashboard', () => {
  test('sums recurring revenue and receivables in SQL', async () => {
    freshDatabase();
    const fixtures = seedBasics();
    activeSubscription(fixtures);
    runBilling('2026-02-15');
    const app = createApp();

    const admin = await loginAs(app, 'admin@test.dev');
    const { body } = await admin.get('/api/dashboard');
    assert.equal(body.mrr, 100000);
    assert.equal(body.activeSubscriptions, 1);
    assert.equal(body.receivables.open_count, 2);
    assert.equal(body.receivables.outstanding, 236000);
    assert.equal(body.monthlyRevenue.length, 12);

    const asha = await loginAs(app, 'asha@test.dev');
    const own = await asha.get('/api/dashboard');
    assert.equal(own.body.customer.balance_due, 236000);
  });
});

describe('migrations', () => {
  test('a new database ends up on the latest version', () => {
    const database = openDatabase(':memory:');
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, migrations.length);
  });
});
