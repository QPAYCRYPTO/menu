// apps/web/src/components/Layout.tsx
// CHANGELOG v3:
// - Masalar altına "Ödemeler" alt menüsü eklendi (indent ile)
// - Stil 5: Kart tarzı — sol kenar 3px renk şerit + hafif border + soft icon kutusu
// - Atölye tasarımı: gece/gündüz temasına uyar; aktif sekme petrol (bg-brand), başlıkta güneş/ay düğmesi.
//   Sidebar genişliği, ikonlar ve mobil hamburger menü korunur.

import { useEffect, useState } from 'react';
import {
  Armchair, Bell, ChefHat, ClipboardList, CreditCard, LayoutDashboard, List, LogOut, Menu, QrCode, Settings,
  ShoppingCart, Users
} from 'lucide-react';
import type { BusinessSettingsResponse } from '@menu/shared';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useThemedPage } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

// Sekme ikonlarının tonu — her iki temada okunur orta doygunlukta renkler
const ICON_HUE: Record<string, string> = {
  panel: '#7c5cc4',
  orders: '#b7791f',
  tables: '#2f855a',
  payment: '#c05621',
  categories: '#2b6cb0',
  products: '#8b5cf6',
  waiters: '#c05621',
  kitchen: '#c53030',
  settings: '#718096',
  qr: '#4c51bf'
};

type ModuleKey = 'waiter' | 'kitchen';
type ModuleFlags = Record<ModuleKey, boolean>;

/** Süper adminin işletme bazında açıp kapattığı modüller. Sekme pencereye dönülünce tazelenir. */
function useModuleFlags(accessToken: string | null): ModuleFlags | null {
  const [flags, setFlags] = useState<ModuleFlags | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const load = () => {
      apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken })
        .then(b => { if (!cancelled) setFlags({ waiter: b.waiter_module_enabled === true, kitchen: b.kitchen_module_enabled === true }); })
        .catch(() => {});
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, [accessToken]);

  return flags;
}

