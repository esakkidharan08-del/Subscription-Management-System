import { useQuery } from '@tanstack/react-query';
import { lazy } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboard } from '../api/admin.js';
import { useSession } from '../auth/useSession.js';
import { formatMoney } from '../lib/format.js';

const DashboardPage = lazy(() => import('./DashboardPage.jsx'));

function CustomerHome({ user }) {
  const summary = useQuery({ queryKey: ['dashboard', 'me'], queryFn: fetchDashboard });
  const s = summary.data?.customer;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Welcome, {user.name}</h1>
      </div>
      {s && (
        <div className="stat-grid">
          <Link to="/subscriptions" className="card stat-tile stat-link">
            <span className="stat-label">Active subscriptions</span>
            <span className="stat-value">{s.active_subscriptions}</span>
          </Link>
          <Link to="/invoices" className="card stat-tile stat-link">
            <span className="stat-label">Balance due</span>
            <span className="stat-value">{formatMoney(s.balance_due)}</span>
            {s.overdue_count > 0 && (
              <span className="stat-note danger">{s.overdue_count} overdue</span>
            )}
          </Link>
        </div>
      )}
      <p className="hint">Open an invoice to pay it online with card or UPI.</p>
    </div>
  );
}

export default function HomePage() {
  const { user } = useSession();
  return user.role === 'customer' ? <CustomerHome user={user} /> : <DashboardPage />;
}
