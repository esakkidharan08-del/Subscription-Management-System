import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db/index.js';
import { runBilling } from './services/billingService.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Stop the other server or set PORT.`);
    process.exit(1);
  }
  throw err;
});

// Finish in-flight requests and close SQLite cleanly so the WAL file is checkpointed.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function scheduledBilling() {
  try {
    const summary = runBilling();
    if (summary.invoicesCreated || summary.subscriptionsClosed || summary.failures.length) {
      console.log('Billing run:', summary);
    }
  } catch (err) {
    console.error('Billing run failed', err);
  }
}

if (config.billingIntervalMinutes > 0) {
  scheduledBilling();
  setInterval(scheduledBilling, config.billingIntervalMinutes * 60 * 1000).unref();
}
