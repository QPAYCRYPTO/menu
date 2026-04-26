// apps/web/src/pages/waiter/WaiterLayout.tsx
// CHANGELOG:
// - Alt nav "Çağrılar" sekmesinde aktif çağrı sayısı rozet (kırmızı, animate-pulse)

import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { useWaiterCalls } from '../../context/WaiterCallsContext';

export function WaiterLayout() {
  const { waiter, isAuthenticated, isChecking, logout } = useWaiterAuth();
  const { calls } = useWaiterCalls();
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

  const callCount = calls.length;

  const navItems = [
    { to: '/garson', label: 'Masalar', icon: '🍽️', exact: true, badge: 0 },
    { to: '/garson/cagrilar', label: 'Çağrılar', icon: '🔔', exact: false, badge: callCount },
    { to: '/garson/profil', label: 'Profil', icon: '👤', exact: false, badge: 0 }
  ];

  function isActive(to: string, exact: boolean) {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F8FAFC' }}>

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

      <div className="flex-1 overflow-auto p-4 pb-24">
        <Outlet />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white z-40"
        style={{ borderTop: '1px solid #E2E8F0', boxShadow: '0 -4px 12px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {navItems.map(item => {
            const active = isActive(item.to, item.exact);
            return (
              <Link key={item.to} to={item.to}
                className="flex-1 flex flex-col items-center gap-1 py-3 relative"
                style={{
                  textDecoration: 'none',
                  color: active ? '#0D9488' : '#94A3B8'
                }}>
                <div style={{ position: 'relative' }}>
                  <span className="text-xl">{item.icon}</span>
                  {item.badge > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: -6,
                      right: -10,
                      background: '#DC2626',
                      color: 'white',
                      fontSize: 10,
                      fontWeight: 700,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 5px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                      animation: 'badge-pulse 1.5s ease-in-out infinite'
                    }}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes badge-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}