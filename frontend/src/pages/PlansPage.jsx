import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as catalog from '../api/catalog.js';
import { useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';
import FormMessage from '../components/FormMessage.jsx';
import Pagination from '../components/Pagination.jsx';
import { useDeleteMutation, useSaveMutation } from '../hooks/useSaveMutation.js';
import { formatMoney, labelFor, toNumberOrNull, toPaise, toRupees } from '../lib/format.js';

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];
const END_BEHAVIORS = ['renewable', 'auto_close', 'manual_close', 'pausable'];

function initialState(plan) {
  return {
    product_id: plan?.product_id ?? '',
    name: plan?.name ?? '',
    price: toRupees(plan?.price),
    billing_period: plan?.billing_period ?? 'monthly',
    min_quantity: plan?.min_quantity ?? 1,
    available_from: plan?.available_from ?? '',
    available_to: plan?.available_to ?? '',
    end_behavior: plan?.end_behavior ?? 'renewable',
  };
}

function PlanForm({ plan, products, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(() => initialState(plan));
  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    onSave({
      ...form,
      product_id: toNumberOrNull(form.product_id),
      price: toPaise(form.price),
      min_quantity: Number(form.min_quantity),
      available_from: form.available_from || null,
      available_to: form.available_to || null,
    });
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>{plan ? `Edit ${plan.name}` : 'New plan'}</h2>
      <FormMessage error={error} />
      <label>
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
      <label>
        Name
        <input value={form.name} onChange={setField('name')} />
        <FieldError error={error} field="name" />
      </label>
      <label>
        Price (₹)
        <input type="number" step="0.01" min="0" value={form.price} onChange={setField('price')} />
        <FieldError error={error} field="price" />
      </label>
      <label>
        Billing period
        <select value={form.billing_period} onChange={setField('billing_period')}>
          {PERIODS.map((period) => (
            <option key={period}>{period}</option>
          ))}
        </select>
      </label>
      <label>
        Minimum quantity
        <input
          type="number"
          min="1"
          value={form.min_quantity}
          onChange={setField('min_quantity')}
        />
        <FieldError error={error} field="min_quantity" />
      </label>
      <label>
        When it ends
        <select value={form.end_behavior} onChange={setField('end_behavior')}>
          {END_BEHAVIORS.map((behavior) => (
            <option key={behavior} value={behavior}>
              {labelFor(behavior)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Available from
        <input type="date" value={form.available_from} onChange={setField('available_from')} />
      </label>
      <label>
        Available to
        <input type="date" value={form.available_to} onChange={setField('available_to')} />
        <FieldError error={error} field="available_to" />
      </label>
      <div className="form-actions span-2">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save plan'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function availability(plan) {
  if (!plan.available_from && !plan.available_to) return 'Always';
  return `${plan.available_from ?? '…'} to ${plan.available_to ?? '…'}`;
}

export default function PlansPage() {
  const { user } = useSession();
  const canEdit = user.role === 'admin';
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const plans = useQuery({
    queryKey: ['plans', { page }],
    queryFn: () => catalog.listPlans({ page }),
    placeholderData: keepPreviousData,
  });
  const products = useQuery({
    queryKey: ['products', 'all'],
    queryFn: catalog.allProducts,
    enabled: canEdit,
  });

  const save = useSaveMutation({
    create: catalog.createPlan,
    update: catalog.updatePlan,
    queryKey: ['plans'],
    onSaved: () => setEditing(null),
  });
  const remove = useDeleteMutation({ remove: catalog.deletePlan, queryKey: ['plans'] });

  function openForm(plan) {
    save.reset();
    setEditing(plan ?? {});
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Plans</h1>
        {canEdit && !editing && <button onClick={() => openForm(null)}>New plan</button>}
      </div>

      {editing && (
        <PlanForm
          key={editing.id ?? 'new'}
          plan={editing.id ? editing : null}
          products={products.data ?? []}
          saving={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSave={(body) => save.mutate({ id: editing.id, body })}
        />
      )}

      <div className="card">
        {remove.error && <p className="form-error">{remove.error.message}</p>}
        {plans.isLoading ? (
          <p className="page-message">Loading…</p>
        ) : plans.data?.data.length === 0 ? (
          <p className="page-message">No plans yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Product</th>
                <th className="number">Price</th>
                <th>Period</th>
                <th>Available</th>
                <th>When it ends</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {plans.data?.data.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.name}</td>
                  <td>{plan.product_name}</td>
                  <td className="number">{formatMoney(plan.price)}</td>
                  <td>{plan.billing_period}</td>
                  <td>{availability(plan)}</td>
                  <td>{labelFor(plan.end_behavior)}</td>
                  {canEdit && (
                    <td className="row-actions">
                      <button className="button-link" onClick={() => openForm(plan)}>
                        Edit
                      </button>
                      <button className="button-link danger" onClick={() => remove.mutate(plan.id)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={plans.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
