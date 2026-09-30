// apps/web/src/components/Layout.tsx
// CHANGELOG v3:
// - Masalar altına "Ödemeler" alt menüsü eklendi (indent ile)
// - Stil 5: Kart tarzı — sol kenar 3px renk şerit + hafif border + soft icon kutusu
// - Atölye tasarımı: gece/gündüz temasına uyar; aktif sekme petrol (bg-brand), başlıkta güneş/ay düğmesi.
// - Sade kenar menü (referans tasarım): renkli ikon kutuları yok; ince çizgili (1.5), tek renk ikonlar.
//   Pasif: mürekkep rengi · Aktif: petrol zemin + beyaz · Alt sekme (Ödemeler): girintili, daha küçük.

import { useEffect, useState } from 'react';
import {
  Armchair, Bell, CalendarDays, ChefHat, ClipboardList, ConciergeBell, CreditCard, House, LayoutList, LogOut, Menu, QrCode, Settings,
  Users
} from 'lucide-react';
import type { BusinessSettingsResponse } from '@menu/shared';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useThemedPage } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

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

/** Üst çubuk: canlı tarih + saat (dakikada bir güncellenir). Tablette yalnızca saat; telefonda gizli (başlığa yer kalsın). */
function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Dakika dönümüne hizalı güncelle
    let timer = window.setTimeout(function tick() {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    }, 60_000 - (Date.now() % 60_000));
    return () => window.clearTimeout(timer);
  }, []);
  const date = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="hidden sm:flex items-center gap-2 text-ink-muted font-serif text-[15px] whitespace-nowrap" aria-label={`${date} ${time}`}>
      <CalendarDays size={18} strokeWidth={1.5} className="hidden md:block" aria-hidden />
      <span className="hidden md:inline">{date}</span>
      <span className="hidden md:inline text-line" aria-hidden>|</span>
      <span className="text-ink font-semibold tabular-nums">{time}</span>
    </div>
  );
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
    to: string; label: string; sub: boolean; icon: typeof House; badge?: number; module?: ModuleKey;
  }> = [
    {
      to: '/admin', label: 'Panel', sub: false,
      icon: House
    },
    {
      to: '/admin/orders', label: 'Siparişler', badge: pendingCount, sub: false,
      icon: ClipboardList
    },
    {
      to: '/admin/tables', label: 'Masalar', sub: false,
      icon: Armchair
    },
    // Alt menü — Masalar'ın altında, indent'li
    {
      to: '/admin/tables', label: 'Ödemeler', sub: true,
      icon: CreditCard
    },
    {
      to: '/admin/categories', label: 'Kategoriler', sub: false,
      icon: LayoutList
    },
    {
      to: '/admin/products', label: 'Ürünler', sub: false,
      icon: ConciergeBell
    },
    {
      to: '/admin/waiters', label: 'Personel', sub: false, module: 'waiter',
      icon: Users
    },
    {
      to: '/admin/kitchen', label: 'Mutfak', sub: false, module: 'kitchen',
      icon: ChefHat
    },
    {
      to: '/admin/settings', label: 'Ayarlar', sub: false,
      icon: Settings
    },
    {
      to: '/admin/qr', label: 'QR Kod', sub: false,
      icon: QrCode
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

      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto scrollbar-none" aria-label="Yönetim menüsü">
        {navItems.map(item => {
          const active = isActive(item.to);
          const badge = item.badge ?? 0;
          const isSub = item.sub;
          const Icon = item.icon;
          // Alt sekme ana sekmeyle aynı sayfayı açar; aktifken dolgu yerine yalnızca kalın yazı alır (çift vurgu olmasın)
          const filled = active && !isSub;

          return (
            <Link key={`${item.to}-${item.label}`} to={item.to}
              onClick={() => setSidebarOpen(false)}
              aria-current={active && !isSub ? 'page' : undefined}
              className={`spring-btn no-underline flex items-center gap-3 rounded-2xl transition-colors ${
                filled ? 'bg-brand text-on-brand' : active ? 'text-ink' : 'text-ink hover:bg-surface-2'
              } ${isSub ? 'ml-6 py-2 pl-3 pr-3 border-l border-line rounded-l-none' : 'py-2.5 px-3.5'}`}>
              <Icon size={isSub ? 17 : 21} strokeWidth={1.5} className={`flex-shrink-0 ${filled ? '' : isSub ? 'text-ink-muted' : ''}`} aria-hidden />
              <span className={`flex-1 font-serif ${isSub ? 'text-[14px]' : 'text-[16px]'} ${
                filled ? 'font-semibold' : active ? 'font-semibold' : isSub ? 'text-ink-muted' : ''}`}>
                {item.label}
              </span>
              {badge > 0 && (
                <span className={`min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                  filled ? 'bg-[color-mix(in_srgb,var(--on-brand)_25%,transparent)] text-on-brand' : 'bg-state-danger text-page'}`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line">
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-serif text-[15px] text-ink-muted hover:text-ink hover:bg-surface-2 spring-btn">
          <LogOut size={20} strokeWidth={1.5} className="flex-shrink-0" />
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
            <div className="flex items-center gap-2 md:gap-3">
              <HeaderClock />
              {pendingCount > 0 && (
                <Link to="/admin/orders" className="no-underline">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse bg-state-danger-bg text-state-danger">
                    <div className="w-2 h-2 rounded-full bg-current" />
                    {pendingCount}<span className="hidden sm:inline"> sipariş</span>
                  </div>
                </Link>
              )}
              {callCount > 0 && (
                <Link to="/admin/orders" className="no-underline">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse bg-state-warn-bg text-state-warn">
                    <Bell size={12} /> {callCount}<span className="hidden sm:inline"> çağrı</span>
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