export function AdminLayout() {
  const { logout, accessToken } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pendingCount, callCount, unlockAudio } = useOrders();
  const moduleFlags = useModuleFlags(accessToken);
  useThemedPage();

  // Ana nav item'ları — payment Masalar'ın altında sub-item olarak gelecek
  // `module` olan sekmeler yalnızca o modül işletmede açıksa görünür (bilinmiyorken gizli)
  const allNavItems: Array<{
    to: string; label: string; colorKey: string; sub: boolean; icon: JSX.Element; badge?: number; module?: ModuleKey;
  }> = [
    {
      to: '/admin', label: 'Panel', colorKey: 'panel', sub: false,
      icon: <LayoutDashboard size={14} />
    },
    {
      to: '/admin/orders', label: 'Siparişler', badge: pendingCount, colorKey: 'orders', sub: false,
      icon: <ClipboardList size={14} />
    },
    {
      to: '/admin/tables', label: 'Masalar', colorKey: 'tables', sub: false,
      icon: <Armchair size={14} />
    },
    // Alt menü — Masalar'ın altında, indent'li
    {
      to: '/admin/tables', label: 'Ödemeler', colorKey: 'payment', sub: true,
      icon: <CreditCard size={12} />
    },
    {
      to: '/admin/categories', label: 'Kategoriler', colorKey: 'categories', sub: false,
      icon: <List size={14} />
    },
    {
      to: '/admin/products', label: 'Ürünler', colorKey: 'products', sub: false,
      icon: <ShoppingCart size={14} />
    },
    {
      to: '/admin/waiters', label: 'Garsonlar', colorKey: 'waiters', sub: false, module: 'waiter',
      icon: <Users size={14} />
    },
    {
      to: '/admin/kitchen', label: 'Mutfak', colorKey: 'kitchen', sub: false, module: 'kitchen',
      icon: <ChefHat size={14} />
    },
    {
      to: '/admin/settings', label: 'Ayarlar', colorKey: 'settings', sub: false,
      icon: <Settings size={14} />
    },
    {
      to: '/admin/qr', label: 'QR Kod', colorKey: 'qr', sub: false,
      icon: <QrCode size={14} />
    },
  ];
  const navItems = allNavItems.filter(i => !i.module || moduleFlags?.[i.module] === true);

  function isActive(path: string) {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  }

  const currentLabel = navItems.find(i => isActive(i.to))?.label ?? 'Panel';

  // Modül kapalıyken sekmenin adresine doğrudan gelinirse panele dön
  const blockedItem = moduleFlags
    ? allNavItems.find(i => i.module && !moduleFlags[i.module] && location.pathname.startsWith(i.to))
    : undefined;
  if (blockedItem) return <Navigate to="/admin" replace />;

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="bg-brand text-on-brand w-10 h-10 rounded-2xl flex items-center justify-center">
            <QrCode size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-serif font-bold text-ink text-lg leading-tight tracking-wide">
              Atlas<span className="text-accent">QR</span>
            </div>
            <div className="ui-eyebrow" style={{ fontSize: 9 }}>Yönetim Paneli</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-none" aria-label="Yönetim menüsü">
        {navItems.map(item => {
          const active = isActive(item.to);
          const hue = ICON_HUE[item.colorKey] ?? 'var(--accent)';
          const badge = item.badge ?? 0;
          const isSub = item.sub;

          return (
            <Link key={`${item.to}-${item.label}`} to={item.to}
              onClick={() => setSidebarOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`spring-btn no-underline flex items-center gap-2.5 rounded-[14px] mb-0.5 ${
                active ? 'bg-brand text-on-brand' : 'text-ink hover:bg-surface-2'
              } ${isSub ? 'ml-4 py-[7px] pr-2.5 pl-3.5 border-l-2 border-line' : 'py-[9px] px-2.5'}`}>
              <div className="relative flex items-center justify-center flex-shrink-0"
                style={{
                  width: isSub ? 24 : 30,
                  height: isSub ? 24 : 30,
                  borderRadius: isSub ? 8 : 10,
                  // İkon kutusu: sekmenin kendi renginde yumuşak ton; aktifken petrol üstünde saydam beyaz
                  background: active ? 'rgba(255,255,255,0.18)' : `color-mix(in srgb, ${hue} 14%, transparent)`,
                  color: active ? 'currentColor' : hue
                }}>
                {item.icon}
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white"
                    style={{ background: '#d4453d' }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className={`flex-1 ${isSub ? 'text-xs' : 'text-[13px]'} ${active ? 'font-bold' : isSub ? 'font-semibold text-ink-muted' : 'font-semibold'}`}>
                {item.label}
              </span>
              {badge > 0 && (
                <span className={`text-[10px] font-extrabold px-[7px] py-0.5 rounded-full ${
                  active ? 'bg-white/25 text-on-brand' : 'bg-state-danger-bg text-state-danger'}`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line">
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold text-ink-muted hover:text-ink hover:bg-surface-2 spring-btn">
          <LogOut size={16} className="flex-shrink-0" />
          Çıkış Yap
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-page text-ink md:p-3 md:gap-3" onClick={unlockAudio}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col ui-card rounded-3xl overflow-hidden sticky top-3"
        style={{ width: 232, height: 'calc(100vh - 24px)', flexShrink: 0 }}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 ui-scrim fade-enter" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 flex flex-col bg-surface border-r border-line rounded-r-3xl overflow-hidden"
            style={{ width: 260 }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-3 pt-3 md:px-0 md:pt-0">
          <header className="ui-card rounded-3xl px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="md:hidden ui-chip w-9 h-9 rounded-xl flex items-center justify-center spring-btn"
                onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç">
                <Menu size={18} />
              </button>
              <h1 className="font-serif font-bold text-ink truncate" style={{ fontSize: 22 }}>
                {currentLabel}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Link to="/admin/orders" className="no-underline">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse bg-state-danger-bg text-state-danger">
                    <div className="w-2 h-2 rounded-full bg-current" />
                    {pendingCount} sipariş
                  </div>
                </Link>
              )}
              {callCount > 0 && (
                <Link to="/admin/orders" className="no-underline">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse bg-state-warn-bg text-state-warn">
                    <Bell size={12} /> {callCount} çağrı
                  </div>
                </Link>
              )}
              {pendingCount === 0 && callCount === 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-state-ok-bg text-state-ok">
                  <div className="w-2 h-2 rounded-full bg-current" />
                  <span className="hidden sm:inline">Aktif</span>
                </div>
              )}
              <ThemeToggle />
            </div>
          </header>
        </div>

        <div className="flex-1 overflow-auto p-4 md:px-2 md:py-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
