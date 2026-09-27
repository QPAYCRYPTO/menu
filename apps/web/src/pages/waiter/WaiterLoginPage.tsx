// apps/web/src/pages/waiter/WaiterLoginPage.tsx
// CHANGELOG v3 — Tab-bound session:
// - URL'deki swap_token loginWithToken'a verilir → exchange yapılır
// - URL temizleme: history.replaceState ile token URL'den kaldırılır
// - isAuthenticated kontrolü kaldırıldı (URL token öncelikli)

import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { loginByEmail, reasonToMessage } from '../../api/waiterPublicApi';

export function WaiterLoginPage() {
  const { token: urlToken } = useParams<{ token?: string }>();
  const { isAuthenticated, isChecking, loginWithToken } = useWaiterAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'auto' | 'email'>(urlToken ? 'auto' : 'email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // URL'den gelen token ile exchange yap
  useEffect(() => {
    if (!urlToken || isChecking) return;

    (async () => {
      setLoading(true);
      setError(null);

      // loginWithToken artık:
      // 1) Eski sessionStorage'ı temizler
      // 2) Yeni tab_id üretir
      // 3) Backend'e exchange isteği gönderir
      // 4) sessionStorage'a yazar
      const result = await loginWithToken(urlToken);

      if (result.ok) {
        // URL'deki token'ı temizle (geçmiş & paylaşma riski için)
        try {
          window.history.replaceState({}, '', '/garson');
        } catch {
          // replaceState desteklemiyorsa sorun değil
        }
        navigate('/garson', { replace: true });
      } else {
        setError(reasonToMessage(result.error as any) ?? 'Giriş yapılamadı.');
        setMode('email');
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken, isChecking]);

  // Context yüklenene kadar bekle
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-panel rounded-3xl px-8 py-7 text-center fade-enter">
          <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
          <div className="text-sm font-semibold text-white/80">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  // Zaten giriş yapmış VE URL'de token YOKSA → /garson'a yönlendir
  // URL'de token VARSA → useEffect onu işliyor, bekle
  if (isAuthenticated && !urlToken) {
    return <Navigate to="/garson" replace />;
  }

  async function handleEmailLogin() {
    if (!email.trim() || !password) {
      setError('Email ve şifre zorunludur.');
      return;
    }
    setLoading(true);
    setError(null);

    const result = await loginByEmail(email.trim(), password);
    if (result.ok) {
      setLoading(false);
      alert('Email ile giriş şu an geçici. Sayfayı yenilerseniz tekrar girmeniz gerekir. Yöneticinizden QR isteyin.');
      return;
    } else {
      setError(reasonToMessage(result.reason));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-md fade-enter">

        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="btn-accent w-16 h-16 rounded-3xl flex items-center justify-center">
              <span className="text-3xl">👨‍🍳</span>
            </div>
          </div>
          <h1 className="font-serif font-bold text-3xl tracking-wide">
            Garson Girişi
          </h1>
          <p className="text-sm mt-1 text-white/70 font-medium">AtlasQR Garson Paneli</p>
        </div>

        <div className="glass-panel rounded-3xl p-6">

          {loading && mode === 'auto' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
              <p className="text-sm text-white/75">Giriş yapılıyor...</p>
            </div>
          )}

          {!loading && error && mode === 'auto' && (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-sm font-bold mb-2" style={{ color: 'var(--danger)' }}>
                Giriş yapılamadı
              </p>
              <p className="text-xs mb-4 text-white/70">{error}</p>
              <button onClick={() => { setMode('email'); setError(null); }}
                className="btn-accent px-5 py-2.5 rounded-full text-sm font-bold spring-btn">
                Email ile Giriş Yap
              </button>
            </div>
          )}

          {mode === 'email' && (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-2xl text-xs font-semibold"
                  style={{ background: 'var(--danger-bg)', color: '#FECDD3', border: '1px solid rgba(251,113,133,0.45)' }}>
                  ⚠️ {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                    Email
                  </label>
                  <input type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ornek@kafe.com"
                    className="glass-input w-full px-4 py-3 rounded-2xl text-sm font-medium" />
                </div>

                <div>
                  <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                    Şifre
                  </label>
                  <input type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 karakter"
                    className="glass-input w-full px-4 py-3 rounded-2xl text-sm font-medium"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleEmailLogin(); }} />
                </div>

                <button onClick={handleEmailLogin} disabled={loading}
                  className="btn-accent w-full py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 spring-btn">
                  {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                </button>
              </div>

              <div className="mt-6 pt-5 text-center border-t border-white/20">
                <p className="text-xs text-white/60">
                  QR kodunuz varsa yöneticinizden gelen linki kullanın
                </p>
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-6">
          <Link to="/" className="glass-pill inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold spring-btn">
            ← Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  );
}
