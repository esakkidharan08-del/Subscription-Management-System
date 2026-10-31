import { db, transaction } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { pagedResult } from '../lib/pagination.js';
import { assertTransition } from './lifecycle.js';
import { nextNumber } from './numbering.js';
import { getPlan, isPlanAvailable } from './planService.js';
import { getProduct } from './productService.js';
import { getTemplate } from './quotationTemplateService.js';
import { pickTaxRule } from './tax.js';
import { listTaxRules } from './taxService.js';

// Once a subscription is confirmed, its lines are what the customer agreed to.
const EDITABLE_STATUSES = new Set(['draft', 'quotation']);

const SUBSCRIPTION_COLUMNS = `
  s.*, u.name AS customer_name, u.email AS customer_email,
  pl.name AS plan_name, pl.billing_period, pl.end_behavior,
  (SELECT COALESCE(SUM(sl.amount), 0) FROM subscription_lines sl WHERE sl.subscription_id = s.id)
    AS recurring_amount`;

const SUBSCRIPTION_JOINS = `
  FROM subscriptions s
  JOIN users u ON u.id = s.customer_id
  JOIN plans pl ON pl.id = s.plan_id`;

function assertCustomerAccount(customerId) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(customerId);
  if (!user) throw badRequest('Customer not found');
  if (user.role !== 'customer') throw badRequest('Subscriptions can only belong to customer accounts');
}

function priceLines(plan, requestedLines) {
  const lines = requestedLines.length
    ? requestedLines
    : [{ product_id: plan.product_id, quantity: plan.min_quantity }];
  const taxRules = listTaxRules();

  return lines.map((line) => {
    const product = getProduct(line.product_id);
    const listPrice = product.id === plan.product_id ? plan.price : product.sales_price;
    const unitPrice = line.unit_price ?? listPrice;
    const rule = pickTaxRule(taxRules, product);
    return {
      product_id: product.id,
      quantity: line.quantity,
      unit_price: unitPrice,
      tax_id: rule?.tax_id ?? null,
      amount: unitPrice * line.quantity,
    };
  });
}

function assertPlanRules(plan, startDate, lines) {
  if (!isPlanAvailable(plan, startDate)) {
    throw badRequest(`The ${plan.name} plan is not available on ${startDate}`);
  }
  const planQuantity = lines
    .filter((line) => line.product_id === plan.product_id)
    .reduce((total, line) => total + line.quantity, 0);
  if (planQuantity < plan.min_quantity) {
    throw badRequest(`The ${plan.name} plan needs a quantity of at least ${plan.min_quantity}`);
  }
}

function replaceLines(subscriptionId, lines) {
  db.prepare('DELETE FROM subscription_lines WHERE subscription_id = ?').run(subscriptionId);
  const insert = db.prepare(
    `INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price, tax_id, amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const line of lines) {
    insert.run(subscriptionId, line.product_id, line.quantity, line.unit_price, line.tax_id, line.amount);
  }
}

// Customers get "not found" for other people's records, so ids can't be probed.
function assertCanView(subscription, viewer) {
  if (viewer?.role === 'customer' && subscription.customer_id !== viewer.id) {
    throw notFound('Subscription');
  }
}

export function getSubscription(id, viewer) {
  const subscription = db
    .prepare(`SELECT ${SUBSCRIPTION_COLUMNS} ${SUBSCRIPTION_JOINS} WHERE s.id = ?`)
    .get(id);
  if (!subscription) throw notFound('Subscription');
  assertCanView(subscription, viewer);

  const lines = db
    .prepare(
      `SELECT sl.*, p.name AS product_name, t.name AS tax_name, t.rate_bp
       FROM subscription_lines sl
       JOIN products p ON p.id = sl.product_id
       LEFT JOIN taxes t ON t.id = sl.tax_id
       WHERE sl.subscription_id = ? ORDER BY sl.id`,
    )
    .all(id);
  return { ...subscription, lines };
}

export function listSubscriptions({ status, search, customerId }, paging) {
  const filters = [];
  const params = [];

  if (status) {
    filters.push('s.status = ?');
    params.push(status);
  }
  if (customerId) {
    filters.push('s.customer_id = ?');
    params.push(customerId);
  }
  if (search) {
    filters.push('(s.number LIKE ? OR u.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM subscriptions s JOIN users u ON u.id = s.customer_id ${where}`)
    .get(...params);
  const rows = db
    .prepare(
      `SELECT ${SUBSCRIPTION_COLUMNS} ${SUBSCRIPTION_JOINS} ${where}
       ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, paging.limit, paging.offset);

  return pagedResult(rows, total, paging);
}

export function createSubscription(data) {
  return transaction(() => {
    assertCustomerAccount(data.customer_id);
    const plan = getPlan(data.plan_id);
    const lines = priceLines(plan, data.lines ?? []);
    assertPlanRules(plan, data.start_date, lines);

    const result = db
      .prepare(
        `INSERT INTO subscriptions (number, customer_id, plan_id, start_date, expiry_date, payment_terms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nextNumber('subscriptions', 'SUB'),
        data.customer_id,
        plan.id,
        data.start_date,
        data.expiry_date ?? null,
        data.payment_terms ?? 'immediate',
      );
    const id = Number(result.lastInsertRowid);
    replaceLines(id, lines);
    return getSubscription(id);
  });
}

export function createFromTemplate({ template_id, ...data }) {
  const template = getTemplate(template_id);
  return createSubscription({ ...data, plan_id: template.plan_id, lines: template.lines });
}

export function updateSubscription(id, data) {
  return transaction(() => {
    const current = getSubscription(id);
    if (!EDITABLE_STATUSES.has(current.status)) {
      throw badRequest(`A ${current.status} subscription can no longer be edited`);
    }
    assertCustomerAccount(data.customer_id);
    const plan = getPlan(data.plan_id);
    const lines = priceLines(plan, data.lines ?? []);
    assertPlanRules(plan, data.start_date, lines);

    db.prepare(
      `UPDATE subscriptions SET customer_id = ?, plan_id = ?, start_date = ?, expiry_date = ?,
         payment_terms = ? WHERE id = ?`,
    ).run(data.customer_id, plan.id, data.start_date, data.expiry_date, data.payment_terms, id);
    replaceLines(id, lines);
    return getSubscription(id);
  });
}

export function changeStatus(id, nextStatus) {
  return transaction(() => {
    const subscription = getSubscription(id);
    assertTransition(subscription.status, nextStatus);

    if (nextStatus === 'confirmed' && subscription.lines.length === 0) {
      throw badRequest('Add at least one line before confirming');
    }

    let nextBillingDate = subscription.next_billing_date;
    if (nextStatus === 'active') nextBillingDate ??= subscription.start_date;
    if (nextStatus === 'closed') nextBillingDate = null;

    db.prepare('UPDATE subscriptions SET status = ?, next_billing_date = ? WHERE id = ?').run(
      nextStatus,
      nextBillingDate,
      id,
    );
    return getSubscription(id);
  });
}
