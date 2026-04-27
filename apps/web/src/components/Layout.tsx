// apps/web/src/components/Layout.tsx
// CHANGELOG v2:
// - Stil 5: Kart tarzı — sol kenar 3px renk şerit + hafif border + soft icon kutusu
// - Pembe (Ürünler) → Mor (#8B5CF6) değişti
// - Aktif sekme: dolgun renk

import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useOrders } from '../context/OrderContext';

// ─────────────────────────────────────────────────────────────
// Her sekmenin renk paleti (Stil 5 — Kart tarzı)
// ─────────────────────────────────────────────────────────────
type NavColor = {
  base: string;        // Sol şerit + ikon stroke
  bgPasif: string;     // Kart bg pasif (rgba)
  bgIcon: string;      // İkon kutusu bg pasif
  bgAktif: string;     // Aktif kart dolgun
};

const COLORS: Record<string, NavColor> = {
  panel:      { base: '#8B5CF6', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(139,92,246,0.15)', bgAktif: '#8B5CF6' },
  orders:     { base: '#F59E0B', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(245,158,11,0.15)', bgAktif: '#F59E0B' },
  tables:     { base: '#10B981', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(16,185,129,0.15)', bgAktif: '#10B981' },
  categories: { base: '#3B82F6', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(59,130,246,0.15)', bgAktif: '#3B82F6' },
  products:   { base: '#A855F7', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(168,85,247,0.15)', bgAktif: '#A855F7' }, // PEMBE → MOR
  waiters:    { base: '#0D9488', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(13,148,136,0.18)', bgAktif: '#0D9488' }, // İmza turkuaz
  settings:   { base: '#94A3B8', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(148,163,184,0.15)', bgAktif: '#94A3B8' },
  qr:         { base: '#6366F1', bgPasif: 'rgba(255,255,255,0.04)', bgIcon: 'rgba(99,102,241,0.15)', bgAktif: '#6366F1' }
};

export function AdminLayout() {
  const { logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pendingCount, callCount, unlockAudio } = useOrders();

  const navItems = [
    {
      to: '/admin', label: 'Panel', colorKey: 'panel',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
    },
    {
      to: '/admin/orders', label: 'Siparişler', badge: pendingCount, colorKey: 'orders',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    },
    {
      to: '/admin/tables', label: 'Masalar', colorKey: 'tables',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><rect x="16" y="16" width="5" height="5"/><line x1="8" y1="5" x2="16" y2="5"/><line x1="8" y1="19" x2="16" y2="19"/><line x1="5" y1="8" x2="5" y2="16"/><line x1="19" y1="8" x2="19" y2="16"/></svg>
    },
    {
      to: '/admin/categories', label: 'Kategoriler', colorKey: 'categories',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
    },
    {
      to: '/admin/products', label: 'Ürünler', colorKey: 'products',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    },
    {
      to: '/admin/waiters', label: 'Garsonlar', colorKey: 'waiters',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    },
    {
      to: '/admin/settings', label: 'Ayarlar', colorKey: 'settings',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    },
    {
      to: '/admin/qr', label: 'QR Kod', colorKey: 'qr',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/></svg>
    },
  ];

  function isActive(path: string) {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  }

  const currentLabel = navItems.find(i => isActive(i.to))?.label ?? 'Panel';

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#0D9488' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="3" y="3" width="5" height="5" /><rect x="16" y="3" width="5" height="5" />
              <rect x="3" y="16" width="5" height="5" /><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-white text-base" style={{ fontFamily: 'Georgia, serif' }}>
              Atlas<span style={{ color: '#0D9488' }}>QR</span>
            </div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>YÖNETİM PANELİ</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1.5">
        {navItems.map(item => {
          const active = isActive(item.to);
          const color = COLORS[item.colorKey];
          const badge = (item as any).badge;

          return (
            <Link key={item.to} to={item.to}
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                background: active ? color.bgAktif : color.bgPasif,
                border: active ? `1px solid ${color.bgAktif}` : '1px solid rgba(255,255,255,0.08)',
                borderLeft: active ? `3px solid ${color.bgAktif}` : `3px solid ${color.base}`,
                borderRadius: 10,
                textDecoration: 'none',
                transition: 'all 0.15s'
              }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: active ? 'rgba(255,255,255,0.2)' : color.bgIcon,
                color: active ? 'white' : color.base,
                position: 'relative'
              }}>
                {item.icon}
                {badge > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: -5,
                    right: -5,
                    background: '#DC2626',
                    color: 'white',
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px'
                  }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span style={{
                flex: 1,
                fontSize: 13,
                fontWeight: 500,
                color: 'white'
              }}>
                {item.label}
              </span>
              {badge > 0 && (
                <span style={{
                  background: active ? 'rgba(255,255,255,0.25)' : '#DC2626',
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 999
                }}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)', background: 'transparent' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Çıkış Yap
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex" style={{ background: '#F8FAFC' }} onClick={unlockAudio}>

      <div className="hidden md:flex flex-col" style={{ width: 220, background: '#0F172A', minHeight: '100vh', flexShrink: 0 }}>
        <SidebarContent />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 flex flex-col" style={{ width: 260, background: '#0F172A' }}>
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-4 md:px-8 py-4 border-b flex items-center justify-between" style={{ background: 'white', borderColor: '#E2E8F0' }}>
          <div className="flex items-center gap-3">
            <button className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#F1F5F9' }} onClick={() => setSidebarOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="font-semibold" style={{ color: '#0F172A', fontFamily: 'Georgia, serif', fontSize: 18 }}>{currentLabel}</h1>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <Link to="/admin/orders" style={{ textDecoration: 'none' }}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold animate-pulse" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: '#DC2626' }}></div>
                  {pendingCount} sipariş
                </div>
              </Link>
            )}
            {callCount > 0 && (
              <Link to="/admin/orders" style={{ textDecoration: 'none' }}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold animate-pulse" style={{ background: '#FEF3C7', color: '#B45309' }}>
                  🔔 {callCount} çağrı
                </div>
              </Link>
            )}
            {pendingCount === 0 && callCount === 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: '#CCFBF1', color: '#0F766E' }}>
                <div className="w-2 h-2 rounded-full" style={{ background: '#0D9488' }}></div>
                <span className="hidden sm:inline">Aktif</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}