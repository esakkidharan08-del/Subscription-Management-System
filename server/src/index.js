import { createApp } from './app.js';
import { config } from './config.js';
import { runBilling } from './services/billingService.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

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
