import { api } from './client.js';

export const fetchDashboard = (months) => api('/dashboard', { query: { months } });
export const listUsers = (query) => api('/users', { query });
export const createUser = (body) => api('/users', { method: 'POST', body });
export const listAudit = (query) => api('/audit', { query });
export const changePassword = (body) => api('/auth/change-password', { method: 'POST', body });

// The browser downloads the file itself, so the session cookie goes along as usual.
export function invoiceExportUrl(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  return `/api/invoices/export.csv?${params}`;
}
