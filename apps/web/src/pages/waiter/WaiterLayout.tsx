// apps/web/src/pages/waiter/WaiterLayout.tsx
// Garson paneli layout — üst bar + alt navigasyon (mobile-first)

import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';

export function WaiterLayout() {
  const { waiter, isAuthenticated, isChecking, logout } = useWaiterAuth();
  const location = useLocation();

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8FAFC' }}>
        <div className="text-sm" style={{ color: '#64748B' }}>Yükleniyor...</div>
      </div>
    );
  }

  if (!isAuthenticated || !waiter) {
    return <Navigate to="/garson/giris" replace />;
  }

  const navItems = [
    { to: '/garson', label: 'Masalar', icon: '🍽️', exact: true },
    { to: '/garson/cagrilar', label: 'Çağrılar', icon: '🔔', exact: false },
    { to: '/garson/profil', label: 'Profil', icon: '👤', exact: false }
  ];

  function isActive(to: string, exact: boolean) {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F8FAFC' }}>

      {/* Üst bar */}
      <div className="sticky top-0 z-40 bg-white" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: '#0D9488' }}>
              {waiter.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs" style={{ color: '#64748B' }}>Hoşgeldin,</div>
              <div className="font-bold text-sm truncate" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                {waiter.name}
              </div>
            </div>
          </div>
          <button onClick={logout}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold"
            style={{ background: '#FEF2F2', color: '#DC2626' }}>
            Çıkış
          </button>
        </div>
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-auto p-4 pb-24">
        <Outlet />
      </div>

      {/* Alt navigasyon (mobil) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white z-40"
        style={{ borderTop: '1px solid #E2E8F0', boxShadow: '0 -4px 12px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {navItems.map(item => (
            <Link key={item.to} to={item.to}
              className="flex-1 flex flex-col items-center gap-1 py-3"
              style={{
                textDecoration: 'none',
                color: isActive(item.to, item.exact) ? '#0D9488' : '#94A3B8'
              }}>
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-semibold">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}