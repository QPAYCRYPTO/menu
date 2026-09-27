// apps/web/src/components/PublicHeader.tsx
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';

type NavLink = {
  to: string;
  label: string;
  isAnchor: boolean;
};

export function PublicHeader() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(path: string): boolean {
    return location.pathname === path;
  }

  const navLinks: NavLink[] = [
    { to: '/fiyat#fiyat', label: 'Fiyatlandırma', isAnchor: false },
    { to: '/#ozellikler', label: 'Özellikler', isAnchor: true },
    { to: '/#destek', label: 'Destek', isAnchor: true },
  ];

  return (
    <header className="sticky top-0 z-50 px-3 md:px-6 pt-3">
      <div className="glass-panel max-w-7xl mx-auto rounded-3xl">
        <div className="px-4 md:px-5 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white text-lg"
              style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--accent-glow)', border: '1px solid rgba(255,255,255,0.6)' }}
            >
              <i className="fa-solid fa-wheat-awn" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-serif font-bold text-white text-lg tracking-wide">
                Atlas<span style={{ color: 'var(--accent)' }}>QR</span>
              </span>
              <span
                className="hidden sm:block"
                style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-faint)', textTransform: 'uppercase' }}
              >
                Restoran Yönetim Sistemi
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link =>
              link.isAnchor ? (
                <a
                  key={link.to}
                  href={link.to}
                  className="px-4 py-2 rounded-2xl text-sm font-medium transition-colors"
                  style={{
                    color: 'white',
                    textDecoration: 'none',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.to}
                  to={link.to}
                  className="px-4 py-2 rounded-2xl text-sm font-medium transition-colors"
                  style={{
                    color: isActive(link.to) ? 'var(--accent)' : 'white',
                    textDecoration: 'none',
                    background: isActive(link.to) ? 'var(--accent-soft)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isActive(link.to)) e.currentTarget.style.background = 'rgba(255,255,255,0.14)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive(link.to)) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {link.label}
                </Link>
              )
            )}
            <Link
              to="/login"
              className="btn-accent spring-btn ml-3 px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"
              style={{ textDecoration: 'none' }}
            >
              <i className="fa-solid fa-right-to-bracket" />
              Kullanıcı Girişi
            </Link>
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="glass-pill spring-btn md:hidden w-10 h-10 rounded-2xl flex items-center justify-center"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            <i className={`fa-solid ${mobileOpen ? 'fa-xmark' : 'fa-bars'}`} />
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t fade-enter" style={{ borderColor: 'var(--glass-border-soft)' }}>
            <nav className="px-3 py-3 space-y-1">
              {navLinks.map(link =>
                link.isAnchor ? (
                  <a
                    key={link.to}
                    href={link.to}
                    onClick={() => setMobileOpen(false)}
                    className="block px-4 py-3 rounded-2xl text-sm font-medium"
                    style={{
                      color: 'white',
                      background: 'transparent',
                      textDecoration: 'none',
                    }}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className="block px-4 py-3 rounded-2xl text-sm font-medium"
                    style={{
                      color: isActive(link.to) ? 'var(--accent)' : 'white',
                      background: isActive(link.to) ? 'var(--accent-soft)' : 'transparent',
                      textDecoration: 'none',
                    }}
                  >
                    {link.label}
                  </Link>
                )
              )}
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="btn-accent block px-4 py-3 rounded-full text-sm font-bold mt-2"
                style={{ textAlign: 'center', textDecoration: 'none' }}
              >
                Kullanıcı Girişi →
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
