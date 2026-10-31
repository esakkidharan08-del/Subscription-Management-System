import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { checkOrigin, requestLogger, securityHeaders } from './middleware/security.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import planRoutes from './routes/plans.js';
import taxRoutes from './routes/taxes.js';
import quotationTemplateRoutes from './routes/quotationTemplates.js';
import subscriptionRoutes from './routes/subscriptions.js';
import invoiceRoutes from './routes/invoices.js';
import paymentRoutes from './routes/payments.js';
import billingRoutes from './routes/billing.js';
import discountRoutes from './routes/discounts.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  if (!config.isTest) app.use(requestLogger);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(checkOrigin);

  app.get('/', (req, res) => res.redirect(config.clientUrl));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/taxes', taxRoutes);
  app.use('/api/quotation-templates', quotationTemplateRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/discounts', discountRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/audit', auditRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
