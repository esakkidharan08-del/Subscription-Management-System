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

transaction(() => {
  seedAccounts();
});

console.log('Seeded accounts:');
for (const { email, password, role } of accounts) {
  console.log(`  ${role.padEnd(8)} ${email.padEnd(24)} ${password}`);
}
