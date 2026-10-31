import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { signupSchema } from 'shared/validation/auth.js';
import { useSession, useSignup } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';
import PasswordChecklist from '../components/PasswordChecklist.jsx';
import { checkLocally } from '../lib/validate.js';

export default function SignupPage() {
  const { user } = useSession();
  const signup = useSignup();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [localError, setLocalError] = useState(null);

  if (user) return <Navigate to="/" replace />;

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });
  const error = localError ?? signup.error;

  function handleSubmit(event) {
    event.preventDefault();
    const problems = checkLocally(signupSchema, form);
    setLocalError(problems);
    if (!problems) signup.mutate(form, { onSuccess: () => navigate('/') });
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Create an account</h1>
        {error && !Object.keys(error.fields ?? {}).length && (
          <p className="form-error">{error.message}</p>
        )}
        <label>
          Name
          <input value={form.name} onChange={update('name')} autoComplete="name" />
        </label>
        <FieldError error={error} field="name" />
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} autoComplete="email" />
        </label>
        <FieldError error={error} field="email" />
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
          />
        </label>
        <PasswordChecklist value={form.password} />
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
