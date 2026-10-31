import { Router } from 'express';
import { requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { today } from '../lib/dates.js';
import { badRequest } from '../lib/errors.js';
import { readPagination } from '../lib/pagination.js';
import { readId } from '../lib/params.js';
import * as invoices from '../services/invoiceService.js';
import { recordPayment } from '../services/paymentService.js';
import { invoiceEditSchema, paymentSchema } from '../validation/billing.js';

const router = Router();

router.use(requireAuth);

function readFilters(req) {
  const isCustomer = req.user.role === 'customer';
  return {
    status: req.query.status || null,
    overdue: req.query.overdue === 'true',
    search: req.query.search || null,
    subscriptionId: Number(req.query.subscription_id) || null,
    customerId: isCustomer ? req.user.id : Number(req.query.customer_id) || null,
  };
}

router.get('/', (req, res) => {
  res.json(invoices.listInvoices(readFilters(req), readPagination(req.query)));
});

// Defined before /:id so "export.csv" isn't read as an invoice id.
router.get('/export.csv', staffOnly, (req, res) => {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="invoices-${today()}.csv"`,
  });
  for (const line of invoices.exportInvoicesCsv(readFilters(req))) res.write(line);
  res.end();
});

router.get('/:id', (req, res) => {
  res.json(invoices.getInvoice(readId(req), req.user));
});

router.put('/:id', staffOnly, validateBody(invoiceEditSchema), (req, res) => {
  res.json(invoices.updateDraftInvoice(readId(req), req.body, req.user));
});

router.post('/:id/confirm', staffOnly, (req, res) => {
  res.json(invoices.confirmInvoice(readId(req), req.user));
});

router.post('/:id/cancel', staffOnly, (req, res) => {
  res.json(invoices.cancelInvoice(readId(req), req.user));
});

const CUSTOMER_METHODS = new Set(['card', 'upi']);

// Staff record any payment. Customers can pay their own invoices online, dated today.
router.post('/:id/payments', validateBody(paymentSchema), (req, res) => {
  const id = readId(req);
  let payment = req.body;

  if (req.user.role === 'customer') {
    invoices.getInvoice(id, req.user);
    if (!CUSTOMER_METHODS.has(payment.method)) throw badRequest('Pay online with card or UPI');
    payment = { ...payment, paid_on: today(), note: 'Paid online by customer' };
  }

  res.status(201).json(recordPayment(id, payment, req.user));
});

export default router;
