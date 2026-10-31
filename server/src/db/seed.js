import { db, transaction } from './index.js';
import { seedLargeDataset } from './seedLarge.js';
import { addMonths, today } from '../lib/dates.js';
import { hashPassword } from '../services/authService.js';
import { changeStatus, createSubscription } from '../services/subscriptionService.js';

const accounts = [
  { name: 'Admin User', email: 'admin@example.com', password: 'Admin@12345', role: 'admin' },
  { name: 'Staff User', email: 'staff@example.com', password: 'Staff@12345', role: 'staff' },
  { name: 'Customer One', email: 'customer@example.com', password: 'Customer@123', role: 'customer' },
  { name: 'Customer Two', email: 'customer2@example.com', password: 'Customer@123', role: 'customer' },
];

function seedAccounts() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
  );
  for (const account of accounts) {
    insert.run(account.name, account.email, hashPassword(account.password), account.role);
  }
}

function insertRow(table, row) {
  const columns = Object.keys(row);
  const result = db
    .prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...Object.values(row));
  return Number(result.lastInsertRowid);
}

// Only runs on an empty catalog so re-seeding never duplicates products.
function seedCatalog() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get();
  if (count > 0) return;

  const gst18 = insertRow('taxes', { name: 'GST 18%', rate_bp: 1800 });
  const gst5 = insertRow('taxes', { name: 'GST 5%', rate_bp: 500 });

  const erp = insertRow('products', {
    name: 'ERP Suite',
    type: 'software',
    sales_price: 120000,
    cost_price: 40000,
    notes: 'Per user licence',
  });
  insertRow('product_variants', { product_id: erp, attribute: 'brand', value: 'Odoo', price_delta: 56000 });
  insertRow('product_variants', { product_id: erp, attribute: 'edition', value: 'Enterprise', price_delta: 30000 });

  const hosting = insertRow('products', {
    name: 'Cloud Hosting',
    type: 'service',
    sales_price: 80000,
    cost_price: 30000,
  });
  const training = insertRow('products', {
    name: 'Training Course',
    type: 'education',
    sales_price: 250000,
    cost_price: 50000,
  });

  insertRow('tax_rules', { tax_id: gst18, category: 'software', priority: 0 });
  insertRow('tax_rules', { tax_id: gst18, category: 'service', priority: 0 });
  insertRow('tax_rules', { tax_id: gst5, category: 'education', priority: 0 });

  const erpMonthly = insertRow('plans', {
    product_id: erp,
    name: 'ERP Monthly',
    price: 120000,
    billing_period: 'monthly',
    end_behavior: 'renewable',
  });
  insertRow('plans', {
    product_id: erp,
    name: 'ERP Yearly',
    price: 1200000,
    billing_period: 'yearly',
    end_behavior: 'renewable',
  });
  insertRow('plans', {
    product_id: hosting,
    name: 'Hosting Monthly',
    price: 80000,
    billing_period: 'monthly',
    end_behavior: 'auto_close',
  });
  insertRow('plans', {
    product_id: training,
    name: 'Training Weekly',
    price: 250000,
    billing_period: 'weekly',
    end_behavior: 'manual_close',
  });

  insertRow('quotation_templates', {
    name: 'ERP starter pack',
    plan_id: erpMonthly,
    validity_days: 15,
    lines: JSON.stringify([
      { product_id: erp, quantity: 5 },
      { product_id: hosting, quantity: 1 },
    ]),
  });
}

// Starts a few months back so the first billing run has periods to catch up on.
function seedSubscriptions() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM subscriptions').get();
  if (count > 0) return;

  const customerId = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  const planId = (name) => db.prepare('SELECT id FROM plans WHERE name = ?').get(name).id;
  const threeMonthsAgo = addMonths(today(), -3);

  const activate = (subscription) => {
    for (const status of ['quotation', 'confirmed', 'active']) changeStatus(subscription.id, status);
  };

  activate(
    createSubscription({
      customer_id: customerId('customer@example.com'),
      plan_id: planId('ERP Monthly'),
      start_date: threeMonthsAgo,
      payment_terms: 'net_15',
      lines: [],
    }),
  );
  activate(
    createSubscription({
      customer_id: customerId('customer@example.com'),
      plan_id: planId('Hosting Monthly'),
      start_date: threeMonthsAgo,
      expiry_date: addMonths(today(), 3),
      payment_terms: 'immediate',
      lines: [],
    }),
  );
  activate(
    createSubscription({
      customer_id: customerId('customer2@example.com'),
      plan_id: planId('ERP Monthly'),
      start_date: addMonths(today(), -1),
      payment_terms: 'net_30',
      lines: [],
    }),
  );
  createSubscription({
    customer_id: customerId('customer2@example.com'),
    plan_id: planId('ERP Yearly'),
    start_date: today(),
    payment_terms: 'net_30',
    lines: [],
  });

  insertRow('discounts', {
    name: 'Welcome 10%',
    type: 'percent',
    value: 10,
    scope: 'subscription',
    usage_limit: 3,
  });
}

transaction(() => {
  seedAccounts();
  seedCatalog();
  seedSubscriptions();
  if (process.argv.includes('--large')) seedLargeDataset();
});

console.log('Seeded accounts:');
for (const { email, password, role } of accounts) {
  console.log(`  ${role.padEnd(8)} ${email.padEnd(24)} ${password}`);
}
