import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as billing from '../api/billing.js';
import { useSession } from '../auth/useSession.js';
import Pagination from '../components/Pagination.jsx';
import { formatMoney, methodLabel } from '../lib/format.js';

const METHODS = ['upi', 'bank_transfer', 'card', 'cash'];

const isoToday = () => new Date().toISOString().slice(0, 10);
const startOfMonth = () => `${isoToday().slice(0, 8)}01`;

// Quick ranges cover the questions finance asks most; the date inputs cover the rest.
const RANGES = [
  { key: 'month', label: 'This month', from: startOfMonth, to: isoToday },
  {
    key: '90d',
    label: 'Last 90 days',
    from: () => new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10),
    to: isoToday,
  },
  { key: 'all', label: 'All time', from: () => '', to: () => '' },
];

function formatDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function PaymentsPage() {
  const { user } = useSession();
  const isStaff = user.role !== 'customer';
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(isoToday());
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');

  const query = { page, from, to, method, search };
  const payments = useQuery({
    queryKey: ['payments', query],
    queryFn: () => billing.listPayments(query),
    placeholderData: keepPreviousData,
  });

  const change = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  function applyRange(range) {
    setFrom(range.from());
    setTo(range.to());
    setPage(1);
  }

  const activeRange = RANGES.find((r) => r.from() === from && r.to() === to)?.key;
  const summary = payments.data?.summary;
  const periodLabel =
    from || to
      ? `${from ? formatDate(from) : 'the start'} to ${to ? formatDate(to) : 'today'}`
      : 'all time';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{isStaff ? 'Payments' : 'My payments'}</h1>
          <p className="page-subline">
            {summary
              ? `${formatMoney(summary.total)} received in ${summary.count.toLocaleString('en-IN')} payments, ${periodLabel}.`
              : 'Loading payments…'}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Date range">
            {RANGES.map((range) => (
              <button
                key={range.key}
                aria-pressed={activeRange === range.key}
                onClick={() => applyRange(range)}
              >
                {range.label}
              </button>
            ))}
          </div>
          <label className="inline-label">
            From
            <input type="date" value={from} onChange={(e) => change(setFrom)(e.target.value)} />
          </label>
          <label className="inline-label">
            To
            <input type="date" value={to} onChange={(e) => change(setTo)(e.target.value)} />
          </label>
          <select
            value={method}
            onChange={(e) => change(setMethod)(e.target.value)}
            aria-label="Method"
          >
            <option value="">All methods</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {methodLabel(m)}
              </option>
            ))}
          </select>
          {isStaff && (
            <input
              className="search"
              placeholder="Customer or invoice number"
              value={search}
              onChange={(e) => change(setSearch)(e.target.value)}
            />
          )}
        </div>

        {summary && (
          <div
            className="kpi-strip payment-summary"
            style={{
              '--kpi-columns': `minmax(0, 1.4fr) repeat(${Math.max(summary.byMethod.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            <div className="kpi kpi-lead">
              <span className="kpi-label">Received</span>
              <span className="kpi-value">{formatMoney(summary.total)}</span>
              <span className="kpi-note">{summary.count.toLocaleString('en-IN')} payments</span>
            </div>
            {summary.byMethod.length ? (
              summary.byMethod.map((m) => (
                <div className="kpi" key={m.method}>
                  <span className="kpi-label">{methodLabel(m.method)}</span>
                  <span className="kpi-value">{formatMoney(m.total)}</span>
                  <span className="kpi-note">
                    {m.count.toLocaleString('en-IN')} ·{' '}
                    {summary.total ? Math.round((m.total / summary.total) * 100) : 0}% of total
                  </span>
                </div>
              ))
            ) : (
              <div className="kpi is-zero">
                <span className="kpi-label">By method</span>
                <span className="kpi-value">—</span>
                <span className="kpi-note">No payments in this range</span>
              </div>
            )}
          </div>
        )}

        {payments.isLoading ? (
          <p className="page-message">Loading…</p>
        ) : payments.error ? (
          <p className="form-error">Couldn&rsquo;t load payments. {payments.error.message}</p>
        ) : payments.data.data.length === 0 ? (
          <p className="empty-state">No payments match these filters.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                {isStaff && <th>Customer</th>}
                <th>Method</th>
                <th>Note</th>
                <th className="number">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.data.data.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.paid_on)}</td>
                  <td>
                    <Link to={`/invoices/${payment.invoice_id}`}>{payment.invoice_number}</Link>
                  </td>
                  {isStaff && <td>{payment.customer_name}</td>}
                  <td>{methodLabel(payment.method)}</td>
                  <td className="cell-muted">{payment.note ?? '—'}</td>
                  <td className="number">{formatMoney(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={payments.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
