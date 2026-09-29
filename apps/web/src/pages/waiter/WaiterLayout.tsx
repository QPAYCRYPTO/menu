// apps/web/src/pages/waiter/WaiterLayout.tsx
// CHANGELOG:
// - Alt nav "Çağrılar" sekmesinde aktif çağrı sayısı rozet (kırmızı, animate-pulse)

import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { useWaiterCalls } from '../../context/WaiterCallsContext';
import { Bell, LogOut, User, UtensilsCrossed } from 'lucide-react';

export function WaiterLayout() {
  const { waiter, isAuthenticated, isChecking, logout } = useWaiterAuth();
  const { calls, readyOrders } = useWaiterCalls();
  const location = useLocation();

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-panel rounded-3xl px-8 py-7 text-center fade-enter">
          <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
          <div className="text-sm font-semibold text-white/80">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !waiter) {
    return <Navigate to="/garson/giris" replace />;
  }

  // Rozet: bekleyen çağrılar + teslim bekleyen hazır siparişler
  const callCount = calls.length + readyOrders.length;

  const navItems = [
    { to: '/garson', label: 'Masalar', icon: UtensilsCrossed, exact: true, badge: 0 },
    { to: '/garson/cagrilar', label: 'Çağrılar', icon: Bell, exact: false, badge: callCount },
    { to: '/garson/profil', label: 'Profil', icon: User, exact: false, badge: 0 }
  ];

  function isActive(to: string, exact: boolean) {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  }

  return (
    <div className="min-h-screen flex flex-col text-white">

      <div className="sticky top-0 z-40 px-3.5 pt-3">
        <div className="mx-auto max-w-[520px] glass-panel rounded-3xl px-3.5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="btn-accent w-11 h-11 rounded-2xl flex items-center justify-center text-base font-extrabold flex-shrink-0">
              {waiter.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-white/70 font-medium">Hoşgeldin,</div>
              <div className="font-serif font-bold text-base leading-tight truncate">
                {waiter.name}
              </div>
            </div>
          </div>
          <button onClick={logout}
            className="glass-pill min-h-[36px] px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 spring-btn"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'rgba(251,113,133,0.45)' }}>
            <LogOut size={12} aria-hidden /> Çıkış
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3.5 pt-3 pb-28">
        <div className="mx-auto w-full max-w-[520px]">
          <Outlet />
        </div>
      </div>

      <div className="fixed bottom-3 left-0 right-0 z-40 px-3.5">
        <div className="mx-auto max-w-[520px] flex items-center gap-1 p-1.5 rounded-3xl bg-black/45 border border-white/25 backdrop-blur-xl"
          style={{ boxShadow: 'var(--glass-shadow-sm)' }}>
          {navItems.map(item => {
            const active = isActive(item.to, item.exact);
            return (
              <Link key={item.to} to={item.to}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl relative spring-btn ${active ? 'btn-accent' : 'text-white/70'}`}
                style={{ textDecoration: 'none' }}>
                <div style={{ position: 'relative' }}>
                  <span className="leading-none flex"><item.icon size={18} aria-hidden /></span>
                  {item.badge > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: -6,
                      right: -12,
                      background: 'linear-gradient(135deg, #FB7185, #E11D48)',
                      color: 'white',
                      fontSize: 10,
                      fontWeight: 800,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 5px',
                      border: '1px solid rgba(255,255,255,0.7)',
                      boxShadow: '0 4px 10px rgba(225,29,72,0.5)',
                      animation: 'badge-pulse 1.5s ease-in-out infinite'
                    }}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-bold">{item.label}</span>
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
