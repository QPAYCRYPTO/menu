// apps/web/src/components/Layout.tsx
// CHANGELOG v3:
// - Masalar altına "Ödemeler" alt menüsü eklendi (indent ile)
// - Stil 5: Kart tarzı — sol kenar 3px renk şerit + hafif border + soft icon kutusu

import { useState } from 'react';
import {
  Armchair, Bell, ClipboardList, CreditCard, LayoutDashboard, List, LogOut, Menu, QrCode, Settings,
  ShoppingCart, Users
} from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useOrders } from '../context/OrderContext';

type NavColor = {
  base: string;
  bgPasif: string;
  bgIcon: string;
  bgAktif: string;
};

const COLORS: Record<string, NavColor> = {
  panel:      { base: '#A78BFA', bgPasif: 'rgba(255,255,255,0.06)', bgIcon: 'rgba(139,92,246,0.24)', bgAktif: '#8B5CF6' },
  orders:     { base: '#FBBF24', bgPasif: 'rgba(255,255,255,0.06)', bgIcon: 'rgba(245,158,11,0.24)', bgAktif: '#F59E0B' },
  tables:     { base: '#34D399', bgPasif: 'rgba(255,255,255,0.06)', bgIcon: 'rgba(16,185,129,0.24)', bgAktif: '#10B981' },
  payment:    { base: '#FDBA74', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(255,122,41,0.22)', bgAktif: '#FF7A29' },
  categories: { base: '#7DD3FC', bgPasif: 'rgba(255,255,255,0.06)', bgIcon: 'rgba(14,165,233,0.24)', bgAktif: '#0EA5E9' },
  products:   { base: '#D8B4FE', bgPasif: 'rgba(255,255,255,0.06)', bgIcon: 'rgba(168,85,247,0.24)', bgAktif: '#A855F7' },
  waiters:    { base: '#FF9A5A', bgPasif: 'rgba(255,255,255,0.06)', bgIcon: 'rgba(255,122,41,0.24)', bgAktif: '#FF7A29' },
  settings:   { base: '#E2E8F0', bgPasif: 'rgba(255,255,255,0.06)', bgIcon: 'rgba(255,255,255,0.16)', bgAktif: '#94A3B8' },
  qr:         { base: '#A5B4FC', bgPasif: 'rgba(255,255,255,0.06)', bgIcon: 'rgba(99,102,241,0.26)', bgAktif: '#6366F1' }
};

export function AdminLayout() {
  const { logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pendingCount, callCount, unlockAudio } = useOrders();

  // Ana nav item'ları — payment Masalar'ın altında sub-item olarak gelecek
  const navItems = [
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
      to: '/admin/waiters', label: 'Garsonlar', colorKey: 'waiters', sub: false,
      icon: <Users size={14} />
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

  function isActive(path: string) {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  }

  const currentLabel = navItems.find(i => isActive(i.to))?.label ?? 'Panel';

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-white/20">
        <div className="flex items-center gap-3">
          <div className="btn-accent w-10 h-10 rounded-2xl flex items-center justify-center">
            <QrCode size={18} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-serif font-bold text-white text-lg leading-tight tracking-wide">
              Atlas<span style={{ color: 'var(--accent)' }}>QR</span>
            </div>
            <div className="text-[10px] font-semibold text-white/60" style={{ letterSpacing: '0.12em' }}>YÖNETİM PANELİ</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-none">
        {navItems.map(item => {
          const active = isActive(item.to);
          const color = COLORS[item.colorKey];
          const badge = (item as any).badge;
          const isSub = item.sub;

          return (
            <Link key={item.to} to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={`spring-btn ${active ? 'btn-accent' : isSub ? 'bg-white/[0.04] hover:bg-white/15' : 'bg-white/[0.06] hover:bg-white/15'}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: isSub ? '7px 10px 7px 14px' : '9px 10px',
                marginLeft: isSub ? 16 : 0,
                border: active ? undefined : '1px solid transparent',
                borderLeft: active
                  ? undefined
                  : isSub
                  ? '2px solid rgba(255,255,255,0.25)'
                  : '1px solid transparent',
                borderRadius: 14,
                textDecoration: 'none',
                marginBottom: 2
              }}>
              <div style={{
                width: isSub ? 24 : 30,
                height: isSub ? 24 : 30,
                borderRadius: isSub ? 8 : 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: active ? 'rgba(255,255,255,0.25)' : color.bgIcon,
                border: '1px solid rgba(255,255,255,0.2)',
                color: active ? 'white' : color.base,
                position: 'relative'
              }}>
                {item.icon}
                {badge > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    background: 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)', color: 'white',
                    border: '1px solid rgba(255,255,255,0.7)',
                    minWidth: 16, height: 16, borderRadius: 8,
                    fontSize: 9, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px'
                  }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span style={{
                flex: 1,
                fontSize: isSub ? 12 : 13,
                fontWeight: active ? 700 : 600,
                color: active ? 'white' : isSub ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.9)'
              }}>
                {item.label}
              </span>
              {badge > 0 && (
                <span style={{
                  background: active ? 'rgba(255,255,255,0.28)' : 'var(--danger-bg)',
                  color: active ? 'white' : 'var(--danger)',
                  border: active ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(251,113,133,0.45)',
                  fontSize: 10, fontWeight: 800,
                  padding: '2px 7px', borderRadius: 999
                }}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/20">
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/15 spring-btn">
          <LogOut size={16} className="flex-shrink-0" />
          Çıkış Yap
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex text-white md:p-3 md:gap-3" onClick={unlockAudio}>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col glass-panel glass-sidebar rounded-3xl overflow-hidden sticky top-3"
        style={{ width: 232, height: 'calc(100vh - 24px)', flexShrink: 0 }}>
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md fade-enter" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 flex flex-col glass-dark glass-sidebar rounded-r-3xl overflow-hidden"
            style={{ width: 260 }}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-3 pt-3 md:px-0 md:pt-0">
          <div className="glass-panel rounded-3xl px-4 md:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button className="md:hidden glass-pill w-9 h-9 rounded-xl flex items-center justify-center spring-btn"
                onClick={() => setSidebarOpen(true)}>
                <Menu size={18} color="#fff" />
              </button>
              <h1 className="font-serif font-bold text-white truncate" style={{ fontSize: 20 }}>
                {currentLabel}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Link to="/admin/orders" style={{ textDecoration: 'none' }}>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse"
                    style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.45)' }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: 'var(--danger)' }} />
                    {pendingCount} sipariş
                  </div>
                </Link>
              )}
              {callCount > 0 && (
                <Link to="/admin/orders" style={{ textDecoration: 'none' }}>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse"
                    style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.45)' }}>
                    <Bell size={12} /> {callCount} çağrı
                  </div>
                </Link>
              )}
              {pendingCount === 0 && callCount === 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid rgba(52,211,153,0.45)' }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
                  <span className="hidden sm:inline">Aktif</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 md:px-2 md:py-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
