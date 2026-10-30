import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

export default function SubscriptionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => api('/subscriptions'),
  });

  if (isLoading) return <p>Loading subscriptions…</p>;
  if (error) return <p className="error">{error.message}</p>;
  if (data.items.length === 0) return <p className="muted">No subscriptions yet.</p>;

  return (
    <>
      <h1>Subscriptions</h1>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Number</th><th>Customer</th><th>Plan</th><th>Status</th><th>Next billing</th></tr>
          </thead>
          <tbody>
            {data.items.map((s) => (
              <tr key={s.id}>
                <td>{s.number}</td><td>{s.customer_name}</td><td>{s.plan_name}</td>
                <td>{s.status}</td><td>{s.next_billing_date ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
