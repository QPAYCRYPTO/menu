// apps/web/src/pages/ResetPasswordPage.tsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';

export function ResetPasswordPage() {
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
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{background: '#0D9488', transform: 'translate(30%, -30%)'}}></div>
        <div className="w-full max-w-sm mx-4 relative z-10">
          <div className="bg-white rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{background: '#FEF2F2'}}>
              <span className="text-3xl">⚠️</span>
            </div>
            <h1 className="font-bold text-xl mb-2" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Geçersiz Link</h1>
            <p className="text-sm mb-6" style={{color: '#64748B'}}>Şifre sıfırlama linki geçersiz veya süresi dolmuş.</p>
            <button onClick={() => navigate('/login')} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{background: '#0F172A'}}>
              Giriş Sayfasına Dön
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'}}>
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{background: '#0D9488', transform: 'translate(30%, -30%)'}}></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10" style={{background: '#F59E0B', transform: 'translate(-30%, 30%)'}}></div>

      <div className="w-full max-w-sm mx-4 relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{background: '#0D9488'}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white" style={{fontFamily: 'Georgia, serif'}}>
            Atlas<span style={{color: '#0D9488'}}>QR</span>
          </h1>
          <p className="text-xs mt-1 tracking-widest" style={{color: 'rgba(255,255,255,0.4)'}}>YENİ ŞİFRE BELİRLE</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {message && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium mb-4" style={{background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0'}}>
              {message}
            </div>
          )}
          {error && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium mb-4" style={{background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA'}}>
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Yeni Şifre</label>
              <div style={{position: 'relative'}}>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="En az 8 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', paddingRight: 44, boxSizing: 'border-box'}}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18}}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-xs mt-1" style={{color: '#DC2626'}}>⚠️ En az 8 karakter olmalıdır</p>
              )}
              {password.length >= 8 && (
                <p className="text-xs mt-1" style={{color: '#16A34A'}}>✅ Şifre uzunluğu yeterli</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Şifre Tekrar</label>
              <div style={{position: 'relative'}}>
                <input
                  type={showPass2 ? 'text' : 'password'}
                  placeholder="Şifreyi tekrar girin"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={{
                    border: `1.5px solid ${passwordsMismatch ? '#DC2626' : passwordsMatch ? '#0D9488' : '#E2E8F0'}`,
                    background: '#F8FAFC', color: '#0F172A', paddingRight: 44, boxSizing: 'border-box'
                  }}
                />
                <button type="button" onClick={() => setShowPass2(!showPass2)}
                  style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18}}>
                  {showPass2 ? '🙈' : '👁️'}
                </button>
              </div>
              {passwordsMatch && <p className="text-xs mt-1" style={{color: '#16A34A'}}>✅ Şifreler eşleşiyor</p>}
              {passwordsMismatch && <p className="text-xs mt-1" style={{color: '#DC2626'}}>⚠️ Şifreler eşleşmiyor</p>}
            </div>

            <button type="submit" disabled={loading || !passwordsMatch}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white mt-2"
              style={{background: loading || !passwordsMatch ? '#94A3B8' : '#0F172A', cursor: loading || !passwordsMatch ? 'not-allowed' : 'pointer'}}>
              {loading ? 'Güncelleniyor...' : 'Şifremi Güncelle'}
            </button>
          </form>

          <div className="text-center mt-4">
            <button onClick={() => navigate('/login')} className="text-xs font-semibold" style={{color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer'}}>
              ← Giriş sayfasına dön
            </button>
          </div>
        </div>

        <p className="text-center mt-6 text-xs" style={{color: 'rgba(255,255,255,0.3)'}}>
          Powered by <span style={{color: '#F59E0B'}}>AtlasQR</span>
        </p>
      </div>
    </div>
  );
}