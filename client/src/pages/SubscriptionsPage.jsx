import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as billing from '../api/billing.js';
import * as catalog from '../api/catalog.js';
import { useSession } from '../auth/useSession.js';
import FieldError from '../components/FieldError.jsx';
import FormMessage from '../components/FormMessage.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatMoney, labelFor, toNumberOrNull } from '../lib/format.js';

const STATUSES = ['draft', 'quotation', 'confirmed', 'active', 'closed'];
const TERMS = ['immediate', 'net_15', 'net_30'];

const todayIso = () => new Date().toISOString().slice(0, 10);

function NewSubscriptionForm({ onCancel }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    source: 'plan',
    customer_id: '',
    plan_id: '',
    template_id: '',
    start_date: todayIso(),
    expiry_date: '',
    payment_terms: 'immediate',
  });

  const customers = useQuery({ queryKey: ['customers'], queryFn: billing.allCustomers });
  const plans = useQuery({ queryKey: ['plans', 'all'], queryFn: catalog.allPlans });
  const templates = useQuery({
    queryKey: ['templates', 'all'],
    queryFn: () => catalog.listTemplates({ pageSize: 100 }).then((page) => page.data),
  });

  const create = useMutation({
    mutationFn: (body) =>
      form.source === 'template' ? billing.createFromTemplate(body) : billing.createSubscription(body),
    onSuccess: (subscription) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      navigate(`/subscriptions/${subscription.id}`);
    },
  });

  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function handleSubmit(event) {
    event.preventDefault();
    const shared = {
      customer_id: toNumberOrNull(form.customer_id),
      start_date: form.start_date,
      expiry_date: form.expiry_date || null,
      payment_terms: form.payment_terms,
    };
    create.mutate(
      form.source === 'template'
        ? { ...shared, template_id: toNumberOrNull(form.template_id) }
        : { ...shared, plan_id: toNumberOrNull(form.plan_id) },
    );
  }

  const error = create.error;

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>New subscription</h2>
      <FormMessage error={error} />
      <label>
        Customer
        <select value={form.customer_id} onChange={setField('customer_id')}>
          <option value="">Choose a customer</option>
          {customers.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} ({customer.email})
            </option>
          ))}
        </select>
        <FieldError error={error} field="customer_id" />
      </label>
      <label>
        Start from
        <select value={form.source} onChange={setField('source')}>
          <option value="plan">A plan</option>
          <option value="template">A quotation template</option>
        </select>
      </label>
      {form.source === 'plan' ? (
        <label>
          Plan
          <select value={form.plan_id} onChange={setField('plan_id')}>
            <option value="">Choose a plan</option>
            {plans.data?.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · {formatMoney(plan.price)} / {plan.billing_period}
              </option>
            ))}
          </select>
          <FieldError error={error} field="plan_id" />
        </label>
      ) : (
        <label>
          Template
          <select value={form.template_id} onChange={setField('template_id')}>
            <option value="">Choose a template</option>
            {templates.data?.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <FieldError error={error} field="template_id" />
        </label>
      )}
      <label>
        Payment terms
        <select value={form.payment_terms} onChange={setField('payment_terms')}>
          {TERMS.map((term) => (
            <option key={term} value={term}>
              {labelFor(term)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start date
        <input type="date" value={form.start_date} onChange={setField('start_date')} />
        <FieldError error={error} field="start_date" />
      </label>
      <label>
        Expiry date (optional)
        <input type="date" value={form.expiry_date} onChange={setField('expiry_date')} />
        <FieldError error={error} field="expiry_date" />
      </label>
      <div className="form-actions span-2">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create draft'}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function SubscriptionsPage() {
  const { user } = useSession();
  const isStaff = user.role !== 'customer';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const subscriptions = useQuery({
    queryKey: ['subscriptions', { page, status, search }],
    queryFn: () => billing.listSubscriptions({ page, status, search }),
    placeholderData: keepPreviousData,
  });

  const resetPage = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isStaff ? 'Subscriptions' : 'My subscriptions'}</h1>
        {isStaff && !creating && <button onClick={() => setCreating(true)}>New subscription</button>}
      </div>

      {creating && <NewSubscriptionForm onCancel={() => setCreating(false)} />}

      <div className="card">
        <div className="toolbar">
          {isStaff && (
            <input
              className="search"
              placeholder="Search number or customer"
              value={search}
              onChange={resetPage(setSearch)}
            />
          )}
          <select value={status} onChange={resetPage(setStatus)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        {subscriptions.isLoading ? (
          <p className="page-message">Loading…</p>
        ) : subscriptions.data?.data.length === 0 ? (
          <p className="page-message">No subscriptions found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Number</th>
                {isStaff && <th>Customer</th>}
                <th>Plan</th>
                <th>Status</th>
                <th>Next bill</th>
                <th className="number">Per period</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.data?.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/subscriptions/${s.id}`}>{s.number}</Link>
                  </td>
                  {isStaff && <td>{s.customer_name}</td>}
                  <td>{s.plan_name}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>{s.next_billing_date ?? '—'}</td>
                  <td className="number">{formatMoney(s.recurring_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={subscriptions.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
