import { useQuery } from '@tanstack/react-query';
import { lazy } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboard } from '../api/admin.js';
import { useSession } from '../auth/useSession.js';
import { formatMoney } from '../lib/format.js';

const DashboardPage = lazy(() => import('./DashboardPage.jsx'));

function CustomerHome({ user }) {
  const summary = useQuery({ queryKey: ['dashboard', 'me'], queryFn: () => fetchDashboard() });
  const s = summary.data?.customer;

  return (
    <div className="page narrow">
      <div className="page-header">
        <div>
          <h1>{user.name}</h1>
          <p className="page-subline">
            {!s
              ? 'Loading your account…'
              : s.balance_due > 0
                ? `You owe ${formatMoney(s.balance_due)}. Open an invoice to pay it by UPI or card.`
                : 'You are all paid up.'}
          </p>
        </div>
        {s?.balance_due > 0 && (
          <Link to="/invoices?filter=confirmed" className="button-anchor button">
            Pay invoices
          </Link>
        )}
      </div>
      {s && (
        <div className="kpi-strip" style={{ '--kpi-columns': 'repeat(2, minmax(0, 1fr))' }}>
          <Link to="/invoices?filter=confirmed" className="kpi kpi-lead">
            <span className="kpi-label">Balance due</span>
            <span className="kpi-value">{formatMoney(s.balance_due)}</span>
            <span className={s.overdue_count ? 'kpi-note is-bad' : 'kpi-note'}>
              {s.overdue_count ? `${s.overdue_count} past due` : 'Nothing past due'}
            </span>
          </Link>
          <Link to="/subscriptions" className="kpi">
            <span className="kpi-label">Active subscriptions</span>
            <span className="kpi-value">{s.active_subscriptions}</span>
            <span className="kpi-note">View your plans and next bills</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { user } = useSession();
  return user.role === 'customer' ? <CustomerHome user={user} /> : <DashboardPage />;
}
