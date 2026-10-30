import { nextNumber, withTransaction } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import { buildWhere } from '../lib/pagination.js';
import { assertTransition } from './lifecycle.js';

export function listSubscriptions(db, viewer, { status, page, pageSize, offset }) {
  const { clause, params } = buildWhere([
    ['s.customer_id = ?', viewer.role === 'customer' ? viewer.id : null],
    ['s.status = ?', status],
  ]);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM subscriptions s ${clause}`).get(...params);
  const items = db
    .prepare(
      `SELECT s.id, s.number, s.status, s.start_date, s.expiry_date, s.next_billing_date,
              u.name AS customer_name, p.name AS plan_name, p.billing_period
       FROM subscriptions s
       JOIN users u ON u.id = s.customer_id
       JOIN plans p ON p.id = s.plan_id
       ${clause}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset);
  return { items, total, page, pageSize };
}

export function getSubscription(db, id, viewer) {
  const subscription = db
    .prepare(
      `SELECT s.*, u.name AS customer_name, u.email AS customer_email,
              p.name AS plan_name, p.billing_period, p.end_behavior
       FROM subscriptions s
       JOIN users u ON u.id = s.customer_id
       JOIN plans p ON p.id = s.plan_id
       WHERE s.id = ?`,
    )
    .get(id);

  // Customers get a 404 for other people's records so ids can't be probed.
  if (!subscription || (viewer?.role === 'customer' && subscription.customer_id !== viewer.id)) {
    throw new AppError(404, 'Subscription not found');
  }

  subscription.lines = db
    .prepare(
      `SELECT sl.*, pr.name AS product_name
       FROM subscription_lines sl JOIN products pr ON pr.id = sl.product_id
       WHERE sl.subscription_id = ?`,
    )
    .all(id);
  return subscription;
}

export function createSubscription(db, input) {
  return withTransaction(db, () => {
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(input.plan_id);
    if (!plan) throw new AppError(400, 'Plan not found');

    const customer = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'customer'").get(input.customer_id);
    if (!customer) throw new AppError(400, 'Customer not found');

    const totalQuantity = input.lines.reduce((sum, line) => sum + line.quantity, 0);
    if (totalQuantity < plan.min_quantity) {
      throw new AppError(400, `This plan needs at least ${plan.min_quantity} units`);
    }

    const { lastInsertRowid: subscriptionId } = db
      .prepare(
        `INSERT INTO subscriptions (number, customer_id, plan_id, start_date, expiry_date, payment_terms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nextNumber(db, 'subscriptions', 'SUB'),
        input.customer_id,
        input.plan_id,
        input.start_date,
        input.expiry_date,
        input.payment_terms,
      );

    const insertLine = db.prepare(
      `INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price, tax_id, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const line of input.lines) {
      const product = db.prepare('SELECT sales_price FROM products WHERE id = ?').get(line.product_id);
      if (!product) throw new AppError(400, `Product ${line.product_id} not found`);
      const unitPrice = line.unit_price ?? product.sales_price;
      insertLine.run(subscriptionId, line.product_id, line.quantity, unitPrice, line.tax_id, unitPrice * line.quantity);
    }

    return getSubscription(db, subscriptionId);
  });
}

export function transitionSubscription(db, id, to) {
  const subscription = getSubscription(db, id);
  assertTransition(subscription.status, to);

  if (to === 'active') {
    db.prepare('UPDATE subscriptions SET status = ?, next_billing_date = COALESCE(next_billing_date, start_date) WHERE id = ?').run(to, id);
  } else {
    db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?').run(to, id);
  }
  return getSubscription(db, id);
}
