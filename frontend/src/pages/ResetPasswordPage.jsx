import BrandMark from '../components/BrandMark.jsx';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/auth.js';
import { passwordField } from 'shared/validation/auth.js';
import FieldError from '../components/FieldError.jsx';
import PasswordChecklist from '../components/PasswordChecklist.jsx';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const reset = useMutation({ mutationFn: (newPassword) => resetPassword(token, newPassword) });

  function handleSubmit(event) {
    event.preventDefault();
    reset.mutate(password);
  }

  return (
    <div className="auth-page">
      <BrandMark />
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Choose a new password</h1>
        {reset.isSuccess ? (
          <p className="form-success">{reset.data.message}</p>
        ) : (
          <>
            {reset.error && !Object.keys(reset.error.fields).length && (
              <p className="form-error">{reset.error.message}</p>
            )}
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <PasswordChecklist value={password} />
            <FieldError error={reset.error} field="password" />
            <button
              type="submit"
              disabled={reset.isPending || !token || !passwordField.safeParse(password).success}
            >
              Update password
            </button>
          </>
        )}
        <p className="auth-links">
          <Link to="/login">Back to log in</Link>
        </p>
      </form>
    </div>
  );
}
