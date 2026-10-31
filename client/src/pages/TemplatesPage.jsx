import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as catalog from '../api/catalog.js';
import { useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';
import FormMessage from '../components/FormMessage.jsx';
import Pagination from '../components/Pagination.jsx';
import { useDeleteMutation, useSaveMutation } from '../hooks/useSaveMutation.js';
import { toNumberOrNull } from '../lib/format.js';

function initialState(template) {
  return {
    name: template?.name ?? '',
    plan_id: template?.plan_id ?? '',
    validity_days: template?.validity_days ?? 30,
    lines: template?.lines ?? [],
  };
}

function TemplateForm({ template, plans, products, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(() => initialState(template));
  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function setLine(index, field, value) {
    setForm({ ...form, lines: form.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)) });
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave({
      name: form.name,
      plan_id: toNumberOrNull(form.plan_id),
      validity_days: Number(form.validity_days),
      lines: form.lines.map((line) => ({
        product_id: toNumberOrNull(line.product_id),
        quantity: Number(line.quantity),
      })),
    });
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>{template ? `Edit ${template.name}` : 'New quotation template'}</h2>
      <FormMessage error={error} />
      <label>
        Name
        <input value={form.name} onChange={setField('name')} />
        <FieldError error={error} field="name" />
      </label>
      <label>
        Plan
        <select value={form.plan_id} onChange={setField('plan_id')}>
          <option value="">Choose a plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
        <FieldError error={error} field="plan_id" />
      </label>
      <label>
        Valid for (days)
        <input type="number" min="1" value={form.validity_days} onChange={setField('validity_days')} />
        <FieldError error={error} field="validity_days" />
      </label>

      <fieldset className="span-2">
        <legend>Lines</legend>
        {form.lines.map((line, index) => (
          <div className="inline-row" key={index}>
            <select value={line.product_id} onChange={(e) => setLine(index, 'product_id', e.target.value)}>
              <option value="">Product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={line.quantity}
              onChange={(e) => setLine(index, 'quantity', e.target.value)}
            />
            <button
              type="button"
              className="button-link"
              onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button-secondary"
          onClick={() => setForm({ ...form, lines: [...form.lines, { product_id: '', quantity: 1 }] })}
        >
          Add line
        </button>
      </fieldset>

      <div className="form-actions span-2">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save template'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function TemplatesPage() {
  const { user } = useSession();
  const canEdit = user.role === 'admin';
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const templates = useQuery({
    queryKey: ['templates', { page }],
    queryFn: () => catalog.listTemplates({ page }),
    placeholderData: keepPreviousData,
  });
  const plans = useQuery({ queryKey: ['plans', 'all'], queryFn: catalog.allPlans, enabled: canEdit });
  const products = useQuery({
    queryKey: ['products', 'all'],
    queryFn: catalog.allProducts,
  });

  const save = useSaveMutation({
    create: catalog.createTemplate,
    update: catalog.updateTemplate,
    queryKey: ['templates'],
    onSaved: () => setEditing(null),
  });
  const remove = useDeleteMutation({ remove: catalog.deleteTemplate, queryKey: ['templates'] });

  const productName = (id) => products.data?.find((p) => p.id === id)?.name ?? `#${id}`;

  function openForm(template) {
    save.reset();
    setEditing(template ?? {});
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Quotation templates</h1>
        {canEdit && !editing && <button onClick={() => openForm(null)}>New template</button>}
      </div>

      {editing && (
        <TemplateForm
          key={editing.id ?? 'new'}
          template={editing.id ? editing : null}
          plans={plans.data ?? []}
          products={products.data ?? []}
          saving={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSave={(body) => save.mutate({ id: editing.id, body })}
        />
      )}

      <div className="card">
        {templates.isLoading ? (
          <p className="page-message">Loading…</p>
        ) : templates.data?.data.length === 0 ? (
          <p className="page-message">No templates yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Plan</th>
                <th className="number">Valid for</th>
                <th>Lines</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {templates.data?.data.map((template) => (
                <tr key={template.id}>
                  <td>{template.name}</td>
                  <td>{template.plan_name}</td>
                  <td className="number">{template.validity_days} days</td>
                  <td>
                    {template.lines.map((l) => `${l.quantity} × ${productName(l.product_id)}`).join(', ') ||
                      '—'}
                  </td>
                  {canEdit && (
                    <td className="row-actions">
                      <button className="button-link" onClick={() => openForm(template)}>
                        Edit
                      </button>
                      <button className="button-link danger" onClick={() => remove.mutate(template.id)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={templates.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
