import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLogout, useSession } from '../auth/useSession.js';
import BrandMark from './BrandMark.jsx';

const STAFF_NAV = [
  {
    label: 'Billing',
    links: [
      { to: '/', label: 'Overview' },
      { to: '/subscriptions', label: 'Subscriptions' },
      { to: '/invoices', label: 'Invoices' },
      { to: '/discounts', label: 'Discounts' },
    ],
  },
  {
    label: 'Catalog',
    links: [
      { to: '/products', label: 'Products' },
      { to: '/plans', label: 'Plans' },
      { to: '/taxes', label: 'Taxes' },
      { to: '/templates', label: 'Quotation templates' },
    ],
  },
  {
    label: 'Team',
    links: [{ to: '/users', label: 'Users' }],
  },
];

const ADMIN_NAV = STAFF_NAV.map((group) =>
  group.label === 'Team'
    ? { ...group, links: [...group.links, { to: '/activity', label: 'Activity log' }] }
    : group,
);

const CUSTOMER_NAV = [
  {
    label: 'Your account',
    links: [
      { to: '/', label: 'Overview' },
      { to: '/subscriptions', label: 'Subscriptions' },
      { to: '/invoices', label: 'Invoices' },
      { to: '/plans', label: 'Plans' },
    ],
  },
];

const NAV_BY_ROLE = { admin: ADMIN_NAV, staff: STAFF_NAV, customer: CUSTOMER_NAV };
const SCOPE_BY_ROLE = {
  admin: 'Head office · INR',
  staff: 'Head office · INR',
  customer: 'Customer portal',
};

export default function Layout() {
  const { user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function handleLogout() {
    await logout.mutateAsync();
    navigate('/login');
  }

  const scope = SCOPE_BY_ROLE[user.role];

  return (
    <div className="shell">
      <header className="mobile-bar">
        <BrandMark scope={scope} />
        <button
          className="button-secondary"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </header>

      <aside id="sidebar" className={menuOpen ? 'sidebar is-open' : 'sidebar'}>
        <BrandMark scope={scope} />
        <nav aria-label="Main">
          {NAV_BY_ROLE[user.role].map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.to === '/'} className="nav-link">
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-user">
          <NavLink to="/account" title="My account">
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </NavLink>
          <button className="button-link" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
