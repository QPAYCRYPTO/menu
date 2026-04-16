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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'}}>
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{background: '#0D9488', transform: 'translate(30%, -30%)'}}></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10" style={{background: '#F59E0B', transform: 'translate(-30%, 30%)'}}></div>

      <div className="w-full max-w-sm mx-4 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{background: '#0D9488'}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white" style={{fontFamily: 'Georgia, serif'}}>
            Atlas<span style={{color: '#0D9488'}}>QR</span>
          </h1>
          <p className="text-xs mt-1 tracking-widest" style={{color: 'rgba(255,255,255,0.4)'}}>ŞİFRE SIFIRLAMA</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{background: '#F0FDF4'}}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className="font-bold text-base mb-2" style={{color: '#0F172A'}}>Mail Gönderildi!</h2>
              <p className="text-sm mb-6" style={{color: '#64748B'}}>
                <strong>{email}</strong> adresine şifre sıfırlama bağlantısı gönderildi. Lütfen mailinizi kontrol edin.
              </p>
              <Link to="/login" className="text-sm font-semibold" style={{color: '#0D9488'}}>
                ← Giriş sayfasına dön
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-semibold text-base mb-2" style={{color: '#0F172A'}}>Şifrenizi mi unuttunuz?</h2>
              <p className="text-sm mb-6" style={{color: '#94A3B8'}}>E-posta adresinizi girin, size sıfırlama bağlantısı gönderelim.</p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 tracking-wider uppercase" style={{color: '#64748B'}}>E-posta</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="admin@kafe.com" required
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none"
                      style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}} />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-lg text-sm font-semibold text-white"
                  style={{background: loading ? '#94A3B8' : '#0F172A'}}>
                  {loading ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
                </button>
              </form>

              <div className="text-center mt-4">
                <Link to="/login" className="text-xs" style={{color: '#0D9488'}}>← Giriş sayfasına dön</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}