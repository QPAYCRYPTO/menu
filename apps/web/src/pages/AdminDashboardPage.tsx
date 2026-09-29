// apps/web/src/pages/AdminDashboardPage.tsx
// CHANGELOG v2:
// - Ürünler kartı pembe (#EC4899) → mor (#A855F7)
// - Garsonlar kartı turkuaz (#0D9488) — imza renk
// - Atölye tasarımı: gece/gündüz uyumlu kartlar; her kart tek ton (hue) — ikon kutusu ve sol şerit

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Armchair, ArrowRight, Bell, ClipboardList, List, QrCode, Settings, ShoppingCart, User, Users } from 'lucide-react';
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
      hue: '#b7791f',
      badge: pendingCount > 0 ? pendingCount : null,
      icon: <ClipboardList size={18} />
    },
    {
      to: '/admin/tables',
      label: 'Masalar',
      desc: stats.tables > 0 ? `${occupiedTables} / ${stats.tables} dolu` : 'Masa yönetimi',
      hue: '#2f855a',
      icon: <Armchair size={18} />
    },
    {
      to: '/admin/categories',
      label: 'Kategoriler',
      desc: stats.categories > 0 ? `${stats.categories} kategori` : 'Henüz yok',
      hue: '#2b6cb0',
      icon: <List size={18} />
    },
    {
      to: '/admin/products',
      label: 'Ürünler',
      desc: stats.products > 0 ? `${stats.products} ürün` : 'Henüz yok',
      hue: '#8b5cf6',
      icon: <ShoppingCart size={18} />
    },
    {
      to: '/admin/waiters',
      label: 'Garsonlar',
      desc: stats.waiters > 0 ? `${stats.waiters} garson` : 'Henüz yok',
      hue: '#c05621',
      icon: <Users size={18} />
    },
    {
      to: '/admin/settings',
      label: 'Ayarlar',
      desc: 'İşletme bilgileri',
      hue: '#718096',
      icon: <Settings size={18} />
    },
    {
      to: '/admin/qr',
      label: 'QR Kod',
      desc: 'Yazdır / İndir',
      hue: '#4c51bf',
      icon: <QrCode size={18} />
    },
  ];

  return (
    <div className="max-w-4xl">
      {/* Hoşgeldin */}
      <div className="ui-card rounded-3xl p-5 md:p-6 mb-6 text-ink">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-brand text-on-brand w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0">
            <User size={20} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="ui-eyebrow">Hoş geldiniz</p>
            <h2 className="font-serif font-bold text-2xl leading-tight tracking-wide truncate">{stats.businessName || 'Yükleniyor...'}</h2>
          </div>

          {(pendingCount > 0 || callCount > 0) && (
            <div className="flex flex-col items-end gap-1">
              {pendingCount > 0 && (
                <div className="px-2.5 py-1 rounded-full text-xs font-bold animate-pulse whitespace-nowrap bg-state-danger-bg text-state-danger">
                  {pendingCount} yeni sipariş
                </div>
              )}
              {callCount > 0 && (
                <div className="px-2.5 py-1 rounded-full text-xs font-bold animate-pulse whitespace-nowrap inline-flex items-center gap-1 bg-state-warn-bg text-state-warn">
                  <Bell size={12} /> {callCount} çağrı
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
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
              borderLeft: `3px solid ${card.hue}`,
              borderRadius: 24,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              position: 'relative',
              color: 'var(--ink)'
            }}
            className="ui-card hover:shadow-md transition-shadow">

            <div className="flex items-center justify-between">
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: `color-mix(in srgb, ${card.hue} 14%, transparent)`,
                color: card.hue,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {card.icon}
              </div>
              {card.badge && (
                <span style={{
                  background: 'var(--state-danger)',
                  color: 'var(--bg)',
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
              <div className="font-serif" style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)', marginBottom: 2 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 600 }}>
                {card.desc}
              </div>
            </div>

            <div style={{
              fontSize: 11,
              color: 'var(--ink-muted)',
              fontWeight: 600,
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              Git
              <ArrowRight size={12} strokeWidth={2.5} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}