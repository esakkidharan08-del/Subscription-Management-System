import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchDashboard } from '../api/admin.js';
import MonthlyBarChart from '../components/MonthlyBarChart.jsx';
import { formatMoney } from '../lib/format.js';

function StatTile({ label, value, note, to }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="card stat-tile stat-link">
      {body}
    </Link>
  ) : (
    <div className="card stat-tile">{body}</div>
  );
}

const STATUS_ORDER = ['draft', 'quotation', 'confirmed', 'active', 'closed'];

export default function DashboardPage() {
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 60_000,
  });

  if (dashboard.isLoading) return <p className="page-message">Loading…</p>;
  if (dashboard.error) return <p className="form-error">{dashboard.error.message}</p>;

  const d = dashboard.data;
  const collectedThisYear = d.monthlyRevenue.reduce((sum, m) => sum + m.collected, 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Finance dashboard</h1>
        <span className="hint">
          As of {d.asOf} · calculated in {d.queryMs} ms
        </span>
      </div>

      <div className="stat-grid">
        <StatTile label="Monthly recurring revenue" value={formatMoney(d.mrr)} note="Before tax" />
        <StatTile
          label="Active subscriptions"
          value={d.activeSubscriptions.toLocaleString('en-IN')}
          to="/subscriptions"
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(d.receivables.outstanding)}
          note={`${d.receivables.open_count.toLocaleString('en-IN')} unpaid invoices`}
          to="/invoices"
        />
        <StatTile
          label="Overdue"
          value={formatMoney(d.receivables.overdue)}
          note={`${d.receivables.overdue_count.toLocaleString('en-IN')} invoices past due`}
          to="/invoices"
        />
      </div>

      <MonthlyBarChart
        data={d.monthlyRevenue}
        valueKey="collected"
        title={`Payments collected per month · ${formatMoney(collectedThisYear)} in 12 months`}
      />

      <div className="two-column">
        <section className="card">
          <h2>Oldest overdue invoices</h2>
          {d.overdueInvoices.length ? (
            <table>
              <tbody>
                {d.overdueInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link to={`/invoices/${invoice.id}`}>{invoice.number}</Link>
                      <div className="hint">{invoice.customer_name}</div>
                    </td>
                    <td>Due {invoice.due_date}</td>
                    <td className="number">{formatMoney(invoice.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hint">Nothing overdue.</p>
          )}
        </section>

        <section className="card">
          <h2>Top customers by payments</h2>
          {d.topCustomers.length ? (
            <table>
              <tbody>
                {d.topCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td className="number">{formatMoney(customer.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hint">No payments yet.</p>
          )}
          <h2 className="section-gap">Subscriptions by status</h2>
          <table>
            <tbody>
              {STATUS_ORDER.map((status) => (
                <tr key={status}>
                  <td className="capitalize">{status}</td>
                  <td className="number">
                    {(d.subscriptionsByStatus[status] ?? 0).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
