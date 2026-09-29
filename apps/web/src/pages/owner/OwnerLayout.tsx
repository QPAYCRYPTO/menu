// apps/web/src/pages/owner/OwnerLayout.tsx
// Owner (patron) paneli için sade layout
// Admin'den farklı: operasyonel menu yok, sadece rapor sekmeler
// Atölye tasarımı: gece/gündüz temasına uyar, başlıkta güneş/ay düğmesi
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useThemedPage } from '../../lib/theme';
import { LayoutDashboard, LogOut, BriefcaseBusiness } from 'lucide-react';

export function OwnerLayout() {
  const { logout, email, businessName } = useAuth();
  const navigate = useNavigate();
  useThemedPage();

  const navItems = [
    { to: '/owner', label: 'Dashboard', icon: LayoutDashboard, end: true },
    // Aşama 5'te eklenebilecekler:
    // { to: '/owner/sales', label: 'Satış', icon: '💰' },
    // { to: '/owner/products', label: 'Ürünler', icon: '📦' },
    // { to: '/owner/cancellations', label: 'İptal & Risk', icon: '⚠️' },
  ];

  // Avatar için işletme adının ilk harfi
  const avatarLetter = (businessName || 'İ').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-page text-ink">
      {/* Header */}
      <div className="sticky top-0 z-10 px-3 sm:px-6 pt-3 bg-page">
        <div className="ui-card max-w-7xl mx-auto rounded-3xl">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            {/* Sol: İşletme bilgisi */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-brand text-on-brand text-lg font-bold font-serif flex-shrink-0">
                {avatarLetter}
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 className="font-serif font-bold text-xl truncate text-ink">
                  {businessName || 'Yönetim Paneli'}
                </h1>
                <p className="ui-eyebrow truncate"><span className="sm:hidden">Patron</span><span className="hidden sm:inline">Patron · Raporlar & Analiz</span></p>
              </div>
            </div>

            {/* Sağ: Kullanıcı + Çıkış */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {email && (
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-ink flex items-center justify-end gap-1">
                    <BriefcaseBusiness size={12} />Patron
                  </div>
                  <div className="text-xs truncate text-ink-muted" style={{ maxWidth: 220 }} title={email}>
                    {email}
                  </div>
                </div>
              )}
              <ThemeToggle />
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold spring-btn flex items-center gap-2 bg-state-danger-bg text-state-danger"
              >
                <LogOut size={12} />
                Çıkış
              </button>
            </div>
          </div>

          {/* Üst Navigation Tabs */}
          <div className="px-4 sm:px-6 pb-3">
            <nav className="flex gap-1 p-1 rounded-2xl bg-surface-2 border border-line w-fit max-w-full overflow-x-auto scrollbar-none">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 spring-btn whitespace-nowrap ${isActive ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'}`
                  }
                >
                  <item.icon size={14} />
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
