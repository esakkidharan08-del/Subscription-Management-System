import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as billing from '../api/billing.js';
import * as catalog from '../api/catalog.js';
import { useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';
import FormMessage from '../components/FormMessage.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatMoney, formatPercent, labelFor, toPaise, toRupees } from '../lib/format.js';

const NEXT_STEP = {
  draft: { status: 'quotation', label: 'Send as quotation' },
  quotation: { status: 'confirmed', label: 'Confirm' },
  confirmed: { status: 'active', label: 'Activate' },
  active: { status: 'closed', label: 'Close subscription' },
};

const EDITABLE = new Set(['draft', 'quotation']);

const PERIOD_NOUN = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

function lineLabel(line) {
  return line.variant_value
    ? `${line.product_name} · ${line.variant_attribute}: ${line.variant_value}`
    : line.product_name;
}

// The editor works in base prices; the server adds the chosen variant's delta,
// so a line priced 1,200 with the Odoo brand (+560) bills at 1,760.
function LineEditor({ subscription, onSaved, onCancel }) {
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: catalog.allProducts });
  const deltaOf = (productId, variantId) =>
    products.data
      ?.find((p) => p.id === Number(productId))
      ?.variants.find((v) => v.id === Number(variantId))?.price_delta ?? 0;

  const [lines, setLines] = useState(() =>
    subscription.lines.map((line) => ({
      key: line.id,
      product_id: String(line.product_id),
      variant_id: line.variant_id ? String(line.variant_id) : '',
      quantity: String(line.quantity),
      // Filled in once products load, so the base excludes the variant delta.
      unit_price: '',
      original: line,
    })),
  );

  const save = useMutation({
    mutationFn: () =>
      billing.updateSubscription(subscription.id, {
        customer_id: subscription.customer_id,
        plan_id: subscription.plan_id,
        start_date: subscription.start_date,
        expiry_date: subscription.expiry_date,
        payment_terms: subscription.payment_terms,
        lines: lines.map((line) => ({
          product_id: Number(line.product_id),
          variant_id: line.variant_id ? Number(line.variant_id) : null,
          quantity: Number(line.quantity),
          ...priceFor(line),
        })),
      }),
    onSuccess: onSaved,
  });

  const update = (index, field) => (event) =>
    setLines(
      lines.map((line, i) =>
        i === index
          ? {
              ...line,
              [field]: event.target.value,
              ...(field === 'product_id' ? { variant_id: '', original: null, unit_price: '' } : {}),
            }
          : line,
      ),
    );

  // A typed price wins. An untouched existing line keeps its agreed base price
  // (its unit price less the variant delta already in it). A new line takes the list price.
  function priceFor(line) {
    if (line.unit_price !== '') return { unit_price: toPaise(line.unit_price) };
    const { original } = line;
    if (original && String(original.product_id) === line.product_id) {
      return {
        unit_price: original.unit_price - deltaOf(original.product_id, original.variant_id),
      };
    }
    return {};
  }

  const productFor = (line) => products.data?.find((p) => p.id === Number(line.product_id));

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2>Edit lines</h2>
      <FormMessage error={save.error} />
      {lines.map((line, index) => {
        const product = productFor(line);
        const delta = deltaOf(line.product_id, line.variant_id);
        return (
          <div className="inline-row" key={line.key}>
            <select
              value={line.product_id}
              onChange={update(index, 'product_id')}
              aria-label="Product"
            >
              <option value="">Choose a product</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={line.variant_id}
              onChange={update(index, 'variant_id')}
              disabled={!product?.variants.length}
              aria-label="Variant"
            >
              <option value="">{product?.variants.length ? 'No variant' : 'No variants'}</option>
              {product?.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.attribute}: {v.value} ({v.price_delta >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(v.price_delta))})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={line.quantity}
              onChange={update(index, 'quantity')}
              aria-label="Quantity"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={
                line.original
                  ? toRupees(
                      line.original.unit_price -
                        deltaOf(line.original.product_id, line.original.variant_id),
                    )
                  : 'List price'
              }
              value={line.unit_price}
              onChange={update(index, 'unit_price')}
              aria-label="Base unit price in rupees"
            />
            {delta !== 0 && (
              <span className="hint">
                variant {delta > 0 ? '+' : '−'}
                {formatMoney(Math.abs(delta))}
              </span>
            )}
            <button
              type="button"
              className="button-link danger"
              onClick={() => setLines(lines.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        );
      })}
      <FieldError error={save.error} field="lines" />
      <div className="form-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() =>
            setLines([
              ...lines,
              {
                key: `new-${lines.length}`,
                product_id: '',
                variant_id: '',
                quantity: '1',
                unit_price: '',
                original: null,
              },
            ])
          }
        >
          Add line
        </button>
        <span className="spacer" />
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={save.isPending || !products.data}>
          {save.isPending ? 'Saving…' : 'Save lines'}
        </button>
      </div>
    </form>
  );
}

