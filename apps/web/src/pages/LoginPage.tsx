// apps/web/src/pages/LoginPage.tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const role = await login(email, password);
      if (role === 'superadmin') {
        navigate('/superadmin');
      } else if (role === 'owner') {
        navigate('/owner');
      } else {
        navigate('/admin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden text-white px-4 py-20">

      {/* Ana sayfaya dön linki */}
      <Link
        to="/"
        className="glass-pill absolute top-6 left-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold z-20 spring-btn"
        style={{ textDecoration: 'none' }}
      >
        <i className="fa-solid fa-arrow-left text-xs" />
        Ana Sayfaya Dön
      </Link>

      <div className="w-full max-w-sm relative z-10 fade-enter">
        {/* Logo */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 text-2xl text-white border border-white/60"
            style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--accent-glow)' }}>
            <i className="fa-solid fa-wheat-awn" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-white tracking-wide">
            Atlas<span style={{ color: 'var(--accent)' }}>QR</span>
          </h1>
          <p className="text-xs mt-1 tracking-widest text-white/60 font-semibold">YÖNETİCİ PANELİ</p>
        </div>

        {/* Kart */}
        <div className="glass-panel rounded-3xl p-7 sm:p-8">
          <h2 className="font-serif text-xl font-bold mb-6 text-white">Giriş Yap</h2>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wider uppercase text-white/75">E-posta</label>
              <div className="relative">
                <i className="fa-solid fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-white/60 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@kafe.com"
                  required
                  className="glass-input w-full pl-9 pr-4 py-2.5 rounded-2xl text-sm font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wider uppercase text-white/75">Şifre</label>
              <div className="relative">
                <i className="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-white/60 pointer-events-none" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="glass-input w-full pl-9 pr-10 py-2.5 rounded-2xl text-sm font-medium"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70">
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm px-3 py-2 rounded-xl font-medium"
                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.4)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-accent w-full py-3 rounded-2xl text-sm font-bold spring-btn"
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <div className="text-center mt-4">
            <Link to="/reset" className="text-xs font-semibold text-amber-300 hover:text-amber-200">Şifremi unuttum</Link>
          </div>
        </div>

        <p className="text-center mt-6 text-xs text-white/60">
          Powered by <span className="font-bold text-amber-300">AtlasQR</span>
        </p>
      </div>
    </div>
  );
}
