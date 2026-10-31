import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import planRoutes from './routes/plans.js';
import taxRoutes from './routes/taxes.js';
import quotationTemplateRoutes from './routes/quotationTemplates.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // The API has no pages of its own; send anyone who opens it to the client.
  app.get('/', (req, res) => res.redirect(config.clientUrl));
  app.get('/api/health',(req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/taxes', taxRoutes);
  app.use('/api/quotation-templates', quotationTemplateRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
