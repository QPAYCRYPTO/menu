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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'}}>
      
      {/* Dekoratif daireler */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{background: '#0D9488', transform: 'translate(30%, -30%)'}}></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10" style={{background: '#F59E0B', transform: 'translate(-30%, 30%)'}}></div>
      <div className="absolute top-1/2 left-0 w-32 h-32 rounded-full opacity-5" style={{background: '#0D9488'}}></div>

      <div className="w-full max-w-sm mx-4 relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{background: '#0D9488'}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/>
              <rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white" style={{fontFamily: 'Georgia, serif'}}>
            Atlas<span style={{color: '#0D9488'}}>QR</span>
          </h1>
          <p className="text-xs mt-1 tracking-widest" style={{color: 'rgba(255,255,255,0.4)'}}>YÖNETİCİ PANELİ</p>
        </div>

        {/* Kart */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold mb-6" style={{color: '#0F172A'}}>Giriş Yap</h2>
          
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wider uppercase" style={{color: '#64748B'}}>E-posta</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@kafe.com"
                  required
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none transition-all"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wider uppercase" style={{color: '#64748B'}}>Şifre</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm outline-none transition-all"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm px-3 py-2 rounded-lg" style={{background: '#FEF2F2', color: '#DC2626'}}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all"
              style={{background: loading ? '#94A3B8' : '#0F172A'}}
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <div className="text-center mt-4">
            <Link to="/reset" className="text-xs" style={{color: '#0D9488'}}>Şifremi unuttum</Link>
          </div>
        </div>

        <p className="text-center mt-6 text-xs" style={{color: 'rgba(255,255,255,0.3)'}}>
          Powered by <span style={{color: '#F59E0B'}}>AtlasQR</span>
        </p>
      </div>
    </div>
  );
}