import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as catalog from '../api/catalog.js';
import { useSession } from '../auth/useSession.js';
import Pagination from '../components/Pagination.jsx';
import ProductForm from '../components/ProductForm.jsx';
import { useDeleteMutation, useSaveMutation } from '../hooks/useSaveMutation.js';
import { formatMoney } from '../lib/format.js';

export default function ProductsPage() {
  const { user } = useSession();
  const canEdit = user.role === 'admin';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const products = useQuery({
    queryKey: ['products', { page, search }],
    queryFn: () => catalog.listProducts({ page, search }),
    placeholderData: keepPreviousData,
  });

  const save = useSaveMutation({
    create: catalog.createProduct,
    update: catalog.updateProduct,
    queryKey: ['products'],
    onSaved: () => setEditing(null),
  });
  const remove = useDeleteMutation({ remove: catalog.deleteProduct, queryKey: ['products'] });

  function openForm(product) {
    save.reset();
    setEditing(product ?? {});
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Products</h1>
        {canEdit && !editing && <button onClick={() => openForm(null)}>New product</button>}
      </div>

      {editing && (
        <ProductForm
          key={editing.id ?? 'new'}
          product={editing.id ? editing : null}
          saving={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSave={(body) => save.mutate({ id: editing.id, body })}
        />
      )}

      <div className="card">
        <input
          className="search"
          placeholder="Search by name or type"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {remove.error && <p className="form-error">{remove.error.message}</p>}
        {products.isLoading ? (
          <p className="page-message">Loading…</p>
        ) : products.data?.data.length === 0 ? (
          <p className="page-message">No products yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th className="number">Sales price</th>
                <th className="number">Cost price</th>
                <th>Variants</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {products.data?.data.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.type}</td>
                  <td className="number">{formatMoney(product.sales_price)}</td>
                  <td className="number">{formatMoney(product.cost_price)}</td>
                  <td>
                    {product.variants.map((v) => `${v.attribute}: ${v.value}`).join(', ') || '—'}
                  </td>
                  {canEdit && (
                    <td className="row-actions">
                      <button className="button-link" onClick={() => openForm(product)}>
                        Edit
                      </button>
                      <button
                        className="button-link danger"
                        onClick={() => remove.mutate(product.id)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={products.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
