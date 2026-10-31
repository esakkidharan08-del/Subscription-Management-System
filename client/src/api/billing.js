import { api } from './client.js';

export const listSubscriptions = (query) => api('/subscriptions', { query });
export const getSubscription = (id) => api(`/subscriptions/${id}`);
export const createSubscription = (body) => api('/subscriptions', { method: 'POST', body });
export const createFromTemplate = (body) =>
  api('/subscriptions/from-template', { method: 'POST', body });
export const changeSubscriptionStatus = (id, status) =>
  api(`/subscriptions/${id}/status`, { method: 'POST', body: { status } });

export const listInvoices = (query) => api('/invoices', { query });
export const getInvoice = (id) => api(`/invoices/${id}`);
export const updateDraftInvoice = (id, body) => api(`/invoices/${id}`, { method: 'PUT', body });
export const pauseSubscription = (id) => api(`/subscriptions/${id}/pause`, { method: 'POST' });
export const resumeSubscription = (id) => api(`/subscriptions/${id}/resume`, { method: 'POST' });
export const confirmInvoice = (id) => api(`/invoices/${id}/confirm`, { method: 'POST' });
export const cancelInvoice = (id) => api(`/invoices/${id}/cancel`, { method: 'POST' });
export const recordPayment = (id, body) =>
  api(`/invoices/${id}/payments`, { method: 'POST', body });

export const runBilling = (asOf) =>
  api('/billing/run', { method: 'POST', body: asOf ? { as_of: asOf } : {} });

export const listDiscounts = (query) => api('/discounts', { query });
export const createDiscount = (body) => api('/discounts', { method: 'POST', body });
export const updateDiscount = (id, body) => api(`/discounts/${id}`, { method: 'PUT', body });
export const deleteDiscount = (id) => api(`/discounts/${id}`, { method: 'DELETE' });

export const allCustomers = () =>
  api('/users', { query: { role: 'customer', pageSize: 100 } }).then((page) => page.data);
