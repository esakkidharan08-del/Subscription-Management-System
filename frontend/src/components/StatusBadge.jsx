import { labelFor } from '../lib/format.js';

// One status mark per row, as a pale tint with dark ink of the same hue. Green
// means settled or running, amber needs a decision, red is money that is late;
// everything else stays neutral.
const TONE = {
  draft: '',
  quotation: 'badge-warning',
  confirmed: 'badge-info',
  active: 'badge-positive',
  paid: 'badge-positive',
  paused: 'badge-warning',
  closed: '',
  cancelled: 'badge-struck',
};

export default function StatusBadge({ status, overdue, kind = 'subscription' }) {
  if (overdue) return <span className="badge badge-negative">Overdue</span>;
  const label = kind === 'invoice' && status === 'confirmed' ? 'Unpaid' : labelFor(status);
  const text = label.charAt(0).toUpperCase() + label.slice(1);
  return <span className={`badge ${TONE[status] ?? ''}`}>{text}</span>;
}
