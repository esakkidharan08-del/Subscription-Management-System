import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatMoney } from '../api/client.js';

export default function InvoicesPage({ user }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['invoices'], queryFn: () => api('/invoices') });
  const billing = useMutation({
    mutationFn: () => api('/billing/run', { method: 'POST', body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });

  return (
    <>
      <h1>Invoices</h1>
      {user.role !== 'customer' && (
        <p>
          <button onClick={() => billing.mutate()} disabled={billing.isPending}>
            {billing.isPending ? 'Running…' : 'Run billing'}
          </button>
          {billing.data && <span className="muted"> Created {billing.data.invoiced}, skipped {billing.data.skipped}</span>}
          {billing.error && <span className="error"> {billing.error.message}</span>}
        </p>
      )}
      {isLoading && <p>Loading invoices…</p>}
      {error && <p className="error">{error.message}</p>}
      {data?.items.length === 0 && <p className="muted">No invoices yet.</p>}
      {data?.items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Number</th><th>Customer</th><th>Period</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.number}</td><td>{i.customer_name}</td>
                  <td>{i.period_start} to {i.period_end}</td><td>{formatMoney(i.total)}</td>
                  <td>{i.is_overdue ? 'overdue' : i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
