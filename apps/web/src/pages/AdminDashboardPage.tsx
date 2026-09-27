// apps/web/src/pages/AdminDashboardPage.tsx
// CHANGELOG v2:
// - Ürünler kartı pembe (#EC4899) → mor (#A855F7)
// - Garsonlar kartı turkuaz (#0D9488) — imza renk

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrders } from '../context/OrderContext';

export function AdminDashboardPage() {
  const { accessToken } = useAuth();
  const { pendingCount, callCount, activeOrders } = useOrders();
  const [stats, setStats] = useState({
    categories: 0,
    products: 0,
    tables: 0,
    waiters: 0,
    businessName: ''
  });

  useEffect(() => {
    async function load() {
      try {
        const [business, categories, products, tables, waiters] = await Promise.all([
          apiRequest<any>('/admin/business', { token: accessToken }),
          apiRequest<any[]>('/admin/categories', { token: accessToken }),
          apiRequest<any[]>('/admin/products?page=1&page_size=100', { token: accessToken }),
          apiRequest<any[]>('/admin/tables', { token: accessToken }).catch(() => []),
          apiRequest<any[]>('/admin/waiters', { token: accessToken }).catch(() => []),
        ]);
        setStats({
          categories: categories.length,
          products: products.length,
          tables: tables.length,
          waiters: waiters.length,
          businessName: business.name
        });
      } catch {}
    }
    load();
  }, [accessToken]);

  const occupiedTables = new Set(
    activeOrders
      .filter(o => o.type === 'order' && o.status !== 'cancelled')
      .map(o => o.table_id)
  ).size;

  const cards = [
    {
      to: '/admin/orders',
      label: 'Siparişler',
      desc: pendingCount > 0 ? `${pendingCount} yeni sipariş` : 'Tüm siparişler',
      color: '#FBBF24', textPasif: '#FCD34D', bgPasif: 'rgba(245,158,11,0.24)',
      borderColor: 'rgba(251,191,36,0.55)',
      badge: pendingCount > 0 ? pendingCount : null,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    },
    {
      to: '/admin/tables',
      label: 'Masalar',
      desc: stats.tables > 0 ? `${occupiedTables} / ${stats.tables} dolu` : 'Masa yönetimi',
      color: '#34D399', textPasif: '#6EE7B7', bgPasif: 'rgba(16,185,129,0.24)',
      borderColor: 'rgba(52,211,153,0.55)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><rect x="16" y="16" width="5" height="5"/><line x1="8" y1="5" x2="16" y2="5"/><line x1="8" y1="19" x2="16" y2="19"/><line x1="5" y1="8" x2="5" y2="16"/><line x1="19" y1="8" x2="19" y2="16"/></svg>
    },
    {
      to: '/admin/categories',
      label: 'Kategoriler',
      desc: stats.categories > 0 ? `${stats.categories} kategori` : 'Henüz yok',
      color: '#7DD3FC', textPasif: '#BAE6FD', bgPasif: 'rgba(14,165,233,0.24)',
      borderColor: 'rgba(125,211,252,0.55)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
    },
    {
      to: '/admin/products',
      label: 'Ürünler',
      desc: stats.products > 0 ? `${stats.products} ürün` : 'Henüz yok',
      // PEMBE → MOR
      color: '#D8B4FE', textPasif: '#E9D5FF', bgPasif: 'rgba(168,85,247,0.26)',
      borderColor: 'rgba(216,180,254,0.55)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    },
    {
      to: '/admin/waiters',
      label: 'Garsonlar',
      desc: stats.waiters > 0 ? `${stats.waiters} garson` : 'Henüz yok',
      // İmza turuncu (glass tema vurgusu)
      color: '#FF9A5A', textPasif: '#FDBA74', bgPasif: 'rgba(255,122,41,0.26)',
      borderColor: 'rgba(255,154,90,0.6)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    },
    {
      to: '/admin/settings',
      label: 'Ayarlar',
      desc: 'İşletme bilgileri',
      color: '#E2E8F0', textPasif: 'rgba(255,255,255,0.72)', bgPasif: 'rgba(255,255,255,0.16)',
      borderColor: 'rgba(255,255,255,0.45)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    },
    {
      to: '/admin/qr',
      label: 'QR Kod',
      desc: 'Yazdır / İndir',
      color: '#A5B4FC', textPasif: '#C7D2FE', bgPasif: 'rgba(99,102,241,0.28)',
      borderColor: 'rgba(165,180,252,0.55)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/></svg>
    },
  ];

  return (
    <div className="max-w-4xl">
      {/* Hoşgeldin */}
      <div className="glass-panel rounded-3xl p-5 md:p-6 mb-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="btn-accent w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white/70">Hoş geldiniz</p>
            <h2 className="font-serif font-bold text-xl leading-tight tracking-wide truncate">{stats.businessName || 'Yükleniyor...'}</h2>
          </div>

          {(pendingCount > 0 || callCount > 0) && (
            <div className="flex flex-col items-end gap-1">
              {pendingCount > 0 && (
                <div className="px-2.5 py-1 rounded-full text-xs font-bold animate-pulse whitespace-nowrap"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.45)' }}>
                  {pendingCount} yeni sipariş
                </div>
              )}
              {callCount > 0 && (
                <div className="px-2.5 py-1 rounded-full text-xs font-bold animate-pulse whitespace-nowrap"
                  style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.45)' }}>
                  🔔 {callCount} çağrı
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-xs leading-relaxed text-white/70">
          Aşağıdaki kısayollardan hızlıca işlerinize başlayabilirsiniz.
        </p>
      </div>

      {/* 8 Kart Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 12
      }}>
        {cards.map(card => (
          <Link key={card.to} to={card.to}
            style={{
              textDecoration: 'none',
              borderLeft: `3px solid ${card.borderColor}`,
              borderRadius: 24,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              position: 'relative',
              color: 'var(--text)'
            }}
            className="glass-card glass-card-hover">

            <div className="flex items-center justify-between">
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: card.bgPasif,
                border: '1px solid rgba(255,255,255,0.25)',
                color: card.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {card.icon}
              </div>
              {card.badge && (
                <span style={{
                  background: 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.6)',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 999,
                  animation: 'pulse 2s infinite'
                }}>
                  {card.badge}
                </span>
              )}
            </div>

            <div>
              <div className="font-serif" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 12, color: card.textPasif, fontWeight: 600 }}>
                {card.desc}
              </div>
            </div>

            <div style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              fontWeight: 600,
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              Git
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}