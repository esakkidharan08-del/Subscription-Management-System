import { db, placeholders, transaction } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { pagedResult } from '../lib/pagination.js';

// One query for all variants on the page instead of one per product.
function withVariants(products) {
  if (!products.length) return products;
  const ids = products.map((product) => product.id);
  const variants = db
    .prepare(
      `SELECT * FROM product_variants WHERE product_id IN (${placeholders(ids)})
       ORDER BY attribute, value`,
    )
    .all(...ids);
  const byProduct = Map.groupBy(variants, (variant) => variant.product_id);
  return products.map((product) => ({ ...product, variants: byProduct.get(product.id) ?? [] }));
}

export function listProducts({ search }, paging) {
  const where = search ? 'WHERE name LIKE ? OR type LIKE ?' : '';
  const params = search ? [`%${search}%`, `%${search}%`] : [];

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM products ${where}`).get(...params);
  const rows = db
    .prepare(`SELECT * FROM products ${where} ORDER BY name LIMIT ? OFFSET ?`)
    .all(...params, paging.limit, paging.offset);

  return pagedResult(withVariants(rows), total, paging);
}

export function getProduct(id) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) throw notFound('Product');
  return withVariants([product])[0];
}

function replaceVariants(productId, variants) {
  db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(productId);
  const insert = db.prepare(
    'INSERT INTO product_variants (product_id, attribute, value, price_delta) VALUES (?, ?, ?, ?)',
  );
  for (const variant of variants) {
    insert.run(productId, variant.attribute, variant.value, variant.price_delta);
  }
}

export function createProduct({ variants, ...product }) {
  return transaction(() => {
    const result = db
      .prepare(
        'INSERT INTO products (name, type, sales_price, cost_price, notes) VALUES (?, ?, ?, ?, ?)',
      )
      .run(product.name, product.type, product.sales_price, product.cost_price, product.notes);
    const id = Number(result.lastInsertRowid);
    replaceVariants(id, variants);
    return getProduct(id);
  });
}

export function updateProduct(id, { variants, ...product }) {
  return transaction(() => {
    getProduct(id);
    db.prepare(
      'UPDATE products SET name = ?, type = ?, sales_price = ?, cost_price = ?, notes = ? WHERE id = ?',
    ).run(product.name, product.type, product.sales_price, product.cost_price, product.notes, id);
    replaceVariants(id, variants);
    return getProduct(id);
  });
}

export function deleteProduct(id) {
  getProduct(id);
  const { plans } = db.prepare('SELECT COUNT(*) AS plans FROM plans WHERE product_id = ?').get(id);
  if (plans > 0) throw conflict('Remove the plans for this product before deleting it');
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}
