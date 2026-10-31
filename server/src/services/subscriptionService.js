import { db, transaction } from '../db/index.js';
import { recordAudit } from '../lib/audit.js';
import { addDays, nextBillingDate, today } from '../lib/dates.js';
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

// Products of this type are optional extras customers switch on and off themselves.
export const ADDON_TYPE = 'addon';

const DEFAULT_QUOTE_DAYS = 30;

const SUBSCRIPTION_COLUMNS = `
  s.*, u.name AS customer_name, u.email AS customer_email,
  pl.name AS plan_name, pl.billing_period, pl.end_behavior, pl.product_id AS plan_product_id,
  (SELECT COALESCE(SUM(sl.amount), 0) FROM subscription_lines sl WHERE sl.subscription_id = s.id)
    AS recurring_amount`;

const SUBSCRIPTION_JOINS = `
  FROM subscriptions s
  JOIN users u ON u.id = s.customer_id
  JOIN plans pl ON pl.id = s.plan_id`;

function assertCustomerAccount(customerId) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(customerId);
  if (!user) throw badRequest('Customer not found');
  if (user.role !== 'customer')
    throw badRequest('Subscriptions can only belong to customer accounts');
}

function findVariant(product, variantId) {
  if (!variantId) return null;
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) throw badRequest(`That variant is not one of ${product.name}'s options`);
  return variant;
}

// A variant's price_delta is added to the list price: choosing the Odoo brand
// on a product with a +560 delta makes each unit 560 dearer. A price typed in
// by staff replaces the list price but still carries the variant's delta.
function priceLine(line, plan, taxRules) {
  const product = getProduct(line.product_id);
  const variant = findVariant(product, line.variant_id);
  const listPrice = product.id === plan?.product_id ? plan.price : product.sales_price;
  const unitPrice = (line.unit_price ?? listPrice) + (variant?.price_delta ?? 0);
  if (unitPrice < 0) throw badRequest(`The ${product.name} line would have a negative price`);
  const rule = pickTaxRule(taxRules, product);
  return {
    product_id: product.id,
    variant_id: variant?.id ?? null,
    quantity: line.quantity,
    unit_price: unitPrice,
    tax_id: rule?.tax_id ?? null,
    amount: unitPrice * line.quantity,
  };
}

function priceLines(plan, requestedLines) {
  const lines = requestedLines.length
    ? requestedLines
    : [{ product_id: plan.product_id, quantity: plan.min_quantity }];
  const taxRules = listTaxRules();
  return lines.map((line) => priceLine(line, plan, taxRules));
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

const insertLineSql = `INSERT INTO subscription_lines
  (subscription_id, product_id, variant_id, quantity, unit_price, tax_id, amount)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

function insertLine(subscriptionId, line) {
  return db
    .prepare(insertLineSql)
    .run(
      subscriptionId,
      line.product_id,
      line.variant_id,
      line.quantity,
      line.unit_price,
      line.tax_id,
      line.amount,
    );
}

function replaceLines(subscriptionId, lines) {
  db.prepare('DELETE FROM subscription_lines WHERE subscription_id = ?').run(subscriptionId);
  for (const line of lines) insertLine(subscriptionId, line);
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
      `SELECT sl.*, p.name AS product_name, p.type AS product_type,
         v.attribute AS variant_attribute, v.value AS variant_value,
         t.name AS tax_name, t.rate_bp
       FROM subscription_lines sl
       JOIN products p ON p.id = sl.product_id
       LEFT JOIN product_variants v ON v.id = sl.variant_id
       LEFT JOIN taxes t ON t.id = sl.tax_id
       WHERE sl.subscription_id = ? ORDER BY sl.id`,
    )
    .all(id);

  const quoteExpired =
    subscription.status === 'quotation' &&
    subscription.quote_valid_until !== null &&
    subscription.quote_valid_until < today();
  return { ...subscription, lines, quote_expired: quoteExpired };
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
    .prepare(
      `SELECT COUNT(*) AS total FROM subscriptions s JOIN users u ON u.id = s.customer_id ${where}`,
    )
    .get(...params);
  const rows = db
    .prepare(
      `SELECT ${SUBSCRIPTION_COLUMNS} ${SUBSCRIPTION_JOINS} ${where}
       ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, paging.limit, paging.offset);

  return pagedResult(rows, total, paging);
}

