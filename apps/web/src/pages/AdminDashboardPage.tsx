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
      color: '#F59E0B', textPasif: '#854F0B', bgPasif: 'rgba(245,158,11,0.10)',
      borderColor: 'rgba(245,158,11,0.35)',
      badge: pendingCount > 0 ? pendingCount : null,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    },
    {
      to: '/admin/tables',
      label: 'Masalar',
      desc: stats.tables > 0 ? `${occupiedTables} / ${stats.tables} dolu` : 'Masa yönetimi',
      color: '#10B981', textPasif: '#047857', bgPasif: 'rgba(16,185,129,0.10)',
      borderColor: 'rgba(16,185,129,0.35)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><rect x="16" y="16" width="5" height="5"/><line x1="8" y1="5" x2="16" y2="5"/><line x1="8" y1="19" x2="16" y2="19"/><line x1="5" y1="8" x2="5" y2="16"/><line x1="19" y1="8" x2="19" y2="16"/></svg>
    },
    {
      to: '/admin/categories',
      label: 'Kategoriler',
      desc: stats.categories > 0 ? `${stats.categories} kategori` : 'Henüz yok',
      color: '#3B82F6', textPasif: '#1E40AF', bgPasif: 'rgba(59,130,246,0.10)',
      borderColor: 'rgba(59,130,246,0.35)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
    },
    {
      to: '/admin/products',
      label: 'Ürünler',
      desc: stats.products > 0 ? `${stats.products} ürün` : 'Henüz yok',
      // PEMBE → MOR
      color: '#A855F7', textPasif: '#6D28D9', bgPasif: 'rgba(168,85,247,0.10)',
      borderColor: 'rgba(168,85,247,0.35)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    },
    {
      to: '/admin/waiters',
      label: 'Garsonlar',
      desc: stats.waiters > 0 ? `${stats.waiters} garson` : 'Henüz yok',
      // İmza turkuaz
      color: '#0D9488', textPasif: '#0F766E', bgPasif: 'rgba(13,148,136,0.10)',
      borderColor: 'rgba(13,148,136,0.35)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    },
    {
      to: '/admin/settings',
      label: 'Ayarlar',
      desc: 'İşletme bilgileri',
      color: '#94A3B8', textPasif: '#475569', bgPasif: 'rgba(148,163,184,0.10)',
      borderColor: 'rgba(148,163,184,0.35)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    },
    {
      to: '/admin/qr',
      label: 'QR Kod',
      desc: 'Yazdır / İndir',
      color: '#6366F1', textPasif: '#3730A3', bgPasif: 'rgba(99,102,241,0.10)',
      borderColor: 'rgba(99,102,241,0.35)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/></svg>
    },
  ];

  return (
    <div className="max-w-4xl">
      {/* Hoşgeldin */}
      <div className="rounded-2xl p-6 mb-6 text-white" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#0D9488' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Hoş geldiniz</p>
            <h2 className="font-bold text-base" style={{ fontFamily: 'Georgia, serif' }}>{stats.businessName || 'Yükleniyor...'}</h2>
          </div>

          {(pendingCount > 0 || callCount > 0) && (
            <div className="flex flex-col items-end gap-1">
              {pendingCount > 0 && (
                <div className="px-2 py-1 rounded-full text-xs font-semibold animate-pulse"
                  style={{ background: '#DC2626', color: 'white' }}>
                  {pendingCount} yeni sipariş
                </div>
              )}
              {callCount > 0 && (
                <div className="px-2 py-1 rounded-full text-xs font-semibold animate-pulse"
                  style={{ background: '#F59E0B', color: 'white' }}>
                  🔔 {callCount} çağrı
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
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
              background: 'white',
              border: `1px solid ${card.borderColor}`,
              borderLeft: `4px solid ${card.color}`,
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              transition: 'all 0.2s',
              position: 'relative'
            }}
            className="hover:shadow-md hover:-translate-y-0.5">

            <div className="flex items-center justify-between">
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: card.bgPasif,
                color: card.textPasif,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {card.icon}
              </div>
              {card.badge && (
                <span style={{
                  background: '#DC2626',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  animation: 'pulse 2s infinite'
                }}>
                  {card.badge}
                </span>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0F172A', marginBottom: 2 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 12, color: card.textPasif, fontWeight: 500 }}>
                {card.desc}
              </div>
            </div>

            <div style={{
              fontSize: 11,
              color: '#94A3B8',
              fontWeight: 500,
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