import { Router } from 'express';
import { adminOnly, requireAuth, staffOnly } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { readPagination } from '../lib/pagination.js';
import { readId } from '../lib/params.js';
import * as products from '../services/productService.js';
import { productSchema } from '../validation/catalog.js';

const router = Router();

router.use(requireAuth, staffOnly);

router.get('/', (req, res) => {
  res.json(products.listProducts({ search: req.query.search }, readPagination(req.query)));
});

router.get('/:id', (req, res) => {
  res.json(products.getProduct(readId(req)));
});

router.post('/', adminOnly, validateBody(productSchema), (req, res) => {
  res.status(201).json(products.createProduct(req.body));
});

router.put('/:id', adminOnly, validateBody(productSchema), (req, res) => {
  res.json(products.updateProduct(readId(req), req.body));
});

router.delete('/:id', adminOnly, (req, res) => {
  products.deleteProduct(readId(req));
  res.status(204).end();
});

export default router;
