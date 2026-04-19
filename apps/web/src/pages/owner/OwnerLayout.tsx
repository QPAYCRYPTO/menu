// apps/web/src/pages/owner/OwnerLayout.tsx
// Owner (patron) paneli için sade layout
// Admin'den farklı: operasyonel menu yok, sadece rapor sekmeler
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export function OwnerLayout() {
  const { logout, email, businessName } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: '/owner', label: 'Dashboard', icon: '📊', end: true },
    // Aşama 5'te eklenebilecekler:
    // { to: '/owner/sales', label: 'Satış', icon: '💰' },
    // { to: '/owner/products', label: 'Ürünler', icon: '📦' },
    // { to: '/owner/cancellations', label: 'İptal & Risk', icon: '⚠️' },
  ];

  // Avatar için işletme adının ilk harfi
  const avatarLetter = (businessName || 'İ').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      {/* Header */}
      <div className="bg-white sticky top-0 z-10" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          {/* Sol: İşletme bilgisi */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0" style={{ background: '#0D9488', fontFamily: 'Georgia, serif' }}>
              {avatarLetter}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 className="font-bold text-base truncate" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                {businessName || 'Yönetim Paneli'}
              </h1>
              <p className="text-xs" style={{ color: '#64748B' }}>Raporlar & Analiz</p>
            </div>
          </div>

          {/* Sağ: Kullanıcı + Çıkış */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {email && (
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold" style={{ color: '#0F172A' }}>
                  👔 Patron
                </div>
                <div className="text-xs truncate" style={{ color: '#64748B', maxWidth: 220 }} title={email}>
                  {email}
                </div>
              </div>
            )}
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
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
                className="px-4 py-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2"
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