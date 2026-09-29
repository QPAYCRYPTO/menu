// apps/web/src/components/PublicHeader.tsx
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Wheat, LogIn, Menu, X, ArrowRight } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

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
      <div className="ui-card max-w-7xl mx-auto rounded-3xl">
        <div className="px-4 md:px-5 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-brand text-on-brand text-lg"
            >
              <Wheat size={18} aria-hidden="true" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-serif font-bold text-ink text-lg tracking-wide">
                Atlas<span style={{ color: 'var(--accent)' }}>QR</span>
              </span>
              <span
                className="hidden sm:block"
                style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--ink-muted)', textTransform: 'uppercase' }}
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
                  className="px-4 py-2 rounded-2xl text-sm font-medium transition-colors text-ink hover:bg-surface-2"
                  style={{ textDecoration: 'none' }}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${isActive(link.to) ? 'bg-surface-2 text-ink font-bold' : 'text-ink hover:bg-surface-2'}`}
                  style={{ textDecoration: 'none' }}
                >
                  {link.label}
                </Link>
              )
            )}
            <ThemeToggle className="ml-2" />
            <Link
              to="/login"
              className="btn-primary spring-btn ml-2 px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"
              style={{ textDecoration: 'none' }}
            >
              <LogIn size={16} aria-hidden="true" />
              Kullanıcı Girişi
            </Link>
          </nav>

          {/* Mobil: tema + menü */}
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <button
              className="ui-chip spring-btn w-10 h-10 rounded-2xl flex items-center justify-center"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
            >
              {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t fade-enter" style={{ borderColor: 'var(--line)' }}>
            <nav className="px-3 py-3 space-y-1">
              {navLinks.map(link =>
                link.isAnchor ? (
                  <a
                    key={link.to}
                    href={link.to}
                    onClick={() => setMobileOpen(false)}
                    className="block px-4 py-3 rounded-2xl text-sm font-medium text-ink hover:bg-surface-2"
                    style={{ textDecoration: 'none' }}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-4 py-3 rounded-2xl text-sm font-medium ${isActive(link.to) ? 'bg-surface-2 text-ink font-bold' : 'text-ink hover:bg-surface-2'}`}
                    style={{ textDecoration: 'none' }}
                  >
                    {link.label}
                  </Link>
                )
              )}
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="btn-primary block px-4 py-3 rounded-full text-sm font-bold mt-2"
                style={{ textAlign: 'center', textDecoration: 'none' }}
              >
                Kullanıcı Girişi <ArrowRight size={14} className="inline-block align-[-2px]" aria-hidden="true" />
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
