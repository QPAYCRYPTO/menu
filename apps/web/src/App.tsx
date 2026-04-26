// apps/web/src/App.tsx
// ════════════════════════════════════════════════════════
// SADECE 3 DEĞİŞİKLİK VAR:
//  1. İki yeni import ekle (HomePage, PricingPage)
//  2. İki yeni route ekle (/, /fiyat)
//  3. Catch-all route'u /login yerine / yap
// Diğer her şey eskisi gibi kalacak.
// ════════════════════════════════════════════════════════

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
import { WaitersPage } from './pages/WaitersPage';
import { WaiterCallsProvider } from './context/WaiterCallsContext';
import { WaiterCallsPage } from './pages/waiter/WaiterCallsPage';

// ✅ YENİ — Bu iki satırı ekle:
import { HomePage } from './pages/HomePage';
import { PricingPage } from './pages/PricingPage';
import { WaiterAuthProvider } from './context/WaiterAuthContext';
import { WaiterLoginPage } from './pages/waiter/WaiterLoginPage';
import { WaiterLayout } from './pages/waiter/WaiterLayout';
import { WaiterTablesPage } from './pages/waiter/WaiterTablesPage';
import { WaiterTableDetailPage } from './pages/waiter/WaiterTableDetailPage';
import { WaiterMenuPage } from './pages/waiter/WaiterMenuPage';

function RequireOwner({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== 'owner' && role !== 'superadmin') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <WaiterAuthProvider>
        <WaiterCallsProvider>
          <BrowserRouter>
            <Routes>

              {/* ✅ YENİ — Public marketing sayfaları (en üste ekle) */}
              <Route path="/" element={<HomePage />} />
              <Route path="/fiyat" element={<PricingPage />} />

              {/* Mevcut route'lar — değişiklik yok */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset" element={<ResetPage />} />
              <Route path="/sifre-sifirla" element={<ResetPasswordPage />} />
              <Route path="/m/:slug" element={<PublicMenuPage />} />
              <Route path="/superadmin" element={<SuperAdminPage />} />

              {/* Owner Routes — değişiklik yok */}
              <Route
                path="/owner"
                element={
                  <RequireOwner>
                    <OwnerLayout />
                  </RequireOwner>
                }
              >
                <Route index element={<OwnerDashboardPage />} />
              </Route>

              {/* Admin Routes — değişiklik yok */}
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
                <Route path="waiters" element={<WaitersPage />} />
              </Route>

              {/* GARSON ROUTE'LARI */}
              <Route path="/g/:token" element={<WaiterLoginPage />} />
              <Route path="/garson/giris" element={<WaiterLoginPage />} />
              <Route path="/garson" element={<WaiterLayout />}>
                <Route index element={<WaiterTablesPage />} />
                <Route path="cagrilar" element={<WaiterCallsPage />} />
                <Route path="masa/:id" element={<WaiterTableDetailPage />} />
                <Route path="masa/:id/menu" element={<WaiterMenuPage />} />
              </Route>

              {/* ✅ Bilinmeyen URL'ler ana sayfaya gitsin */}
              <Route path="*" element={<Navigate to="/" replace />} />

            </Routes>
          </BrowserRouter>
        </WaiterCallsProvider>
      </WaiterAuthProvider>
    </AuthProvider>
  );
}