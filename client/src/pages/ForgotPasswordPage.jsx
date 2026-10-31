import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth.js';
import FieldError from '../components/FieldError.jsx';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const request = useMutation({ mutationFn: forgotPassword });

  function handleSubmit(event) {
    event.preventDefault();
    request.mutate(email);
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Reset password</h1>
        {request.isSuccess ? (
          <p className="form-success">{request.data.message}</p>
        ) : (
          <>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <FieldError error={request.error} field="email" />
            <button type="submit" disabled={request.isPending}>
              Send reset link
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
