import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as billing from '../api/billing.js';
import { useSession } from '../auth/useSession.js';
import BrandMark from '../components/BrandMark.jsx';
import DraftInvoiceEditor from '../components/DraftInvoiceEditor.jsx';
import FieldError from '../components/FieldError.jsx';
import FormMessage from '../components/FormMessage.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatMoney, methodLabel, toPaise, toRupees } from '../lib/format.js';

const STAFF_METHODS = ['upi', 'card', 'bank_transfer', 'cash'];
const CUSTOMER_METHODS = ['upi', 'card'];

// Customers pay the balance online; there is no real gateway, so this records the payment directly.
function CustomerPayButton({ invoice, onPaid }) {
  const [method, setMethod] = useState('upi');
  const pay = useMutation({
    mutationFn: () => billing.recordPayment(invoice.id, { method, amount: invoice.balance }),
    onSuccess: onPaid,
  });
  return (
    <div className="inline-form">
      <h2>Pay this invoice</h2>
      <FormMessage error={pay.error} />
      <div className="inline-row">
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {CUSTOMER_METHODS.map((m) => (
            <option key={m} value={m}>
              {methodLabel(m)}
            </option>
          ))}
        </select>
        <button onClick={() => pay.mutate()} disabled={pay.isPending}>
          {pay.isPending ? 'Paying…' : `Pay ${formatMoney(invoice.balance)}`}
        </button>
      </div>
    </div>
  );
}

function PaymentForm({ invoice, onPaid }) {
  const [form, setForm] = useState({
    method: 'upi',
    amount: toRupees(invoice.balance),
    paid_on: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const pay = useMutation({
    mutationFn: (body) => billing.recordPayment(invoice.id, body),
    onSuccess: onPaid,
  });
  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    pay.mutate({ ...form, amount: toPaise(form.amount) });
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <h2>Record a payment</h2>
      <FormMessage error={pay.error} />
      <div className="inline-row">
        <select value={form.method} onChange={setField('method')}>
          {STAFF_METHODS.map((method) => (
            <option key={method} value={method}>
              {methodLabel(method)}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          min="0"
          value={form.amount}
          onChange={setField('amount')}
        />
        <input type="date" value={form.paid_on} onChange={setField('paid_on')} />
        <input placeholder="Note (optional)" value={form.note} onChange={setField('note')} />
        <button type="submit" disabled={pay.isPending}>
          {pay.isPending ? 'Saving…' : 'Record payment'}
        </button>
      </div>
      <FieldError error={pay.error} field="amount" />
    </form>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useSession();
  const isStaff = user.role !== 'customer';
  const queryClient = useQueryClient();

  const invoice = useQuery({ queryKey: ['invoices', id], queryFn: () => billing.getInvoice(id) });

  const refresh = (updated) => {
    queryClient.setQueryData(['invoices', id], updated);
    queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false });
  };
  const [editing, setEditing] = useState(false);
  const confirm = useMutation({ mutationFn: () => billing.confirmInvoice(id), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => billing.cancelInvoice(id), onSuccess: refresh });
  const send = useMutation({ mutationFn: () => billing.sendInvoice(id), onSuccess: refresh });

  if (invoice.isLoading) return <p className="page-message">Loading…</p>;
  if (invoice.error) return <p className="form-error">{invoice.error.message}</p>;

  const inv = invoice.data;
  const canCancel =
    isStaff && ['draft', 'confirmed'].includes(inv.status) && inv.payments.length === 0;
  const actionError = confirm.error || cancel.error || send.error;
  const canSend = isStaff && ['confirmed', 'paid'].includes(inv.status);

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {inv.number} <StatusBadge kind="invoice" status={inv.status} overdue={inv.is_overdue} />
        </h1>
        <div className="form-actions no-print">
          <button className="button-secondary" onClick={() => window.print()}>
            Print
          </button>
          {canSend && (
            <button
              className="button-secondary"
              onClick={() => send.mutate()}
              disabled={send.isPending}
            >
              {send.isPending ? 'Sending…' : inv.sent_at ? 'Send again' : 'Send to customer'}
            </button>
          )}
          {isStaff && inv.status === 'draft' && !editing && (
            <button className="button-secondary" onClick={() => setEditing(true)}>
              Edit draft
            </button>
          )}
          {isStaff && inv.status === 'draft' && (
            <button onClick={() => confirm.mutate()} disabled={confirm.isPending || editing}>
              Confirm
            </button>
          )}
          {canCancel && (
            <button
              className="button-secondary"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              Cancel invoice
            </button>
          )}
        </div>
      </div>
      {actionError && <p className="form-error no-print">{actionError.message}</p>}
      {inv.sent_at && (
        <p className="hint no-print">
          Emailed to {inv.customer_email} on {inv.sent_at.slice(0, 16).replace('T', ' ')} UTC.
        </p>
      )}

      <div className="print-only print-letterhead">
        <BrandMark scope="Tax invoice" />
        <p>
          Bill to {inv.customer_name}, {inv.customer_email}
        </p>
      </div>

      <section className="card details-grid">
        <div>
          <span className="detail-label">Customer</span>
          {inv.customer_name}
          <small>{inv.customer_email}</small>
        </div>
        <div>
          <span className="detail-label">Subscription</span>
          <Link to={`/subscriptions/${inv.subscription_id}`}>{inv.subscription_number}</Link>
        </div>
        <div>
          <span className="detail-label">Period</span>
          {inv.period_start} to {inv.period_end}
        </div>
        <div>
          <span className="detail-label">Due</span>
          {inv.due_date}
        </div>
      </section>

      {editing && (
        <section className="card">
          <DraftInvoiceEditor
            invoice={inv}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              refresh(updated);
              setEditing(false);
            }}
          />
        </section>
      )}

      <section className="card">
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th className="number">Qty</th>
              <th className="number">Unit price</th>
              <th className="number">Net</th>
              <th className="number">Tax</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td className="number">{line.quantity}</td>
                <td className="number">{formatMoney(line.unit_price)}</td>
                <td className="number">{formatMoney(line.amount)}</td>
                <td className="number">{formatMoney(line.tax_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="totals">
          <dt>Subtotal</dt>
          <dd>{formatMoney(inv.subtotal)}</dd>
          {inv.discount_total > 0 && (
            <>
              <dt>Discount</dt>
              <dd>−{formatMoney(inv.discount_total)}</dd>
            </>
          )}
          <dt>Tax</dt>
          <dd>{formatMoney(inv.tax_total)}</dd>
          <dt className="grand">Total</dt>
          <dd className="grand">{formatMoney(inv.total)}</dd>
          <dt>Paid</dt>
          <dd>{formatMoney(inv.amount_paid)}</dd>
          <dt className="grand">Balance due</dt>
          <dd className="grand">{formatMoney(inv.balance)}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Payments</h2>
        {inv.payments.length ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Note</th>
                <th className="number">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.paid_on}</td>
                  <td>{methodLabel(payment.method)}</td>
                  <td>{payment.note ?? '—'}</td>
                  <td className="number">{formatMoney(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">No payments yet.</p>
        )}
        {isStaff && inv.status === 'confirmed' && (
          <PaymentForm key={inv.amount_paid} invoice={inv} onPaid={refresh} />
        )}
        {!isStaff && inv.status === 'confirmed' && (
          <CustomerPayButton invoice={inv} onPaid={refresh} />
        )}
      </section>
    </div>
  );
}
