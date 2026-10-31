import { useState } from 'react';
import { toPaise, toRupees } from '../lib/format.js';
import FieldError from './FieldError.jsx';
import FormMessage from './FormMessage.jsx';

function initialState(product) {
  if (!product) {
    return { name: '', type: 'service', sales_price: '', cost_price: '', notes: '', variants: [] };
  }
  return {
    name: product.name,
    type: product.type,
    sales_price: toRupees(product.sales_price),
    cost_price: toRupees(product.cost_price),
    notes: product.notes ?? '',
    variants: product.variants.map((v) => ({ ...v, price_delta: toRupees(v.price_delta) })),
  };
}

export default function ProductForm({ product, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(() => initialState(product));

  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function setVariant(index, field, value) {
    const variants = form.variants.map((v, i) => (i === index ? { ...v, [field]: value } : v));
    setForm({ ...form, variants });
  }

  function addVariant() {
    setForm({ ...form, variants: [...form.variants, { attribute: '', value: '', price_delta: '' }] });
  }

  function removeVariant(index) {
    setForm({ ...form, variants: form.variants.filter((_, i) => i !== index) });
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave({
      name: form.name,
      type: form.type,
      sales_price: toPaise(form.sales_price),
      cost_price: toPaise(form.cost_price) ?? 0,
      notes: form.notes,
      variants: form.variants.map((v) => ({
        attribute: v.attribute,
        value: v.value,
        price_delta: toPaise(v.price_delta) ?? 0,
      })),
    });
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>{product ? `Edit ${product.name}` : 'New product'}</h2>
      <FormMessage error={error} />
      <label>
        Name
        <input value={form.name} onChange={setField('name')} />
        <FieldError error={error} field="name" />
      </label>
      <label>
        Type
        <input value={form.type} onChange={setField('type')} list="product-types" />
        <datalist id="product-types">
          <option value="service" />
          <option value="software" />
          <option value="education" />
          <option value="goods" />
        </datalist>
        <FieldError error={error} field="type" />
      </label>
      <label>
        Sales price (₹)
        <input type="number" step="0.01" min="0" value={form.sales_price} onChange={setField('sales_price')} />
        <FieldError error={error} field="sales_price" />
      </label>
      <label>
        Cost price (₹)
        <input type="number" step="0.01" min="0" value={form.cost_price} onChange={setField('cost_price')} />
        <FieldError error={error} field="cost_price" />
      </label>
      <label className="span-2">
        Notes
        <input value={form.notes} onChange={setField('notes')} />
      </label>

      <fieldset className="span-2">
        <legend>Variants</legend>
        {form.variants.map((variant, index) => (
          <div className="inline-row" key={index}>
            <input
              placeholder="Attribute, e.g. brand"
              value={variant.attribute}
              onChange={(e) => setVariant(index, 'attribute', e.target.value)}
            />
            <input
              placeholder="Value, e.g. Odoo"
              value={variant.value}
              onChange={(e) => setVariant(index, 'value', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Extra ₹"
              value={variant.price_delta}
              onChange={(e) => setVariant(index, 'price_delta', e.target.value)}
            />
            <button type="button" className="button-link" onClick={() => removeVariant(index)}>
              Remove
            </button>
          </div>
        ))}
        <FieldError error={error} field="variants" />
        <button type="button" className="button-secondary" onClick={addVariant}>
          Add variant
        </button>
      </fieldset>

      <div className="form-actions span-2">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save product'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
