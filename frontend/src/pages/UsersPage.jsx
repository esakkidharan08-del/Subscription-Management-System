import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as admin from '../api/admin.js';
import { useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';
import FormMessage from '../components/FormMessage.jsx';
import Pagination from '../components/Pagination.jsx';
import { useSaveMutation } from '../hooks/useSaveMutation.js';

const emptyUser = { name: '', email: '', password: '', role: 'staff' };

function NewUserForm({ onDone }) {
  const [form, setForm] = useState(emptyUser);
  const save = useSaveMutation({ create: admin.createUser, queryKey: ['users'], onSaved: onDone });
  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <form
      className="card form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ body: form });
      }}
    >
      <h2>New user</h2>
      <FormMessage error={save.error} />
      <label>
        Name
        <input value={form.name} onChange={setField('name')} />
        <FieldError error={save.error} field="name" />
      </label>
      <label>
        Email
        <input type="email" value={form.email} onChange={setField('email')} />
        <FieldError error={save.error} field="email" />
      </label>
      <label>
        Temporary password
        <input type="password" value={form.password} onChange={setField('password')} />
        <FieldError error={save.error} field="password" />
      </label>
      <label>
        Role
        <select value={form.role} onChange={setField('role')}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          <option value="customer">Customer</option>
        </select>
      </label>
      <div className="form-actions span-2">
        <button type="submit" disabled={save.isPending}>
          Create user
        </button>
        <button type="button" className="button-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function UsersPage() {
  const { user } = useSession();
  const isAdmin = user.role === 'admin';
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const users = useQuery({
    queryKey: ['users', { page, role, search }],
    queryFn: () => admin.listUsers({ page, role, search }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>Users</h1>
        {isAdmin && !creating && <button onClick={() => setCreating(true)}>New user</button>}
      </div>
      {creating && <NewUserForm onDone={() => setCreating(false)} />}

      <div className="card">
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="admin">Admins</option>
            <option value="staff">Staff</option>
            <option value="customer">Customers</option>
          </select>
        </div>
        {users.data?.data.length === 0 ? (
          <p className="page-message">No users found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.data.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td className="capitalize">{u.role}</td>
                  <td>{u.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={users.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
