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
    <div className="min-h-screen text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 px-3 sm:px-6 pt-3">
        <div className="glass-panel max-w-7xl mx-auto rounded-3xl">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            {/* Sol: İşletme bilgisi */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg font-bold font-serif flex-shrink-0 border border-white/60"
                style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--accent-glow)' }}>
                {avatarLetter}
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 className="font-serif font-bold text-base truncate text-white">
                  {businessName || 'Yönetim Paneli'}
                </h1>
                <p className="text-xs text-white/70">Raporlar & Analiz</p>
              </div>
            </div>

            {/* Sağ: Kullanıcı + Çıkış */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {email && (
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-white">
                    👔 Patron
                  </div>
                  <div className="text-xs truncate text-white/65" style={{ maxWidth: 220 }} title={email}>
                    {email}
                  </div>
                </div>
              )}
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold spring-btn flex items-center gap-2"
                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.4)' }}
              >
                <i className="fa-solid fa-right-from-bracket text-xs" />
                Çıkış
              </button>
            </div>
          </div>

          {/* Üst Navigation Tabs */}
          <div className="px-4 sm:px-6 pb-3">
            <nav className="flex gap-1 p-1 rounded-2xl bg-black/30 border border-white/20 w-fit max-w-full overflow-x-auto scrollbar-none">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 spring-btn whitespace-nowrap ${isActive ? 'btn-accent' : 'text-white/70 hover:text-white'}`
                  }
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* İçerik */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
