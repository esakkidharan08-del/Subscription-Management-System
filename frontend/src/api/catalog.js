import { api } from './client.js';

export const listProducts = (query) => api('/products', { query });
export const createProduct = (body) => api('/products', { method: 'POST', body });
export const updateProduct = (id, body) => api(`/products/${id}`, { method: 'PUT', body });
export const deleteProduct = (id) => api(`/products/${id}`, { method: 'DELETE' });

export const listPlans = (query) => api('/plans', { query });
export const createPlan = (body) => api('/plans', { method: 'POST', body });
export const updatePlan = (id, body) => api(`/plans/${id}`, { method: 'PUT', body });
export const deletePlan = (id) => api(`/plans/${id}`, { method: 'DELETE' });

export const listTaxes = () => api('/taxes');
export const createTax = (body) => api('/taxes', { method: 'POST', body });
export const updateTax = (id, body) => api(`/taxes/${id}`, { method: 'PUT', body });
export const deleteTax = (id) => api(`/taxes/${id}`, { method: 'DELETE' });
export const listTaxRules = () => api('/taxes/rules');
export const createTaxRule = (body) => api('/taxes/rules', { method: 'POST', body });
export const deleteTaxRule = (id) => api(`/taxes/rules/${id}`, { method: 'DELETE' });

export const listTemplates = (query) => api('/quotation-templates', { query });
export const createTemplate = (body) => api('/quotation-templates', { method: 'POST', body });
export const updateTemplate = (id, body) =>
  api(`/quotation-templates/${id}`, { method: 'PUT', body });
export const deleteTemplate = (id) => api(`/quotation-templates/${id}`, { method: 'DELETE' });

// Dropdowns need the whole list; 100 is the API's page cap and plenty for a catalog.
export const allProducts = () => listProducts({ pageSize: 100 }).then((page) => page.data);
export const allPlans = () => listPlans({ pageSize: 100 }).then((page) => page.data);
