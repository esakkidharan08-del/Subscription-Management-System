import { Router } from 'express';
import { AppError, parseId } from '../lib/errors.js';
import { parsePagination } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { productSchema, variantSchema } from '../validation/schemas.js';

export function productsRouter(db) {
  const router = Router();
  router.use(requireRole('admin', 'staff'));

  function getProduct(id) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) throw new AppError(404, 'Product not found');
    product.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(id);
    return product;
  }

  router.get('/', (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM products').get();
    const items = db.prepare('SELECT * FROM products ORDER BY name LIMIT ? OFFSET ?').all(pageSize, offset);
    res.json({ items, total, page, pageSize });
  });

  router.get('/:id', (req, res) => {
    res.json(getProduct(parseId(req.params.id)));
  });

  router.post('/', requireRole('admin'), validateBody(productSchema), (req, res) => {
    const { name, type, sales_price, cost_price, notes } = req.body;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO products (name, type, sales_price, cost_price, notes) VALUES (?, ?, ?, ?, ?)')
      .run(name, type, sales_price, cost_price, notes);
    res.status(201).json(getProduct(lastInsertRowid));
  });

  router.put('/:id', requireRole('admin'), validateBody(productSchema), (req, res) => {
    const id = parseId(req.params.id);
    getProduct(id);
    const { name, type, sales_price, cost_price, notes } = req.body;
    db.prepare('UPDATE products SET name = ?, type = ?, sales_price = ?, cost_price = ?, notes = ? WHERE id = ?').run(
      name,
      type,
      sales_price,
      cost_price,
      notes,
      id,
    );
    res.json(getProduct(id));
  });

  router.post('/:id/variants', requireRole('admin'), validateBody(variantSchema), (req, res) => {
    const id = parseId(req.params.id);
    getProduct(id);
    const { attribute, value, price_delta } = req.body;
    db.prepare('INSERT INTO product_variants (product_id, attribute, value, price_delta) VALUES (?, ?, ?, ?)').run(
      id,
      attribute,
      value,
      price_delta,
    );
    res.status(201).json(getProduct(id));
  });

  return router;
}
