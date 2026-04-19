// apps/web/src/pages/owner/OwnerLayout.tsx
// Owner (patron) paneli için sade layout
// Admin'den farklı: operasyonel menu yok, sadece rapor sekmeler
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export function OwnerLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: '/owner', label: 'Dashboard', icon: '📊', end: true },
    // Aşama 5'te eklenecekler:
    // { to: '/owner/sales', label: 'Satış', icon: '💰' },
    // { to: '/owner/products', label: 'Ürünler', icon: '📦' },
    // { to: '/owner/cancellations', label: 'İptal & Risk', icon: '⚠️' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div className="bg-white sticky top-0 z-10" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#0F172A' }}>
              <span className="text-lg">👔</span>
            </div>
            <div>
              <h1 className="font-bold text-base" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                Yönetim Paneli
              </h1>
              <p className="text-xs" style={{ color: '#64748B' }}>Raporlar & Analiz</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#FEF2F2', color: '#DC2626' }}
            >
              Çıkış
            </button>
          </div>
        </div>

        {/* Üst Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-6 pb-0">
          <nav className="flex gap-1">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-4 py-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2`
                }
                style={({ isActive }) => ({
                  color: isActive ? '#0D9488' : '#64748B',
                  borderBottomColor: isActive ? '#0D9488' : 'transparent'
                })}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* İçerik */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}