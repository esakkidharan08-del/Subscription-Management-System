import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as billing from '../api/billing.js';
import * as catalog from '../api/catalog.js';
import { useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';
import FormMessage from '../components/FormMessage.jsx';
import Pagination from '../components/Pagination.jsx';
import { useDeleteMutation, useSaveMutation } from '../hooks/useSaveMutation.js';
import { formatMoney, toNumberOrNull, toPaise, toRupees } from '../lib/format.js';

function initialState(discount) {
  const isFixed = discount?.type === 'fixed';
  return {
    name: discount?.name ?? '',
    type: discount?.type ?? 'percent',
    // Fixed values are paise in the API, shown here in rupees.
    value: discount ? (isFixed ? toRupees(discount.value) : String(discount.value)) : '',
    scope: discount?.scope ?? 'subscription',
    product_id: discount?.product_id ?? '',
    min_amount: toRupees(discount?.min_amount ?? 0),
    min_quantity: discount?.min_quantity ?? 0,
    starts_at: discount?.starts_at ?? '',
    ends_at: discount?.ends_at ?? '',
    usage_limit: discount?.usage_limit ?? '',
    active: discount ? Boolean(discount.active) : true,
  };
}

function DiscountForm({ discount, products, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(() => initialState(discount));
  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    const value = form.type === 'fixed' ? toPaise(form.value) : toNumberOrNull(form.value);
    onSave({
      name: form.name,
      type: form.type,
      value,
      scope: form.scope,
      product_id: form.scope === 'product' ? toNumberOrNull(form.product_id) : null,
      min_amount: toPaise(form.min_amount) ?? 0,
      min_quantity: Number(form.min_quantity) || 0,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      usage_limit: toNumberOrNull(form.usage_limit),
      active: form.active,
    });
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>{discount ? `Edit ${discount.name}` : 'New discount'}</h2>
      <FormMessage error={error} />
      <label>
        Name
        <input value={form.name} onChange={setField('name')} />
        <FieldError error={error} field="name" />
      </label>
      <label>
        Applies to
        <select value={form.scope} onChange={setField('scope')}>
          <option value="subscription">Whole invoice</option>
          <option value="product">One product</option>
        </select>
      </label>
      {form.scope === 'product' && (
        <label className="span-2">
          Product
          <select value={form.product_id} onChange={setField('product_id')}>
            <option value="">Choose a product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <FieldError error={error} field="product_id" />
        </label>
      )}
      <label>
        Type
        <select value={form.type} onChange={setField('type')}>
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed amount off</option>
        </select>
      </label>
      <label>
        {form.type === 'percent' ? 'Percent' : 'Amount (₹)'}
        <input type="number" step={form.type === 'percent' ? '1' : '0.01'} min="0" value={form.value} onChange={setField('value')} />
        <FieldError error={error} field="value" />
      </label>
      <label>
        Minimum invoice amount (₹)
        <input type="number" step="0.01" min="0" value={form.min_amount} onChange={setField('min_amount')} />
        <FieldError error={error} field="min_amount" />
      </label>
      <label>
        Minimum quantity
        <input type="number" min="0" value={form.min_quantity} onChange={setField('min_quantity')} />
      </label>
      <label>
        Starts
        <input type="date" value={form.starts_at} onChange={setField('starts_at')} />
      </label>
      <label>
        Ends
        <input type="date" value={form.ends_at} onChange={setField('ends_at')} />
        <FieldError error={error} field="ends_at" />
      </label>
      <label>
        Usage limit (blank for unlimited)
        <input type="number" min="1" value={form.usage_limit} onChange={setField('usage_limit')} />
        <FieldError error={error} field="usage_limit" />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        Active
      </label>
      <div className="form-actions span-2">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save discount'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function describeValue(discount) {
  return discount.type === 'percent' ? `${discount.value}%` : formatMoney(discount.value);
}

function describeLimits(discount) {
  const parts = [];
  if (discount.min_amount) parts.push(`over ${formatMoney(discount.min_amount)}`);
  if (discount.min_quantity) parts.push(`qty ${discount.min_quantity}+`);
  if (discount.starts_at || discount.ends_at) {
    parts.push(`${discount.starts_at ?? '…'} to ${discount.ends_at ?? '…'}`);
  }
  return parts.join(', ') || 'None';
}

export default function DiscountsPage() {
  const { user } = useSession();
  const canEdit = user.role === 'admin';
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const discounts = useQuery({
    queryKey: ['discounts', { page }],
    queryFn: () => billing.listDiscounts({ page }),
    placeholderData: keepPreviousData,
  });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: catalog.allProducts, enabled: canEdit });

  const save = useSaveMutation({
    create: billing.createDiscount,
    update: billing.updateDiscount,
    queryKey: ['discounts'],
    onSaved: () => setEditing(null),
  });
  const remove = useDeleteMutation({ remove: billing.deleteDiscount, queryKey: ['discounts'] });

  function openForm(discount) {
    save.reset();
    setEditing(discount ?? {});
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Discounts</h1>
        {canEdit && !editing && <button onClick={() => openForm(null)}>New discount</button>}
      </div>
      {!canEdit && <p className="hint">Only admins can create or change discount rules.</p>}

      {editing && (
        <DiscountForm
          key={editing.id ?? 'new'}
          discount={editing.id ? editing : null}
          products={products.data ?? []}
          saving={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSave={(body) => save.mutate({ id: editing.id, body })}
        />
      )}

      <div className="card">
        {discounts.isLoading ? (
          <p className="page-message">Loading…</p>
        ) : discounts.data?.data.length === 0 ? (
          <p className="page-message">No discounts yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Applies to</th>
                <th className="number">Value</th>
                <th>Conditions</th>
                <th className="number">Used</th>
                <th>Status</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {discounts.data?.data.map((discount) => (
                <tr key={discount.id}>
                  <td>{discount.name}</td>
                  <td>{discount.scope === 'product' ? discount.product_name : 'Whole invoice'}</td>
                  <td className="number">{describeValue(discount)}</td>
                  <td>{describeLimits(discount)}</td>
                  <td className="number">
                    {discount.times_used}
                    {discount.usage_limit ? ` / ${discount.usage_limit}` : ''}
                  </td>
                  <td>
                    <span className={`badge ${discount.active ? 'badge-active' : 'badge-closed'}`}>
                      {discount.active ? 'active' : 'off'}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="row-actions">
                      <button className="button-link" onClick={() => openForm(discount)}>
                        Edit
                      </button>
                      <button className="button-link danger" onClick={() => remove.mutate(discount.id)}>
                        {discount.times_used > 0 ? 'Turn off' : 'Delete'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={discounts.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
