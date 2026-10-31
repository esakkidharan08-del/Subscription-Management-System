// Times the heaviest pages against whatever is in the database. Run after
// `npm run seed:large` and quote the numbers in the demo.
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';

const RUNS = 5;
const TARGET_MS = 2000;

const endpoints = [
  '/api/dashboard',
  '/api/subscriptions?page=1',
  '/api/subscriptions?page=200&status=active',
  '/api/subscriptions?search=Sharma',
  '/api/invoices?page=1',
  '/api/invoices?overdue=true',
  '/api/invoices?page=2000',
  '/api/invoices/export.csv',
];

const counts = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
            (SELECT COUNT(*) FROM invoices) AS invoices,
            (SELECT COUNT(*) FROM payments) AS payments`,
  )
  .get();
console.log(
  `Data: ${counts.subscriptions} subscriptions, ${counts.invoices} invoices, ${counts.payments} payments\n`,
);

const agent = request.agent(createApp());
const login = await agent
  .post('/api/auth/login')
  .send({ email: 'admin@example.com', password: 'Admin@12345' });
if (login.status !== 200) {
  console.error('Could not log in as admin@example.com. Run `npm run seed` first.');
  process.exit(1);
}

let slowest = 0;
for (const url of endpoints) {
  const timings = [];
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now();
    const response = await agent.get(url);
    timings.push(performance.now() - started);
    if (response.status !== 200) throw new Error(`${url} returned ${response.status}`);
  }
  timings.sort((a, b) => a - b);
  const median = timings[Math.floor(RUNS / 2)];
  slowest = Math.max(slowest, median);
  const verdict = median < TARGET_MS ? 'ok' : 'SLOW';
  console.log(`${verdict.padEnd(4)} ${median.toFixed(0).padStart(6)} ms  ${url}`);
}

console.log(`\nSlowest median: ${slowest.toFixed(0)} ms (target under ${TARGET_MS} ms)`);
