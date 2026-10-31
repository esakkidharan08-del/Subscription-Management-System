import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLogout, useSession } from '../auth/useSession.js';

const navByRole = {
  admin: [{ to: '/', label: 'Home' }],
  staff: [{ to: '/', label: 'Home' }],
  customer: [{ to: '/', label: 'Home' }],
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
            <NavLink key={item.to} to={item.to} end>
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
