import { api } from './client.js';

export const fetchCurrentUser = () => api('/auth/me').then((data) => data.user);
export const login = (credentials) => api('/auth/login', { method: 'POST', body: credentials });
export const signup = (details) => api('/auth/signup', { method: 'POST', body: details });
export const logout = () => api('/auth/logout', { method: 'POST' });
export const forgotPassword = (email) =>
  api('/auth/forgot-password', { method: 'POST', body: { email } });
export const resetPassword = (token, password) =>
  api('/auth/reset-password', { method: 'POST', body: { token, password } });
