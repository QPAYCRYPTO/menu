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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Şifre en az 8 karakter olmalıdır.');
      return;
    }

    if (password !== password2) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: { token, new_password: password },
        retryOn401: false
      });
      setMessage('Şifreniz başarıyla güncellendi! Giriş sayfasına yönlendiriliyorsunuz...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    }
  }

  if (!token) {
    return (
      <main style={{ fontFamily: 'Arial', maxWidth: 360, margin: '48px auto', padding: 20 }}>
        <h1>Geçersiz Link</h1>
        <p>Şifre sıfırlama linki geçersiz veya süresi dolmuş.</p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'Arial', maxWidth: 360, margin: '48px auto', padding: 20 }}>
      <h1>Yeni Şifre Belirle</h1>
      {message && <p style={{ color: 'green' }}>{message}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            type={showPass ? 'text' : 'password'}
            placeholder="Yeni şifre (min 8 karakter)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', boxSizing: 'border-box', paddingRight: 40 }}
          />
          <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer' }}>
            {showPass ? '🙈' : '👁️'}
          </button>
        </div>
        <input
          type={showPass ? 'text' : 'password'}
          placeholder="Şifreyi tekrar girin"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          required
        />
        <button type="submit">Şifremi Güncelle</button>
      </form>
    </main>
  );
}