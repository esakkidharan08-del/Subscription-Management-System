import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession, useSignup } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';

export default function SignupPage() {
  const { user } = useSession();
  const signup = useSignup();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  if (user) return <Navigate to="/" replace />;

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    signup.mutate(form, { onSuccess: () => navigate('/') });
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Create an account</h1>
        {signup.error && !Object.keys(signup.error.fields).length && (
          <p className="form-error">{signup.error.message}</p>
        )}
        <label>
          Name
          <input value={form.name} onChange={update('name')} required />
        </label>
        <FieldError error={signup.error} field="name" />
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>
        <FieldError error={signup.error} field="email" />
        <label>
          Password
          <input type="password" value={form.password} onChange={update('password')} required />
        </label>
        <FieldError error={signup.error} field="password" />
        <p className="hint">More than 8 characters, with upper and lower case and a special character.</p>
        <button type="submit" disabled={signup.isPending}>
          {signup.isPending ? 'Creating…' : 'Sign up'}
        </button>
        <p className="auth-links">
          <Link to="/login">Already have an account? Log in</Link>
        </p>
      </form>
    </div>
  );
}
