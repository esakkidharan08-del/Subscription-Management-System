import { db, transaction } from './index.js';
import { hashPassword } from '../services/authService.js';

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

transaction(() => {
  seedAccounts();
  seedCatalog();
});

console.log('Seeded accounts:');
for (const { email, password, role } of accounts) {
  console.log(`  ${role.padEnd(8)} ${email.padEnd(24)} ${password}`);
}
