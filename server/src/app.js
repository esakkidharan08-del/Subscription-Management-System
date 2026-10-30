import express from 'express';
import cookieParser from 'cookie-parser';
import { AppError } from './lib/errors.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { productsRouter } from './routes/products.js';
import { plansRouter } from './routes/plans.js';
import { taxesRouter } from './routes/taxes.js';
import { quotationTemplatesRouter } from './routes/quotationTemplates.js';
import { discountsRouter } from './routes/discounts.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { invoicesRouter } from './routes/invoices.js';
import { billingRouter } from './routes/billing.js';
import { dashboardRouter } from './routes/dashboard.js';

export function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', authRouter(db));

  app.use('/api', authenticate);
  app.use('/api/users', usersRouter(db));
  app.use('/api/products', productsRouter(db));
  app.use('/api/plans', plansRouter(db));
  app.use('/api/taxes', taxesRouter(db));
  app.use('/api/quotation-templates', quotationTemplatesRouter(db));
  app.use('/api/discounts', discountsRouter(db));
  app.use('/api/subscriptions', subscriptionsRouter(db));
  app.use('/api/invoices', invoicesRouter(db));
  app.use('/api/billing', billingRouter(db));
  app.use('/api/dashboard', dashboardRouter(db));

  app.use('/api', (req, res, next) => next(new AppError(404, 'Not found')));
  app.use(errorHandler);
  return app;
}
