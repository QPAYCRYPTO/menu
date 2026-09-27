// apps/web/src/pages/ResetPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';

export function ResetPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest('/auth/request-reset', { method: 'POST', body: { email }, retryOn401: false });
      setSent(true);
    } catch {}
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden text-white px-4 py-12">
      <div className="w-full max-w-sm relative z-10 fade-enter">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 text-2xl text-white border border-white/60"
            style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--accent-glow)' }}>
            <i className="fa-solid fa-lock" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-white tracking-wide">
            Atlas<span style={{ color: 'var(--accent)' }}>QR</span>
          </h1>
          <p className="text-xs mt-1 tracking-widest text-white/60 font-semibold">ŞİFRE SIFIRLAMA</p>
        </div>

        <div className="glass-panel rounded-3xl p-7 sm:p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
                style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid rgba(52,211,153,0.4)' }}>
                <i className="fa-solid fa-check" />
              </div>
              <h2 className="font-serif font-bold text-lg mb-2 text-white">Mail Gönderildi!</h2>
              <p className="text-sm mb-6 text-white/75">
                <strong className="text-white">{email}</strong> adresine şifre sıfırlama bağlantısı gönderildi. Lütfen mailinizi kontrol edin.
              </p>
              <Link to="/login" className="text-sm font-semibold text-amber-300 hover:text-amber-200">
                ← Giriş sayfasına dön
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-serif font-bold text-lg mb-2 text-white">Şifrenizi mi unuttunuz?</h2>
              <p className="text-sm mb-6 text-white/70">E-posta adresinizi girin, size sıfırlama bağlantısı gönderelim.</p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 tracking-wider uppercase text-white/75">E-posta</label>
                  <div className="relative">
                    <i className="fa-solid fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-white/60 pointer-events-none" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="admin@kafe.com" required
                      className="glass-input w-full pl-9 pr-4 py-2.5 rounded-2xl text-sm font-medium" />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="btn-accent w-full py-3 rounded-2xl text-sm font-bold spring-btn">
                  {loading ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
                </button>
              </form>

              <div className="text-center mt-4">
                <Link to="/login" className="text-xs font-semibold text-amber-300 hover:text-amber-200">← Giriş sayfasına dön</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
