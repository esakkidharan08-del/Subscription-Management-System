import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboard } from '../api/admin.js';
import MonthlyBarChart from '../components/MonthlyBarChart.jsx';
import { formatMoney } from '../lib/format.js';

const count = (n) => n.toLocaleString('en-IN');

function plural(n, one, many = `${one}s`) {
  return `${count(n)} ${n === 1 ? one : many}`;
}

function formatDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The screen's question: how much are we owed, and how late is it?
function finding(d) {
  const oldest = d.overdueInvoices[0];
  if (!d.receivables.overdue_count) {
    return `Nothing is overdue. ${formatMoney(d.receivables.outstanding)} is out on invoices not yet due.`;
  }
  return `${formatMoney(d.receivables.overdue)} is overdue on ${plural(d.receivables.overdue_count, 'invoice')}. The oldest was due ${formatDate(oldest.due_date)}.`;
}

function Kpi({ label, value, note, bad, lead, zero, to }) {
  const className = ['kpi', lead && 'kpi-lead', zero && 'is-zero'].filter(Boolean).join(' ');
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {note && <span className={bad ? 'kpi-note is-bad' : 'kpi-note'}>{note}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// Unpaid money laddered by lateness. Each bar is that bucket's share of the
// largest bucket; anything already late is the one place red appears.
function AgeingCard({ ageing, outstanding }) {
  const largest = Math.max(...ageing.map((b) => b.balance), 1);
  return (
    <section className="card" aria-labelledby="ageing-title">
      <div className="card-head">
        <h2 id="ageing-title">Receivables by age</h2>
        <Link to="/invoices?filter=confirmed" className="hint">
          View unpaid
        </Link>
      </div>
      {ageing.map((bucket) => (
        <div
          key={bucket.key}
          className={
            bucket.key !== 'not_due' && bucket.balance > 0 ? 'ageing-row is-late' : 'ageing-row'
          }
        >
          <span>
            {bucket.label}
            <span className="cell-sub">{plural(bucket.count, 'invoice')}</span>
          </span>
          <span className="num" style={{ color: bucket.balance ? undefined : 'var(--muted)' }}>
            {formatMoney(bucket.balance)}
          </span>
          <div className="ageing-track" aria-hidden="true">
            <div
              className="ageing-fill"
              style={{ width: `${(bucket.balance / largest) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="ageing-total">
        <span>Outstanding</span>
        <span className="num">{formatMoney(outstanding)}</span>
      </div>
    </section>
  );
}

const PERIODS = [3, 6, 12, 24];

export default function DashboardPage() {
  const [months, setMonths] = useState(12);
  const dashboard = useQuery({
    queryKey: ['dashboard', { months }],
    queryFn: () => fetchDashboard(months),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  if (dashboard.isLoading) return <p className="page-message">Loading the overview…</p>;
  if (dashboard.error) {
    return (
      <div className="page">
        <h1>Overview</h1>
        <p className="form-error">
          Couldn&rsquo;t load the overview. {dashboard.error.message}{' '}
          <button className="button-link" onClick={() => dashboard.refetch()}>
            Retry
          </button>
        </p>
      </div>
    );
  }

  const d = dashboard.data;
  const updated = new Date(dashboard.dataUpdatedAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const statuses = d.subscriptionsByStatus;
  const waiting = (statuses.quotation ?? 0) + (statuses.draft ?? 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p className="page-subline">{finding(d)}</p>
        </div>
        <div className="form-actions">
          <span className="hint" title={`Calculated in ${d.queryMs} ms`}>
            Updated {updated}
          </span>
          <Link to="/invoices" className="button-anchor button-secondary">
            Run billing
          </Link>
          <Link to="/invoices?filter=overdue" className="button-anchor button">
            Chase overdue
          </Link>
        </div>
      </div>

      <div
        className="kpi-strip"
        style={{ '--kpi-columns': 'minmax(0, 1.45fr) repeat(4, minmax(0, 1fr))' }}
      >
        <Kpi
          lead
          label="Outstanding"
          value={formatMoney(d.receivables.outstanding)}
          note={plural(d.receivables.open_count, 'unpaid invoice')}
          to="/invoices?filter=confirmed"
        />
        <Kpi
          label="Overdue"
          value={formatMoney(d.receivables.overdue)}
          note={
            d.receivables.overdue_count
              ? `${plural(d.receivables.overdue_count, 'invoice')} past due`
              : 'None past due'
          }
          bad={d.receivables.overdue_count > 0}
          to="/invoices?filter=overdue"
        />
        <Kpi
          label="Billing in the next 7 days"
          zero={d.upcoming.amount === 0}
          value={formatMoney(d.upcoming.amount)}
          note={`${plural(d.upcoming.subscriptions, 'subscription')}, before tax`}
        />
        <Kpi
          label="Monthly recurring revenue"
          value={formatMoney(d.mrr)}
          note="Monthly equivalent, before tax"
        />
        <Kpi
          label="Active subscriptions"
          value={count(d.activeSubscriptions)}
          note={
            waiting
              ? `${plural(waiting, 'draft or quote', 'drafts and quotes')} waiting`
              : 'No quotes waiting'
          }
          to="/subscriptions?status=active"
        />
      </div>

      <div className="overview-main">
        <MonthlyBarChart
          key={d.monthlyRevenue.length}
          data={d.monthlyRevenue}
          totals={d.periodTotals}
          periods={PERIODS}
          months={months}
          onMonthsChange={setMonths}
        />
        <AgeingCard ageing={d.ageing} outstanding={d.receivables.outstanding} />
      </div>

      <div className="two-column">
        <section className="card" aria-labelledby="overdue-title">
          <div className="card-head">
            <h2 id="overdue-title">Oldest overdue</h2>
            <Link to="/invoices?filter=overdue" className="hint">
              View all {count(d.receivables.overdue_count)}
            </Link>
          </div>
          {d.overdueInvoices.length ? (
            d.overdueInvoices.slice(0, 5).map((invoice) => (
              <div className="list-row" key={invoice.id}>
                <span>
                  <Link to={`/invoices/${invoice.id}`}>{invoice.number}</Link>
                  <span className="cell-sub">{invoice.customer_name}</span>
                </span>
                <span className="num">
                  {formatMoney(invoice.balance)}
                  <span className="cell-sub">Due {formatDate(invoice.due_date)}</span>
                </span>
              </div>
            ))
          ) : (
            <p className="empty-state">
              Nothing is overdue. Unpaid invoices appear here once they pass their due date.
            </p>
          )}
        </section>

        <section className="card" aria-labelledby="customers-title">
          <div className="card-head">
            <h2 id="customers-title">Top customers by payments</h2>
            <span className="hint">All time</span>
          </div>
          {d.topCustomers.length ? (
            d.topCustomers.slice(0, 5).map((customer, i) => (
              <div className="list-row" key={customer.id}>
                <span>
                  {i + 1}. {customer.name}
                </span>
                <span className="num">{formatMoney(customer.paid)}</span>
              </div>
            ))
          ) : (
            <p className="empty-state">No payments recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
