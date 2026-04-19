// apps/web/src/App.tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AdminLayout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { OrderProvider } from './context/OrderContext';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductsPage } from './pages/ProductsPage';
import { PublicMenuPage } from './pages/PublicMenuPage';
import { QrPage } from './pages/QrPage';
import { ResetPage } from './pages/ResetPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { SuperAdminPage } from './pages/SuperAdminPage';
import { TablesPage } from './pages/TablesPage';
import { OwnerLayout } from './pages/owner/OwnerLayout';
import { OwnerDashboardPage } from './pages/owner/OwnerDashboardPage';

// Owner-specific guard: sadece owner ve superadmin
function RequireOwner({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== 'owner' && role !== 'superadmin') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="/sifre-sifirla" element={<ResetPasswordPage />} />
          <Route path="/m/:slug" element={<PublicMenuPage />} />
          <Route path="/superadmin" element={<SuperAdminPage />} />

          {/* Owner Routes */}
          <Route
            path="/owner"
            element={
              <RequireOwner>
                <OwnerLayout />
              </RequireOwner>
            }
          >
            <Route index element={<OwnerDashboardPage />} />
            {/* İleride: <Route path="sales" element={<SalesReportPage />} /> */}
            {/* İleride: <Route path="products" element={<ProductsReportPage />} /> */}
            {/* İleride: <Route path="cancellations" element={<CancellationsReportPage />} /> */}
          </Route>

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <OrderProvider>
                  <AdminLayout />
                </OrderProvider>
              </RequireAuth>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="qr" element={<QrPage />} />
            <Route path="tables" element={<TablesPage />} />
            <Route path="orders" element={<OrdersPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}