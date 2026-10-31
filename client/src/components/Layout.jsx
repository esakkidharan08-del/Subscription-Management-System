import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  admin: [
    { to: '/', label: 'Dashboard' },
    ...billingLinks,
    ...catalogLinks,
    { to: '/users', label: 'Users' },
    { to: '/activity', label: 'Activity' },
  ],
  staff: [
    { to: '/', label: 'Dashboard' },
    ...billingLinks,
    ...catalogLinks,
    { to: '/users', label: 'Users' },
  ],
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
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the phone menu whenever a link takes us somewhere new.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function handleLogout() {
    await logout.mutateAsync();
    navigate('/login');
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Subscriptions</span>
        <button
          className="menu-toggle button-secondary"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
        <div id="main-nav" className={menuOpen ? 'topbar-menu is-open' : 'topbar-menu'}>
          <nav>
            {navByRole[user.role].map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-user">
            <NavLink to="/account" className="account-link">
              {user.name} <small>({user.role})</small>
            </NavLink>
            <button className="button-link" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
