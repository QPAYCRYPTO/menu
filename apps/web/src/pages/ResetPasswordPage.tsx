// apps/web/src/pages/ResetPasswordPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { TriangleAlert, Lock, Eye, EyeOff, CircleCheck, ArrowLeft, LoaderCircle } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useThemedPage } from '../lib/theme';

export function ResetPasswordPage() {
  useThemedPage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [loading, setLoading] = useState(false);
  // Link açılınca geçerliliği sorulur: kullanılmış / süresi dolmuş linkte form hiç gösterilmez
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>(token ? 'checking' : 'invalid');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiRequest<{ valid: boolean }>('/auth/reset-token/validate', { method: 'POST', body: { token }, retryOn401: false })
      .then(r => { if (!cancelled) setLinkState(r.valid ? 'valid' : 'invalid'); })
      // Doğrulama isteği başarısızsa (ağ vb.) formu göster; gönderimde sunucu yine kontrol eder
      .catch(() => { if (!cancelled) setLinkState('valid'); });
    return () => { cancelled = true; };
  }, [token]);

  const passwordsMatch = password.length > 0 && password2.length > 0 && password === password2;
  const passwordsMismatch = password.length > 0 && password2.length > 0 && password !== password2;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password.length < 8) { setError('Şifre en az 8 karakter olmalıdır.'); return; }
    if (password !== password2) { setError('Şifreler eşleşmiyor.'); return; }
    try {
      setLoading(true);
      await apiRequest('/auth/reset-password', { method: 'POST', body: { token, new_password: password }, retryOn401: false });
      setMessage('Şifreniz başarıyla güncellendi! Giriş sayfasına yönlendiriliyorsunuz...');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bir hata oluştu.';
      // Bu arada link kullanılmış / süresi dolmuşsa geçersiz link ekranına geç
      if (/geçersiz veya süresi dolmuş/i.test(msg)) {
        setLinkState('invalid');
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (linkState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center relative bg-page text-ink px-4">

        {/* Gece/gündüz */}
        <ThemeToggle className="absolute top-6 right-6 z-20" />
        <div className="ui-card rounded-3xl px-7 py-6 flex items-center gap-3 text-sm font-semibold text-ink-muted fade-enter">
          <LoaderCircle size={18} className="animate-spin" /> Bağlantı kontrol ediliyor…
        </div>
      </div>
    );
  }

  if (linkState === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-page text-ink px-4 py-12">

        {/* Gece/gündüz */}
        <ThemeToggle className="absolute top-6 right-6 z-20" />
        <div className="w-full max-w-sm relative z-10 fade-enter">
          <div className="ui-card rounded-3xl p-7 sm:p-8 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--state-danger-bg)' }}>
              <TriangleAlert size={30} style={{ color: 'var(--state-danger)' }} />
            </div>
            <h1 className="font-serif font-bold text-xl mb-2 text-ink">Geçersiz Link</h1>
            <p className="text-sm mb-6 text-ink-muted">
              Bu şifre sıfırlama linki daha önce kullanılmış ya da süresi dolmuş. Her link yalnızca bir kez ve 30 dakika içinde kullanılabilir.
            </p>
            <button onClick={() => navigate('/login', { replace: true })} className="btn-primary w-full py-2.5 rounded-2xl text-sm font-bold spring-btn">
              Giriş Sayfasına Dön
            </button>
            <button onClick={() => navigate('/reset', { replace: true })}
              className="w-full mt-3 text-xs font-semibold text-ink-muted hover:text-ink" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              Yeni sıfırlama linki iste
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-page text-ink px-4 py-12">

      {/* Gece/gündüz */}
      <ThemeToggle className="absolute top-6 right-6 z-20" />
      <div className="w-full max-w-sm relative z-10 fade-enter">
        {/* Logo */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 text-2xl bg-brand text-on-brand">
            <Lock size={24} />
          </div>
          <h1 className="font-serif text-3xl font-bold text-ink tracking-wide">
            Atlas<span style={{ color: 'var(--accent)' }}>QR</span>
          </h1>
          <p className="text-xs mt-1 tracking-widest text-ink-muted font-semibold">YENİ ŞİFRE BELİRLE</p>
        </div>

        <div className="ui-card rounded-3xl p-7 sm:p-8">
          {message && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium mb-4"
              style={{ background: 'var(--state-ok-bg)', color: 'var(--state-ok)' }}>
              {message}
            </div>
          )}
          {error && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium mb-4"
              style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Yeni Şifre</label>
              <div style={{position: 'relative'}}>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="En az 8 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="ui-input focus:border-brand w-full px-4 py-2.5 rounded-2xl text-sm font-medium"
                  style={{ paddingRight: 44, boxSizing: 'border-box' }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'} className="flex items-center text-ink-muted hover:text-ink"
                  style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18}}>
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: 'var(--state-danger)' }}><TriangleAlert size={12} />En az 8 karakter olmalıdır</p>
              )}
              {password.length >= 8 && (
                <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: 'var(--state-ok)' }}><CircleCheck size={12} />Şifre uzunluğu yeterli</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Şifre Tekrar</label>
              <div style={{position: 'relative'}}>
                <input
                  type={showPass2 ? 'text' : 'password'}
                  placeholder="Şifreyi tekrar girin"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  className="ui-input focus:border-brand w-full px-4 py-2.5 rounded-2xl text-sm font-medium"
                  style={{
                    ...(passwordsMismatch ? { borderColor: 'var(--state-danger)' } : passwordsMatch ? { borderColor: 'var(--state-ok)' } : {}),
                    paddingRight: 44, boxSizing: 'border-box'
                  }}
                />
                <button type="button" onClick={() => setShowPass2(!showPass2)} aria-label={showPass2 ? 'Şifreyi gizle' : 'Şifreyi göster'} className="flex items-center text-ink-muted hover:text-ink"
                  style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18}}>
                  {showPass2 ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {passwordsMatch && <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: 'var(--state-ok)' }}><CircleCheck size={12} />Şifreler eşleşiyor</p>}
              {passwordsMismatch && <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: 'var(--state-danger)' }}><TriangleAlert size={12} />Şifreler eşleşmiyor</p>}
            </div>

            <button type="submit" disabled={loading || !passwordsMatch}
              className="btn-primary w-full py-3 rounded-2xl text-sm font-bold mt-2 spring-btn">
              {loading ? 'Güncelleniyor...' : 'Şifremi Güncelle'}
            </button>
          </form>

          <div className="text-center mt-4">
            <button onClick={() => navigate('/login')} className="text-xs font-semibold text-ink-muted hover:text-ink inline-flex items-center gap-1" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <ArrowLeft size={12} />Giriş sayfasına dön
            </button>
          </div>
        </div>

        <p className="text-center mt-6 text-xs text-ink-muted">
          Powered by <span className="font-bold text-accent">AtlasQR</span>
        </p>
      </div>
    </div>
  );
}
