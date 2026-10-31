import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { changePassword } from '../api/admin.js';
import { useSession } from '../auth/useSession.js';
import { passwordField } from 'shared/validation/auth.js';
import FieldError from '../components/FieldError.jsx';
import PasswordChecklist from '../components/PasswordChecklist.jsx';
import FormMessage from '../components/FormMessage.jsx';

export default function AccountPage() {
  const { user } = useSession();
  const [form, setForm] = useState({ current_password: '', new_password: '' });
  const change = useMutation({
    mutationFn: changePassword,
    onSuccess: () => setForm({ current_password: '', new_password: '' }),
  });
  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <div className="page narrow">
      <div className="page-header">
        <h1>My account</h1>
      </div>
      <section className="card details-grid">
        <div>
          <span className="detail-label">Name</span>
          {user.name}
        </div>
        <div>
          <span className="detail-label">Email</span>
          {user.email}
        </div>
        <div>
          <span className="detail-label">Role</span>
          <span className="capitalize">{user.role}</span>
        </div>
      </section>

      <form
        className="card auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          change.mutate(form);
        }}
      >
        <h2>Change password</h2>
        {change.isSuccess && <p className="form-success">{change.data.message}</p>}
        <FormMessage error={change.error} />
        <label>
          Current password
          <input
            type="password"
            value={form.current_password}
            onChange={setField('current_password')}
          />
        </label>
        <FieldError error={change.error} field="current_password" />
        <label>
          New password
          <input type="password" value={form.new_password} onChange={setField('new_password')} />
        </label>
        <PasswordChecklist value={form.new_password} />
        <FieldError error={change.error} field="new_password" />
        <p className="hint">Changing it signs you out on every other device.</p>
        <button
          type="submit"
          disabled={change.isPending || !passwordField.safeParse(form.new_password).success}
        >
          Change password
        </button>
      </form>
    </div>
  );
}
