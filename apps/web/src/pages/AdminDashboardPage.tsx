// apps/web/src/pages/AdminDashboardPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function AdminDashboardPage() {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState({ categories: 0, products: 0, businessName: '' });

  useEffect(() => {
    async function load() {
      try {
        const [business, categories, products] = await Promise.all([
          apiRequest<any>('/admin/business', { token: accessToken }),
          apiRequest<any[]>('/admin/categories', { token: accessToken }),
          apiRequest<any[]>('/admin/products?page=1&page_size=100', { token: accessToken }),
        ]);
        setStats({ categories: categories.length, products: products.length, businessName: business.name });
      } catch {}
    }
    load();
  }, [accessToken]);

  const cards = [
    { to: '/admin/categories', label: 'Kategoriler', count: stats.categories, color: '#0D9488', bg: '#CCFBF1', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
    { to: '/admin/products', label: 'Ürünler', count: stats.products, color: '#B8860B', bg: '#FEF3C7', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> },
    { to: '/admin/settings', label: 'Ayarlar', count: null, color: '#0F172A', bg: '#F1F5F9', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
    { to: '/admin/qr', label: 'QR Kod', count: null, color: '#7C3AED', bg: '#EDE9FE', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/></svg> },
  ];

  return (
    <div className="max-w-2xl">
      {/* Hoşgeldin */}
      <div className="rounded-2xl p-6 mb-6 text-white" style={{background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'}}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background: '#0D9488'}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <p className="text-xs" style={{color: 'rgba(255,255,255,0.5)'}}>Hoş geldiniz</p>
            <h2 className="font-bold text-base" style={{fontFamily: 'Georgia, serif'}}>{stats.businessName || 'Yükleniyor...'}</h2>
          </div>
        </div>
        <p className="text-xs leading-relaxed" style={{color: 'rgba(255,255,255,0.5)'}}>
          Sol menüden kategorilerinizi, ürünlerinizi ve ayarlarınızı yönetebilirsiniz.
        </p>
      </div>

      {/* Hızlı Erişim */}
      <div className="grid grid-cols-2 gap-4">
        {cards.map(card => (
          <Link key={card.to} to={card.to}
            className="bg-white rounded-2xl p-5 shadow-sm transition-all hover:shadow-md"
            style={{border: '1px solid #E2E8F0', textDecoration: 'none'}}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background: card.bg, color: card.color}}>
                {card.icon}
              </div>
              {card.count !== null && (
                <span className="font-bold text-2xl" style={{color: card.color, fontFamily: 'Georgia, serif'}}>{card.count}</span>
              )}
            </div>
            <div className="font-semibold text-sm" style={{color: '#0F172A'}}>{card.label}</div>
            <div className="text-xs mt-0.5" style={{color: '#94A3B8'}}>Yönet →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}