import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { invoiceExportUrl } from '../api/admin.js';
import * as billing from '../api/billing.js';
import { useSession } from '../auth/useSession.js';
import Pagination from '../components/Pagination.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatMoney } from '../lib/format.js';

function BillingRunPanel() {
  const queryClient = useQueryClient();
  const [asOf, setAsOf] = useState('');
  const run = useMutation({
    mutationFn: () => billing.runBilling(asOf || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  return (
    <section className="card">
      <h2>Billing run</h2>
      <p className="hint">
        Bills every active subscription that is due. It is safe to run again: periods that already
        have an invoice are skipped. The server also runs this every hour.
      </p>
      <div className="inline-row">
        <label className="inline-label">
          Bill up to
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? 'Running…' : 'Run billing now'}
        </button>
      </div>
      {run.error && <p className="form-error">{run.error.message}</p>}
      {run.data && (
        <p className="form-success">
          Billed up to {run.data.asOf}: {run.data.invoicesCreated} invoices created,{' '}
          {run.data.periodsSkipped} already billed, {run.data.subscriptionsClosed} subscriptions
          closed
          {run.data.failures.length > 0 && `, ${run.data.failures.length} failed`}.
        </p>
      )}
    </section>
  );
}

export default function InvoicesPage() {
  const { user } = useSession();
  const isStaff = user.role !== 'customer';
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const query = {
    page,
    search,
    status: filter === 'overdue' ? '' : filter,
    overdue: filter === 'overdue' ? 'true' : '',
  };
  const invoices = useQuery({
    queryKey: ['invoices', query],
    queryFn: () => billing.listInvoices(query),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isStaff ? 'Invoices' : 'My invoices'}</h1>
        {isStaff && (
          <a className="button-secondary button-anchor" href={invoiceExportUrl(query)}>
            Export CSV
          </a>
        )}
      </div>

      {isStaff && <BillingRunPanel />}

      <div className="card">
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search invoice number"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All invoices</option>
            <option value="confirmed">Unpaid</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {invoices.isLoading ? (
          <p className="page-message">Loading…</p>
        ) : invoices.data?.data.length === 0 ? (
          <p className="page-message">No invoices found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Number</th>
                {isStaff && <th>Customer</th>}
                <th>Subscription</th>
                <th>Period</th>
                <th>Status</th>
                <th>Due</th>
                <th className="number">Total</th>
                <th className="number">Paid</th>
              </tr>
            </thead>
            <tbody>
              {invoices.data?.data.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`/invoices/${invoice.id}`}>{invoice.number}</Link>
                  </td>
                  {isStaff && <td>{invoice.customer_name}</td>}
                  <td>{invoice.subscription_number}</td>
                  <td>
                    {invoice.period_start} to {invoice.period_end}
                  </td>
                  <td>
                    <StatusBadge status={invoice.status} overdue={invoice.is_overdue} />
                  </td>
                  <td>{invoice.due_date}</td>
                  <td className="number">{formatMoney(invoice.total)}</td>
                  <td className="number">{formatMoney(invoice.amount_paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={invoices.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
