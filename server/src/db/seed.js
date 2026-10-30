import bcrypt from 'bcryptjs';
import { rmSync } from 'node:fs';
import { config } from '../config.js';
import { today } from '../lib/dates.js';
import { openDatabase } from './index.js';

const ACCOUNTS = [
  ['admin@example.com', 'Admin@12345', 'Admin User', 'admin'],
  ['staff@example.com', 'Staff@12345', 'Staff User', 'staff'],
  ['customer@example.com', 'Customer@123', 'Customer One', 'customer'],
];

for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbPath + suffix, { force: true });
const db = openDatabase(config.dbPath);

const insertUser = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)');
for (const [email, password, name, role] of ACCOUNTS) {
  insertUser.run(email, bcrypt.hashSync(password, 10), name, role);
}

db.exec(`
  INSERT INTO products (name, type, sales_price, cost_price) VALUES ('Website hosting', 'service', 49900, 20000);
  INSERT INTO taxes (name, rate_bp) VALUES ('GST 18%', 1800);
  INSERT INTO tax_rules (tax_id, product_type) VALUES (1, 'service');
  INSERT INTO plans (product_id, name, price, billing_period) VALUES (1, 'Hosting monthly', 49900, 'monthly');
`);

const start = `${today().slice(0, 7)}-01`;
db.prepare(
  `INSERT INTO subscriptions (number, customer_id, plan_id, start_date, status, next_billing_date)
   VALUES ('SUB-00001', 3, 1, ?, 'active', ?)`,
).run(start, start);
db.exec('INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price, amount) VALUES (1, 1, 1, 49900, 49900)');

console.log('Seeded. Log in with:');
for (const [email, password, , role] of ACCOUNTS) console.log(`  ${role.padEnd(8)} ${email} / ${password}`);
