import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as catalog from '../api/catalog.js';
import { useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';
import FormMessage from '../components/FormMessage.jsx';
import { useDeleteMutation, useSaveMutation } from '../hooks/useSaveMutation.js';
import { formatPercent, toNumberOrNull } from '../lib/format.js';

const emptyTax = { name: '', rate: '' };
const emptyRule = { tax_id: '', product_id: '', category: '', priority: 0 };

function TaxesTable({ canEdit }) {
  const [form, setForm] = useState(emptyTax);
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: catalog.listTaxes });
  const save = useSaveMutation({
    create: catalog.createTax,
    update: catalog.updateTax,
    queryKey: ['taxes'],
    onSaved: () => setForm(emptyTax),
  });
  const remove = useDeleteMutation({ remove: catalog.deleteTax, queryKey: ['taxes'] });

  function handleSubmit(event) {
    event.preventDefault();
    // The rate is typed as a percentage and stored as basis points.
    const rate = toNumberOrNull(form.rate);
    save.mutate({ body: { name: form.name, rate_bp: rate === null ? null : Math.round(rate * 100) } });
  }

  return (
    <section className="card">
      <h2>Taxes</h2>
      {remove.error && <p className="form-error">{remove.error.message}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th className="number">Rate</th>
            {canEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {taxes.data?.data.map((tax) => (
            <tr key={tax.id}>
              <td>{tax.name}</td>
              <td className="number">{formatPercent(tax.rate_bp)}</td>
              {canEdit && (
                <td className="row-actions">
                  <button className="button-link danger" onClick={() => remove.mutate(tax.id)}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <FormMessage error={save.error} />
          <div className="inline-row">
            <input
              placeholder="Name, e.g. GST 12%"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Rate %"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
            <button type="submit" disabled={save.isPending}>
              Add tax
            </button>
          </div>
          <FieldError error={save.error} field="name" />
          <FieldError error={save.error} field="rate_bp" />
        </form>
      )}
    </section>
  );
}

function TaxRulesTable({ canEdit }) {
  const [form, setForm] = useState(emptyRule);
  const rules = useQuery({ queryKey: ['taxes', 'rules'], queryFn: catalog.listTaxRules });
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: catalog.listTaxes });
  const products = useQuery({
    queryKey: ['products', 'all'],
    queryFn: catalog.allProducts,
    enabled: canEdit,
  });
  const save = useSaveMutation({
    create: catalog.createTaxRule,
    queryKey: ['taxes', 'rules'],
    onSaved: () => setForm(emptyRule),
  });
  const remove = useDeleteMutation({ remove: catalog.deleteTaxRule, queryKey: ['taxes', 'rules'] });

  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    save.mutate({
      body: {
        tax_id: toNumberOrNull(form.tax_id),
        product_id: toNumberOrNull(form.product_id),
        category: form.category,
        priority: Number(form.priority) || 0,
      },
    });
  }

  return (
    <section className="card">
      <h2>Tax rules</h2>
      <p className="hint">
        A rule applies to one product or to every product of a type. The highest priority wins, and a
        product rule beats a type rule on a tie.
      </p>
      <table>
        <thead>
          <tr>
            <th>Applies to</th>
            <th>Tax</th>
            <th className="number">Priority</th>
            {canEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {rules.data?.data.map((rule) => (
            <tr key={rule.id}>
              <td>{rule.product_name ?? `All "${rule.category}" products`}</td>
              <td>
                {rule.tax_name} ({formatPercent(rule.rate_bp)})
              </td>
              <td className="number">{rule.priority}</td>
              {canEdit && (
                <td className="row-actions">
                  <button className="button-link danger" onClick={() => remove.mutate(rule.id)}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <FormMessage error={save.error} />
          <div className="inline-row">
            <select value={form.tax_id} onChange={setField('tax_id')}>
              <option value="">Tax</option>
              {taxes.data?.data.map((tax) => (
                <option key={tax.id} value={tax.id}>
                  {tax.name}
                </option>
              ))}
            </select>
            <select value={form.product_id} onChange={setField('product_id')}>
              <option value="">Any product</option>
              {products.data?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <input placeholder="or type, e.g. software" value={form.category} onChange={setField('category')} />
            <input type="number" placeholder="Priority" value={form.priority} onChange={setField('priority')} />
            <button type="submit" disabled={save.isPending}>
              Add rule
            </button>
          </div>
          <FieldError error={save.error} field="tax_id" />
          <FieldError error={save.error} field="category" />
        </form>
      )}
    </section>
  );
}

export default function TaxesPage() {
  const { user } = useSession();
  const canEdit = user.role === 'admin';
  return (
    <div className="page">
      <div className="page-header">
        <h1>Taxes</h1>
      </div>
      <TaxesTable canEdit={canEdit} />
      <TaxRulesTable canEdit={canEdit} />
    </div>
  );
}
