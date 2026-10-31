import { Router } from 'express';
import { adminOnly, requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { readId } from '../lib/params.js';
import * as taxes from '../services/taxService.js';
import { taxRuleSchema, taxSchema } from '../validation/catalog.js';

const router = Router();

router.use(requireAuth, staffOnly);

router.get('/', (req, res) => {
  res.json({ data: taxes.listTaxes() });
});

router.post('/', adminOnly, validateBody(taxSchema), (req, res) => {
  res.status(201).json(taxes.createTax(req.body));
});

router.get('/rules', (req, res) => {
  res.json({ data: taxes.listTaxRules() });
});

router.post('/rules', adminOnly, validateBody(taxRuleSchema), (req, res) => {
  res.status(201).json(taxes.createTaxRule(req.body));
});

router.delete('/rules/:id', adminOnly, (req, res) => {
  taxes.deleteTaxRule(readId(req));
  res.status(204).end();
});

router.put('/:id', adminOnly, validateBody(taxSchema), (req, res) => {
  res.json(taxes.updateTax(readId(req), req.body));
});

router.delete('/:id', adminOnly, (req, res) => {
  taxes.deleteTax(readId(req));
  res.status(204).end();
});

export default router;
