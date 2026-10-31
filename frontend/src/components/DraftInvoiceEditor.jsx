import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import * as billing from '../api/billing.js';
import { toPaise, toRupees } from '../lib/format.js';
import FieldError from './FieldError.jsx';
import FormMessage from './FormMessage.jsx';

// Drafts only. The server re-totals tax from each line's stored rate, so the
// totals shown after saving are the ones that will be confirmed.
export default function DraftInvoiceEditor({ invoice, onSaved, onCancel }) {
  const [dueDate, setDueDate] = useState(invoice.due_date);
  const [lines, setLines] = useState(() =>
    invoice.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: String(line.quantity),
      unit_price: toRupees(line.unit_price),
    })),
  );

  const save = useMutation({
    mutationFn: () =>
      billing.updateDraftInvoice(invoice.id, {
        due_date: dueDate,
        lines: lines.map((line) => ({
          id: line.id,
          description: line.description,
          quantity: Number(line.quantity),
          unit_price: toPaise(line.unit_price),
        })),
      }),
    onSuccess: onSaved,
  });

  const setLine = (index, field) => (event) =>
    setLines(
      lines.map((line, i) => (i === index ? { ...line, [field]: event.target.value } : line)),
    );

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2>Edit draft</h2>
      <FormMessage error={save.error} />
      <label className="inline-label">
        Due date
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      {lines.map((line, index) => (
        <div className="inline-row" key={line.id}>
          <input
            value={line.description}
            onChange={setLine(index, 'description')}
            aria-label="Description"
          />
          <input
            type="number"
            min="1"
            value={line.quantity}
            onChange={setLine(index, 'quantity')}
            aria-label="Quantity"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            value={line.unit_price}
            onChange={setLine(index, 'unit_price')}
            aria-label="Unit price in rupees"
          />
        </div>
      ))}
      <FieldError error={save.error} field="lines" />
      <div className="form-actions">
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save draft'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
