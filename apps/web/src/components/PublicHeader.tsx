// apps/web/src/components/PublicHeader.tsx
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';

export function PublicHeader() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(path: string): boolean {
    return location.pathname === path;
  }

  const navLinks = [
    { to: '/fiyat', label: 'Fiyatlandırma' },
    { to: '/#ozellikler', label: 'Özellikler' },
    { to: '/#destek', label: 'Destek' },
  ];

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: '#0F172A', borderBottom: '3px solid #0D9488' }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#0D9488' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="3" y="3" width="5" height="5" />
              <rect x="16" y="3" width="5" height="5" />
              <rect x="3" y="16" width="5" height="5" />
              <path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5" />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span
              className="font-bold text-white text-lg"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Atlas<span style={{ color: '#0D9488' }}>QR</span>
            </span>
            <span
              className="hidden sm:block"
              style={{ fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}
            >
              Restoran Yönetim Sistemi
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                color: isActive(link.to) ? '#0D9488' : 'white',
                textDecoration: 'none',
                background: isActive(link.to) ? 'rgba(13, 148, 136, 0.1)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (!isActive(link.to)) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={e => {
                if (!isActive(link.to)) e.currentTarget.style.background = 'transparent';
              }}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/login"
            className="ml-3 px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2"
            style={{ background: '#0D9488', color: 'white', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
            onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
            Kullanıcı Girişi
          </Link>
        </nav>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            {mobileOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <nav className="px-4 py-3 space-y-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 rounded-lg text-sm font-medium"
                style={{
                  color: isActive(link.to) ? '#0D9488' : 'white',
                  background: isActive(link.to) ? 'rgba(13, 148, 136, 0.1)' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-3 rounded-lg text-sm font-semibold mt-2"
              style={{ background: '#0D9488', color: 'white', textAlign: 'center', textDecoration: 'none' }}
            >
              Kullanıcı Girişi →
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}