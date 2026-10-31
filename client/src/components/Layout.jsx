import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLogout, useSession } from '../auth/useSession.js';

const catalogLinks = [
  { to: '/products', label: 'Products' },
  { to: '/plans', label: 'Plans' },
  { to: '/taxes', label: 'Taxes' },
  { to: '/templates', label: 'Templates' },
];

const billingLinks = [
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/discounts', label: 'Discounts' },
];

const navByRole = {
  admin: [{ to: '/', label: 'Home' }, ...billingLinks, ...catalogLinks],
  staff: [{ to: '/', label: 'Home' }, ...billingLinks, ...catalogLinks],
  customer: [
    { to: '/', label: 'Home' },
    { to: '/subscriptions', label: 'My subscriptions' },
    { to: '/invoices', label: 'My invoices' },
    { to: '/plans', label: 'Plans' },
  ],
};

export default function Layout() {
  const { user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout.mutateAsync();
    navigate('/login');
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Subscriptions</span>
        <nav>
          {navByRole[user.role].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-user">
          <span>
            {user.name} <small>({user.role})</small>
          </span>
          <button className="button-link" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
