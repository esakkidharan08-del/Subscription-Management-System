import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import * as billing from '../api/billing.js';
import { useSession } from '../auth/useSession.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatMoney, formatPercent, labelFor } from '../lib/format.js';

const NEXT_STEP = {
  draft: { status: 'quotation', label: 'Send as quotation' },
  quotation: { status: 'confirmed', label: 'Confirm' },
  confirmed: { status: 'active', label: 'Activate' },
  active: { status: 'closed', label: 'Close subscription' },
};

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const { user } = useSession();
  const isStaff = user.role !== 'customer';
  const queryClient = useQueryClient();

  const subscription = useQuery({
    queryKey: ['subscriptions', id],
    queryFn: () => billing.getSubscription(id),
  });
  const invoices = useQuery({
    queryKey: ['invoices', { subscription_id: id }],
    queryFn: () => billing.listInvoices({ subscription_id: id, pageSize: 50 }),
  });

  const advance = useMutation({
    mutationFn: (status) => billing.changeSubscriptionStatus(id, status),
    onSuccess: (updated) => {
      queryClient.setQueryData(['subscriptions', id], updated);
      queryClient.invalidateQueries({ queryKey: ['subscriptions'], exact: false });
    },
  });

  const pauseToggle = useMutation({
    mutationFn: (paused) =>
      paused ? billing.resumeSubscription(id) : billing.pauseSubscription(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['subscriptions', id], updated);
      queryClient.invalidateQueries({ queryKey: ['subscriptions'], exact: false });
    },
  });

  if (subscription.isLoading) return <p className="page-message">Loading…</p>;
  if (subscription.error) return <p className="form-error">{subscription.error.message}</p>;

  const s = subscription.data;
  const next = NEXT_STEP[s.status];
  const canPause = s.status === 'active' && s.end_behavior === 'pausable';

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {s.number} <StatusBadge status={s.paused_at ? 'paused' : s.status} />
        </h1>
        <div className="form-actions">
          {isStaff && canPause && (
            <button
              className="button-secondary"
              disabled={pauseToggle.isPending}
              onClick={() => pauseToggle.mutate(Boolean(s.paused_at))}
            >
              {s.paused_at ? 'Resume billing' : 'Pause'}
            </button>
          )}
          {isStaff && next && !s.paused_at && (
            <button
              className={next.status === 'closed' ? 'button-secondary' : undefined}
              disabled={advance.isPending}
              onClick={() => advance.mutate(next.status)}
            >
              {next.label}
            </button>
          )}
        </div>
      </div>
      {s.paused_at && (
        <p className="form-success">
          Paused since {s.paused_at}. No invoices are created while paused.
        </p>
      )}
      {(advance.error || pauseToggle.error) && (
        <p className="form-error">{(advance.error || pauseToggle.error).message}</p>
      )}

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
        <h2>Lines</h2>
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
                <td>{line.product_name}</td>
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
      </section>

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
          <p className="page-message">No invoices yet. They appear after the billing run.</p>
        )}
      </section>
    </div>
  );
}
