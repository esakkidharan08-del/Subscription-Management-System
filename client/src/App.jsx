import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api/client.js';
import LoginPage from './pages/LoginPage.jsx';
import SubscriptionsPage from './pages/SubscriptionsPage.jsx';
import InvoicesPage from './pages/InvoicesPage.jsx';

export default function App() {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api('/auth/me').catch((err) => (err.status === 401 ? { user: null } : Promise.reject(err))),
  });

  if (me.isLoading) return <p className="page">Loading…</p>;
  if (me.isError) return <p className="page error">{me.error.message}</p>;

  const user = me.data.user;
  if (!user) return <LoginPage onLogin={(u) => queryClient.setQueryData(['me'], { user: u })} />;

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    queryClient.clear();
    queryClient.setQueryData(['me'], { user: null });
  }

  return (
    <>
      <header className="topbar">
        <strong>Subscription Manager</strong>
        <nav>
          <NavLink to="/subscriptions">Subscriptions</NavLink>
          <NavLink to="/invoices">Invoices</NavLink>
        </nav>
        <span className="muted">{user.name} ({user.role})</span>
        <button className="button-secondary" onClick={logout}>Log out</button>
      </header>
      <main className="page">
        <Routes>
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/invoices" element={<InvoicesPage user={user} />} />
          <Route path="*" element={<Navigate to="/subscriptions" replace />} />
        </Routes>
      </main>
    </>
  );
}
