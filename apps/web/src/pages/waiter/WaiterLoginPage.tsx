// apps/web/src/pages/waiter/WaiterLoginPage.tsx
// CHANGELOG v2 — KRİTİK GÜVENLİK FİX:
// - URL'de token varsa "isAuthenticated kontrolü" KALDIRILDI
// - URL token her zaman önceliklidir, eski oturum üzerine yazılır
// - Cross-tenant izolasyon bug'ı çözüldü

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

  // Email form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // URL'den gelen token ile otomatik giriş
  useEffect(() => {
    if (!urlToken || isChecking) return;
    // KALDIRILDI: if (isAuthenticated) return;
    // Sebep: URL'de yeni token varsa, eski oturum üzerine yazmalıyız.
    // Aksi halde A işletmesinin garsonu, B işletmesinin garson linkini açtığında
    // hâlâ A'nın oturumunda kalır → cross-tenant data leak.

    (async () => {
      setLoading(true);
      setError(null);
      // loginWithToken artık eski oturumu temizleyip yeni token ile giriş yapar
      const result = await loginWithToken(urlToken);
      if (result.ok) {
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8FAFC' }}>
        <div className="text-sm" style={{ color: '#64748B' }}>Yükleniyor...</div>
      </div>
    );
  }

  // Zaten giriş yapmış VE URL'de token YOKSA (yani "/garson-login" gibi geldiyse)
  // → /garson'a yönlendir. URL'de token VARSA → useEffect onu işliyor, bekle.
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#0D9488' }}>
              <span className="text-2xl">👨‍🍳</span>
            </div>
          </div>
          <h1 className="font-bold text-2xl" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
            Garson Girişi
          </h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>AtlasQR Garson Paneli</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: '1px solid #E2E8F0' }}>

          {loading && mode === 'auto' && (
            <div className="text-center py-8">
              <div className="inline-block w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mb-3"
                style={{ borderColor: '#0D9488', borderTopColor: 'transparent' }} />
              <p className="text-sm" style={{ color: '#64748B' }}>Giriş yapılıyor...</p>
            </div>
          )}

          {!loading && error && mode === 'auto' && (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#DC2626' }}>
                Giriş yapılamadı
              </p>
              <p className="text-xs mb-4" style={{ color: '#64748B' }}>{error}</p>
              <button onClick={() => { setMode('email'); setError(null); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#0D9488' }}>
                Email ile Giriş Yap
              </button>
            </div>
          )}

          {mode === 'email' && (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-xl text-xs"
                  style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                  ⚠️ {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>
                    Email
                  </label>
                  <input type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ornek@kafe.com"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC' }} />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>
                    Şifre
                  </label>
                  <input type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 karakter"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleEmailLogin(); }} />
                </div>

                <button onClick={handleEmailLogin} disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                  style={{ background: loading ? '#475569' : '#0D9488' }}>
                  {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                </button>
              </div>

              <div className="mt-6 pt-6 text-center" style={{ borderTop: '1px solid #F1F5F9' }}>
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  QR kodunuz varsa yöneticinizden gelen linki kullanın
                </p>
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-6">
          <Link to="/" className="text-xs" style={{ color: '#64748B' }}>
            ← Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  );
}