// Add-ons are self-service: staff and the customer can switch them on and off
// while the subscription is active. Changes show on the next invoice.
function AddonsPanel({ subscription, onChanged }) {
  const addons = useQuery({ queryKey: ['addons'], queryFn: billing.listAddons });
  const [quantities, setQuantities] = useState({});
  const switchOn = useMutation({
    mutationFn: (productId) =>
      billing.addAddon(subscription.id, {
        product_id: productId,
        quantity: Number(quantities[productId] ?? 1),
      }),
    onSuccess: onChanged,
  });
  const switchOff = useMutation({
    mutationFn: (lineId) => billing.removeAddon(subscription.id, lineId),
    onSuccess: onChanged,
  });

  const onLines = new Map(
    subscription.lines.filter((l) => l.product_type === 'addon').map((l) => [l.product_id, l]),
  );
  const error = switchOn.error || switchOff.error;

  return (
    <section className="card" aria-labelledby="addons-title">
      <div className="card-head">
        <h2 id="addons-title">Add-ons</h2>
        <span className="hint">Changes apply from the next invoice</span>
      </div>
      {error && <p className="form-error">{error.message}</p>}
      {addons.data?.length ? (
        addons.data.map((addon) => {
          const line = onLines.get(addon.id);
          return (
            <div className="list-row" key={addon.id}>
              <span>
                {addon.name}
                <span className="cell-sub">
                  {formatMoney(addon.sales_price)} per unit each period
                  {addon.notes ? ` · ${addon.notes}` : ''}
                </span>
              </span>
              {line ? (
                <span className="form-actions">
                  <span className="badge badge-positive">On · {line.quantity}</span>
                  <button
                    className="button-secondary"
                    disabled={switchOff.isPending}
                    onClick={() => switchOff.mutate(line.id)}
                  >
                    Switch off
                  </button>
                </span>
              ) : (
                <span className="form-actions">
                  <input
                    type="number"
                    min="1"
                    className="qty-input"
                    value={quantities[addon.id] ?? 1}
                    onChange={(e) => setQuantities({ ...quantities, [addon.id]: e.target.value })}
                    aria-label={`${addon.name} quantity`}
                  />
                  <button disabled={switchOn.isPending} onClick={() => switchOn.mutate(addon.id)}>
                    Switch on
                  </button>
                </span>
              )}
            </div>
          );
        })
      ) : (
        <p className="empty-state">No add-ons are offered yet.</p>
      )}
    </section>
  );
}

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const { user } = useSession();
  const isStaff = user.role !== 'customer';
  const queryClient = useQueryClient();
  const [editingLines, setEditingLines] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const subscription = useQuery({
    queryKey: ['subscriptions', id],
    queryFn: () => billing.getSubscription(id),
  });
  const invoices = useQuery({
    queryKey: ['invoices', { subscription_id: id }],
    queryFn: () => billing.listInvoices({ subscription_id: id, pageSize: 50 }),
  });

  const refresh = (updated) => {
    queryClient.setQueryData(['subscriptions', id], updated);
    queryClient.invalidateQueries({ queryKey: ['subscriptions'], exact: false });
  };

  const advance = useMutation({
    mutationFn: (status) => billing.changeSubscriptionStatus(id, status),
    onSuccess: (updated) => {
      setConfirmingCancel(false);
      refresh(updated);
    },
  });
  const pauseToggle = useMutation({
    mutationFn: (paused) =>
      paused ? billing.resumeSubscription(id) : billing.pauseSubscription(id),
    onSuccess: refresh,
  });
  const renew = useMutation({
    mutationFn: () => billing.renewSubscription(id),
    onSuccess: refresh,
  });
  const extend = useMutation({ mutationFn: () => billing.extendQuotation(id), onSuccess: refresh });

  if (subscription.isLoading) return <p className="page-message">Loading…</p>;
  if (subscription.error) return <p className="form-error">{subscription.error.message}</p>;

  const s = subscription.data;
  const next = NEXT_STEP[s.status];
  const isActive = s.status === 'active';
  const canPause = isActive && s.end_behavior === 'pausable';
  const actionError = advance.error || pauseToggle.error || renew.error || extend.error;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            {s.number} <StatusBadge status={s.paused_at ? 'paused' : s.status} />
          </h1>
          <p className="page-subline">
            {s.plan_name} for {s.customer_name}, {formatMoney(s.recurring_amount)} per{' '}
            {PERIOD_NOUN[s.billing_period]} before tax
          </p>
        </div>
        <div className="form-actions">
          {canPause && (
            <button
              className="button-secondary"
              disabled={pauseToggle.isPending}
              onClick={() => pauseToggle.mutate(Boolean(s.paused_at))}
            >
              {s.paused_at ? 'Resume billing' : 'Pause'}
            </button>
          )}
          {isStaff && isActive && s.expiry_date && (
            <button
              className="button-secondary"
              disabled={renew.isPending}
              onClick={() => renew.mutate()}
            >
              Renew one {PERIOD_NOUN[s.billing_period]}
            </button>
          )}
          {isStaff && s.status === 'quotation' && (
            <button
              className="button-secondary"
              disabled={extend.isPending}
              onClick={() => extend.mutate()}
            >
              Extend quote
            </button>
          )}
          {isStaff && next && !s.paused_at && (
            <button
              className={next.status === 'closed' ? 'button-secondary' : undefined}
              disabled={advance.isPending || (next.status === 'confirmed' && s.quote_expired)}
              onClick={() => advance.mutate(next.status)}
            >
              {next.label}
            </button>
          )}
          {!isStaff && isActive && !confirmingCancel && (
            <button className="button-secondary" onClick={() => setConfirmingCancel(true)}>
              Cancel subscription
            </button>
          )}
        </div>
      </div>

      {confirmingCancel && (
        <div className="notice confirm-row">
          <span>
            Cancel {s.number}? It stops at once and no further invoices are raised. Invoices already
            issued still need paying.
          </span>
          <span className="form-actions">
            <button className="button-secondary" onClick={() => setConfirmingCancel(false)}>
              Keep it
            </button>
            <button
              className="button-danger"
              disabled={advance.isPending}
              onClick={() => advance.mutate('closed')}
            >
              Yes, cancel
            </button>
          </span>
        </div>
      )}
      {s.paused_at && (
        <p className="notice">Paused since {s.paused_at}. No invoices are raised while paused.</p>
      )}
      {s.status === 'quotation' && s.quote_valid_until && (
        <p className={s.quote_expired ? 'form-error' : 'notice'}>
          {s.quote_expired
            ? `This quotation expired on ${s.quote_valid_until}. Extend it to give the customer more time before confirming.`
            : `Quotation valid until ${s.quote_valid_until} (${s.quote_validity_days} days from sending).`}
        </p>
      )}
      {actionError && <p className="form-error">{actionError.message}</p>}

      <section className="card details-grid">
        <div>
          <span className="detail-label">Customer</span>
          {s.customer_name}
          <small>{s.customer_email}</small>
        </div>
        <div>
          <span className="detail-label">Plan</span>
          {s.plan_name} ({s.billing_period})<small>When it ends: {labelFor(s.end_behavior)}</small>
        </div>
        <div>
          <span className="detail-label">Dates</span>
          {s.start_date} to {s.expiry_date ?? 'open ended'}
        </div>
        <div>
          <span className="detail-label">Next bill</span>
          {s.next_billing_date ?? '—'}
          <small>Terms: {labelFor(s.payment_terms)}</small>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Lines</h2>
          {isStaff && EDITABLE.has(s.status) && !editingLines && (
            <button className="button-secondary" onClick={() => setEditingLines(true)}>
              Edit lines
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th className="number">Qty</th>
              <th className="number">Unit price</th>
              <th>Tax</th>
              <th className="number">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((line) => (
              <tr key={line.id}>
                <td>{lineLabel(line)}</td>
                <td className="number">{line.quantity}</td>
                <td className="number">{formatMoney(line.unit_price)}</td>
                <td>
                  {line.tax_name ? `${line.tax_name} (${formatPercent(line.rate_bp)})` : 'None'}
                </td>
                <td className="number">{formatMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Per period, before tax</td>
              <td className="number">{formatMoney(s.recurring_amount)}</td>
            </tr>
          </tfoot>
        </table>
        {editingLines && (
          <LineEditor
            subscription={s}
            onCancel={() => setEditingLines(false)}
            onSaved={(updated) => {
              refresh(updated);
              setEditingLines(false);
            }}
          />
        )}
      </section>

      {isActive && <AddonsPanel subscription={s} onChanged={refresh} />}

      <section className="card">
        <h2>Invoices</h2>
        {invoices.data?.data.length ? (
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Period</th>
                <th>Status</th>
                <th>Due</th>
                <th className="number">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.data.data.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`/invoices/${invoice.id}`}>{invoice.number}</Link>
                  </td>
                  <td>
                    {invoice.period_start} to {invoice.period_end}
                  </td>
                  <td>
                    <StatusBadge
                      kind="invoice"
                      status={invoice.status}
                      overdue={invoice.is_overdue}
                    />
                  </td>
                  <td>{invoice.due_date}</td>
                  <td className="number">{formatMoney(invoice.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">No invoices yet. They appear after the next billing run.</p>
        )}
      </section>
    </div>
  );
}
