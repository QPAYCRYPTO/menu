// apps/web/src/pages/AdminDashboardPage.tsx
// CHANGELOG v2:
// - Ürünler kartı pembe (#EC4899) → mor (#A855F7)
// - Garsonlar kartı turkuaz (#0D9488) — imza renk

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
      color: '#FBBF24', textPasif: '#FCD34D', bgPasif: 'rgba(245,158,11,0.24)',
      borderColor: 'rgba(251,191,36,0.55)',
      badge: pendingCount > 0 ? pendingCount : null,
      icon: <ClipboardList size={18} />
    },
    {
      to: '/admin/tables',
      label: 'Masalar',
      desc: stats.tables > 0 ? `${occupiedTables} / ${stats.tables} dolu` : 'Masa yönetimi',
      color: '#34D399', textPasif: '#6EE7B7', bgPasif: 'rgba(16,185,129,0.24)',
      borderColor: 'rgba(52,211,153,0.55)',
      icon: <Armchair size={18} />
    },
    {
      to: '/admin/categories',
      label: 'Kategoriler',
      desc: stats.categories > 0 ? `${stats.categories} kategori` : 'Henüz yok',
      color: '#7DD3FC', textPasif: '#BAE6FD', bgPasif: 'rgba(14,165,233,0.24)',
      borderColor: 'rgba(125,211,252,0.55)',
      icon: <List size={18} />
    },
    {
      to: '/admin/products',
      label: 'Ürünler',
      desc: stats.products > 0 ? `${stats.products} ürün` : 'Henüz yok',
      // PEMBE → MOR
      color: '#D8B4FE', textPasif: '#E9D5FF', bgPasif: 'rgba(168,85,247,0.26)',
      borderColor: 'rgba(216,180,254,0.55)',
      icon: <ShoppingCart size={18} />
    },
    {
      to: '/admin/waiters',
      label: 'Garsonlar',
      desc: stats.waiters > 0 ? `${stats.waiters} garson` : 'Henüz yok',
      // İmza turuncu (glass tema vurgusu)
      color: '#FF9A5A', textPasif: '#FDBA74', bgPasif: 'rgba(255,122,41,0.26)',
      borderColor: 'rgba(255,154,90,0.6)',
      icon: <Users size={18} />
    },
    {
      to: '/admin/settings',
      label: 'Ayarlar',
      desc: 'İşletme bilgileri',
      color: '#E2E8F0', textPasif: 'rgba(255,255,255,0.72)', bgPasif: 'rgba(255,255,255,0.16)',
      borderColor: 'rgba(255,255,255,0.45)',
      icon: <Settings size={18} />
    },
    {
      to: '/admin/qr',
      label: 'QR Kod',
      desc: 'Yazdır / İndir',
      color: '#A5B4FC', textPasif: '#C7D2FE', bgPasif: 'rgba(99,102,241,0.28)',
      borderColor: 'rgba(165,180,252,0.55)',
      icon: <QrCode size={18} />
    },
  ];

  return (
    <div className="max-w-4xl">
      {/* Hoşgeldin */}
      <div className="glass-panel rounded-3xl p-5 md:p-6 mb-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="btn-accent w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0">
            <User size={20} color="white" strokeWidth={2.5} />
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
                <div className="px-2.5 py-1 rounded-full text-xs font-bold animate-pulse whitespace-nowrap inline-flex items-center gap-1"
                  style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.45)' }}>
                  <Bell size={12} /> {callCount} çağrı
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
              <ArrowRight size={12} strokeWidth={2.5} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}