export function createSubscription(data, actor) {
  return transaction(() => {
    assertCustomerAccount(data.customer_id);
    const plan = getPlan(data.plan_id);
    const lines = priceLines(plan, data.lines ?? []);
    assertPlanRules(plan, data.start_date, lines);

    const result = db
      .prepare(
        `INSERT INTO subscriptions (number, customer_id, plan_id, start_date, expiry_date,
           payment_terms, quote_validity_days)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nextNumber('subscriptions', 'SUB'),
        data.customer_id,
        plan.id,
        data.start_date,
        data.expiry_date ?? null,
        data.payment_terms ?? 'immediate',
        data.quote_validity_days ?? DEFAULT_QUOTE_DAYS,
      );
    const id = Number(result.lastInsertRowid);
    replaceLines(id, lines);
    recordAudit(actor, 'subscription_created', 'subscription', id, { plan_id: plan.id });
    return getSubscription(id);
  });
}

// The template's validity carries over, so the quotation sent from it expires on time.
export function createFromTemplate({ template_id, ...data }, actor) {
  const template = getTemplate(template_id);
  return createSubscription(
    {
      ...data,
      plan_id: template.plan_id,
      lines: template.lines,
      quote_validity_days: template.validity_days,
    },
    actor,
  );
}

export function updateSubscription(id, data, actor) {
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
    recordAudit(actor, 'subscription_updated', 'subscription', id);
    return getSubscription(id);
  });
}

export function changeStatus(id, nextStatus, actor) {
  return transaction(() => {
    const subscription = getSubscription(id, actor);
    assertTransition(subscription.status, nextStatus);

    if (nextStatus === 'confirmed' && subscription.lines.length === 0) {
      throw badRequest('Add at least one line before confirming');
    }
    if (nextStatus === 'confirmed' && subscription.quote_expired) {
      throw badRequest(
        `This quotation expired on ${subscription.quote_valid_until}. Extend it before confirming.`,
      );
    }

    let nextBillingDate = subscription.next_billing_date;
    if (nextStatus === 'active') nextBillingDate ??= subscription.start_date;
    if (nextStatus === 'closed') nextBillingDate = null;

    // Sending the quotation starts its validity clock.
    const quoteValidUntil =
      nextStatus === 'quotation'
        ? addDays(today(), subscription.quote_validity_days)
        : subscription.quote_valid_until;

    db.prepare(
      `UPDATE subscriptions SET status = ?, next_billing_date = ?, quote_valid_until = ?
       WHERE id = ?`,
    ).run(nextStatus, nextBillingDate, quoteValidUntil, id);
    recordAudit(actor, 'status_changed', 'subscription', id, {
      from: subscription.status,
      to: nextStatus,
    });
    return getSubscription(id);
  });
}

// Gives an open quotation a fresh validity period from today, for a customer who
// needed longer to decide.
export function extendQuotation(id, actor) {
  return transaction(() => {
    const subscription = getSubscription(id);
    if (subscription.status !== 'quotation') throw badRequest('Only quotations can be extended');
    const validUntil = addDays(today(), subscription.quote_validity_days);
    db.prepare('UPDATE subscriptions SET quote_valid_until = ? WHERE id = ?').run(validUntil, id);
    recordAudit(actor, 'quotation_extended', 'subscription', id, { valid_until: validUntil });
    return getSubscription(id);
  });
}

// Moves the expiry on by one billing period. On a manual-close or pausable plan
// that had stopped billing at its expiry, billing picks up again.
export function renewSubscription(id, actor) {
  return transaction(() => {
    const subscription = getSubscription(id);
    if (subscription.status !== 'active')
      throw badRequest('Only active subscriptions can be renewed');
    if (!subscription.expiry_date) {
      throw badRequest('This subscription has no end date, so there is nothing to renew');
    }
    const newExpiry = nextBillingDate(
      subscription.start_date,
      subscription.expiry_date,
      subscription.billing_period,
    );
    db.prepare('UPDATE subscriptions SET expiry_date = ? WHERE id = ?').run(newExpiry, id);
    recordAudit(actor, 'subscription_renewed', 'subscription', id, {
      from: subscription.expiry_date,
      to: newExpiry,
    });
    return getSubscription(id);
  });
}

// Only plans marked "pausable" can be put on hold. Billing skips paused
// subscriptions, and resuming picks up at the next billing date from today,
// so the months spent paused are never billed.
export function pauseSubscription(id, actor) {
  return transaction(() => {
    const subscription = getSubscription(id, actor);
    if (subscription.status !== 'active')
      throw badRequest('Only active subscriptions can be paused');
    if (subscription.end_behavior !== 'pausable') {
      throw badRequest('This plan does not allow pausing');
    }
    if (subscription.paused_at) throw badRequest('This subscription is already paused');

    db.prepare('UPDATE subscriptions SET paused_at = ? WHERE id = ?').run(today(), id);
    recordAudit(actor, 'subscription_paused', 'subscription', id);
    return getSubscription(id);
  });
}

export function resumeSubscription(id, actor) {
  return transaction(() => {
    const subscription = getSubscription(id, actor);
    if (!subscription.paused_at) throw badRequest('This subscription is not paused');

    const resumeOn = today();
    let nextDate = subscription.next_billing_date ?? subscription.start_date;
    while (nextDate < resumeOn) {
      nextDate = nextBillingDate(subscription.start_date, nextDate, subscription.billing_period);
    }

    db.prepare('UPDATE subscriptions SET paused_at = NULL, next_billing_date = ? WHERE id = ?').run(
      nextDate,
      id,
    );
    recordAudit(actor, 'subscription_resumed', 'subscription', id, { next_billing_date: nextDate });
    return getSubscription(id);
  });
}

export function listAddons() {
  return db
    .prepare('SELECT id, name, sales_price, notes FROM products WHERE type = ? ORDER BY name')
    .all(ADDON_TYPE);
}

// Switching an add-on on adds its line to the subscription; the next invoice
// picks it up. Customers can do this themselves on their own subscriptions.
export function addAddon(id, { product_id, variant_id, quantity }, actor) {
  return transaction(() => {
    const subscription = getSubscription(id, actor);
    if (subscription.status !== 'active') {
      throw badRequest('Add-ons can only be switched on for an active subscription');
    }
    const product = getProduct(product_id);
    if (product.type !== ADDON_TYPE) throw badRequest(`${product.name} is not an add-on`);
    if (subscription.lines.some((line) => line.product_id === product.id)) {
      throw badRequest(`${product.name} is already switched on`);
    }

    const line = priceLine({ product_id, variant_id, quantity }, null, listTaxRules());
    insertLine(id, line);
    recordAudit(actor, 'addon_added', 'subscription', id, { product: product.name, quantity });
    return getSubscription(id);
  });
}

export function removeAddon(id, lineId, actor) {
  return transaction(() => {
    const subscription = getSubscription(id, actor);
    const line = subscription.lines.find((l) => l.id === lineId);
    if (!line) throw notFound('Line');
    if (line.product_type !== ADDON_TYPE) {
      throw badRequest('Only add-ons can be switched off. The plan itself stays on.');
    }
    db.prepare('DELETE FROM subscription_lines WHERE id = ?').run(lineId);
    recordAudit(actor, 'addon_removed', 'subscription', id, { product: line.product_name });
    return getSubscription(id);
  });
}
