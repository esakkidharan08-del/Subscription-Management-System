import { labelFor } from '../lib/format.js';

export default function StatusBadge({ status, overdue }) {
  if (overdue) return <span className="badge badge-overdue">overdue</span>;
  return <span className={`badge badge-${status}`}>{labelFor(status)}</span>;
}
