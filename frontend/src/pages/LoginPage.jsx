import BrandMark from '../components/BrandMark.jsx';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useLogin, useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';

// Seed accounts from `npm run seed`. Shown only in development builds.
// They are real logins on the reserved documentation domain, so it is intended here.
const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@example.com', password: 'Admin@12345' }, // taste-skill-ignore
  { role: 'Staff', email: 'staff@example.com', password: 'Staff@12345' }, // taste-skill-ignore
  { role: 'Customer', email: 'customer@example.com', password: 'Customer@123' }, // taste-skill-ignore
];

export default function LoginPage() {
  const { user } = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (user) return <Navigate to="/" replace />;

  function handleSubmit(event) {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate('/') });
  }

  return (
    <div className="auth-page">
      <BrandMark />
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Log in</h1>
        {login.error && !Object.keys(login.error.fields).length && (
          <p className="form-error">{login.error.message}</p>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <FieldError error={login.error} field="email" />
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <FieldError error={login.error} field="password" />
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </button>
        <p className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/signup">Create an account</Link>
        </p>
        {import.meta.env.DEV && (
          <div className="demo-accounts">
            <span className="detail-label">Demo accounts (dev only)</span>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="button-link"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
              >
                {account.role}: {account.email} / {account.password}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
