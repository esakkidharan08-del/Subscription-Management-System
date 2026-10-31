import { Router } from 'express';
import { adminOnly, requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { readPagination } from '../lib/pagination.js';
import { readId } from '../lib/params.js';
import * as templates from '../services/quotationTemplateService.js';
import { quotationTemplateSchema } from '../validation/catalog.js';

const router = Router();

router.use(requireAuth, staffOnly);

router.get('/', (req, res) => {
  res.json(templates.listTemplates(readPagination(req.query)));
});

router.get('/:id', (req, res) => {
  res.json(templates.getTemplate(readId(req)));
});

router.post('/', adminOnly, validateBody(quotationTemplateSchema), (req, res) => {
  res.status(201).json(templates.createTemplate(req.body));
});

router.put('/:id', adminOnly, validateBody(quotationTemplateSchema), (req, res) => {
  res.json(templates.updateTemplate(readId(req), req.body));
});

router.delete('/:id', adminOnly, (req, res) => {
  templates.deleteTemplate(readId(req));
  res.status(204).end();
});

export default router;
