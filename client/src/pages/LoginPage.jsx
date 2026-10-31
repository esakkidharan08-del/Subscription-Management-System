import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useLogin, useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';

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
      </form>
    </div>
  );
}
