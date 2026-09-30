// apps/web/src/pages/waiter/WaiterLayout.tsx
// CHANGELOG:
// - Alt nav "Çağrılar" sekmesinde aktif çağrı sayısı rozet (kırmızı, animate-pulse)
// - Atölye tasarımı: gece/gündüz temasına uyar (bg-page / ui-card / text-ink), başlıkta güneş/ay düğmesi.
//   Butonlar petrol (btn-primary), vurgular altın (text-accent). Telefonda alt menü korunur.

import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { useWaiterCalls } from '../../context/WaiterCallsContext';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useThemedPage } from '../../lib/theme';
import { Bell, LogOut, User, UtensilsCrossed } from 'lucide-react';

export function WaiterLayout() {
  const { waiter, isAuthenticated, isChecking, logout } = useWaiterAuth();
  const { calls, readyOrders } = useWaiterCalls();
  const location = useLocation();
  useThemedPage();

  if (isChecking) {
    return (
      <div className="min-h-screen bg-page text-ink flex items-center justify-center p-6">
        <div className="ui-card rounded-3xl px-8 py-7 text-center fade-enter">
          <div className="w-10 h-10 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-3" />
          <div className="text-sm font-semibold text-ink-muted">Yükleniyor...</div>
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
    <div className="min-h-screen flex flex-col bg-page text-ink">

      <div className="sticky top-0 z-40 px-3.5 pt-3 bg-page">
        <div className="mx-auto max-w-[520px] ui-card rounded-3xl px-3.5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-brand text-on-brand w-11 h-11 rounded-2xl flex items-center justify-center text-base font-extrabold flex-shrink-0">
              {waiter.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="ui-eyebrow truncate">{waiter.title || 'Personel'}</div>
              <div className="font-serif font-bold text-lg leading-tight truncate">
                {waiter.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ThemeToggle />
            <button onClick={logout}
              className="min-h-[40px] px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 spring-btn bg-state-danger-bg text-state-danger">
              <LogOut size={13} aria-hidden /> Çıkış
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3.5 pt-3 pb-28">
        <div className="mx-auto w-full max-w-[520px]">
          <Outlet />
        </div>
      </div>

      <div className="fixed bottom-3 left-0 right-0 z-40 px-3.5">
        <nav className="mx-auto max-w-[520px] flex items-center gap-1 p-1.5 rounded-3xl bg-surface border border-line shadow-lg"
          aria-label="Personel menüsü">
          {navItems.map(item => {
            const active = isActive(item.to, item.exact);
            return (
              <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl relative spring-btn no-underline ${
                  active ? 'bg-brand text-on-brand' : 'text-ink-muted'}`}>
                <div className="relative">
                  <span className="leading-none flex"><item.icon size={19} aria-hidden /></span>
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-[5px] rounded-full flex items-center justify-center text-[10px] font-extrabold bg-state-danger text-page border-2 border-[var(--surface)]"
                      style={{ animation: 'badge-pulse 1.5s ease-in-out infinite' }}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-bold">{item.label}</span>
              </Link>
            );
          })}
        </nav>
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
