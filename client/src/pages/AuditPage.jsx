import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listAudit } from '../api/admin.js';
import Pagination from '../components/Pagination.jsx';
import { formatMoney, labelFor } from '../lib/format.js';

const ENTITIES = ['subscription', 'invoice', 'discount', 'user', 'billing'];

function describeDetails(entry) {
  const d = entry.details;
  if (!d) return '';
  if (entry.action === 'status_changed') return `${d.from} → ${d.to}`;
  if (entry.action === 'payment_recorded') return `${formatMoney(d.amount)} by ${labelFor(d.method)}`;
  if (entry.action === 'billing_run') return `${d.invoicesCreated} invoices, ${d.subscriptionsClosed} closed`;
  if (d.email) return `${d.email} (${d.role})`;
  if (d.name) return d.name;
  return '';
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');

  const log = useQuery({
    queryKey: ['audit', { page, entity }],
    queryFn: () => listAudit({ page, entity }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>Activity log</h1>
      </div>
      <div className="card">
        <div className="toolbar">
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Everything</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {labelFor(e)}
              </option>
            ))}
          </select>
        </div>
        {log.data?.data.length === 0 ? (
          <p className="page-message">Nothing recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When (UTC)</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {log.data?.data.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.created_at}</td>
                  <td>{entry.actor_name ?? 'System'}</td>
                  <td>{labelFor(entry.action)}</td>
                  <td>
                    {entry.entity}
                    {entry.entity_id ? ` #${entry.entity_id}` : ''}
                  </td>
                  <td>{describeDetails(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={log.data?.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
