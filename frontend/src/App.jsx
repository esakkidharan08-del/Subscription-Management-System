import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './auth/useSession.js';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';

const ProductsPage = lazy(() => import('./pages/ProductsPage.jsx'));
const PlansPage = lazy(() => import('./pages/PlansPage.jsx'));
const TaxesPage = lazy(() => import('./pages/TaxesPage.jsx'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage.jsx'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage.jsx'));
const SubscriptionDetailPage = lazy(() => import('./pages/SubscriptionDetailPage.jsx'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage.jsx'));
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage.jsx'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage.jsx'));
const DiscountsPage = lazy(() => import('./pages/DiscountsPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.jsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));

const loading = <p className="page-message">Loading…</p>;

function RequireLogin({ children }) {
  const { user, isLoading } = useSession();
  if (isLoading) return loading;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useSession();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}

const staff = ['admin', 'staff'];

export default function App() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          element={
            <RequireLogin>
              <Layout />
            </RequireLogin>
          }
        >
          <Route index element={<HomePage />} />
          <Route
            path="products"
            element={
              <RequireRole roles={staff}>
                <ProductsPage />
              </RequireRole>
            }
          />
          <Route path="plans" element={<PlansPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="subscriptions/:id" element={<SubscriptionDetailPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route
            path="users"
            element={
              <RequireRole roles={staff}>
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="activity"
            element={
              <RequireRole roles={['admin']}>
                <AuditPage />
              </RequireRole>
            }
          />
          <Route
            path="discounts"
            element={
              <RequireRole roles={staff}>
                <DiscountsPage />
              </RequireRole>
            }
          />
          <Route
            path="taxes"
            element={
              <RequireRole roles={staff}>
                <TaxesPage />
              </RequireRole>
            }
          />
          <Route
            path="templates"
            element={
              <RequireRole roles={staff}>
                <TemplatesPage />
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
