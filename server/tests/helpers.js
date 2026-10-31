import { db, openDatabase, useDatabase } from '../src/db/index.js';
import { createUser } from '../src/services/authService.js';
import { createPlan } from '../src/services/planService.js';
import { createProduct } from '../src/services/productService.js';
import { changeStatus, createSubscription } from '../src/services/subscriptionService.js';
import { createTax, createTaxRule } from '../src/services/taxService.js';

export const PASSWORD = 'Test@12345';

export function freshDatabase() {
  useDatabase(openDatabase(':memory:'));
}

// A small catalog: one 18% taxed product on a monthly plan, and two customers.
export function seedBasics({ endBehavior = 'renewable', billingPeriod = 'monthly' } = {}) {
  const admin = createUser({
    name: 'Admin',
    email: 'admin@test.dev',
    password: PASSWORD,
    role: 'admin',
  });
  const staff = createUser({
    name: 'Staff',
    email: 'staff@test.dev',
    password: PASSWORD,
    role: 'staff',
  });
  const customer = createUser({
    name: 'Asha',
    email: 'asha@test.dev',
    password: PASSWORD,
    role: 'customer',
  });
  const otherCustomer = createUser({
    name: 'Ravi',
    email: 'ravi@test.dev',
    password: PASSWORD,
    role: 'customer',
  });

  const tax = createTax({ name: 'GST 18%', rate_bp: 1800 });
  const product = createProduct({
    name: 'ERP',
    type: 'software',
    sales_price: 100000,
    cost_price: 0,
    notes: null,
    variants: [],
  });
  createTaxRule({ tax_id: tax.id, product_id: null, category: 'software', priority: 0 });

  const plan = createPlan({
    product_id: product.id,
    name: 'ERP Monthly',
    price: 100000,
    billing_period: billingPeriod,
    min_quantity: 1,
    available_from: null,
    available_to: null,
    end_behavior: endBehavior,
  });

  return { admin, staff, customer, otherCustomer, tax, product, plan };
}

export function activeSubscription({ customer, plan }, overrides = {}) {
  const subscription = createSubscription({
    customer_id: customer.id,
    plan_id: plan.id,
    start_date: '2026-01-01',
    expiry_date: null,
    payment_terms: 'immediate',
    lines: [],
    ...overrides,
  });
  for (const status of ['quotation', 'confirmed', 'active']) changeStatus(subscription.id, status);
  return subscription;
}

export function insertDiscount(fields) {
  const row = {
    name: 'Promo',
    type: 'percent',
    value: 10,
    min_amount: 0,
    min_quantity: 0,
    scope: 'subscription',
    product_id: null,
    starts_at: null,
    ends_at: null,
    usage_limit: null,
    active: 1,
    ...fields,
  };
  const columns = Object.keys(row);
  const result = db
    .prepare(
      `INSERT INTO discounts (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(row));
  return Number(result.lastInsertRowid);
}

export const countInvoices = (subscriptionId) =>
  db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE subscription_id = ?').get(subscriptionId).n;
