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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız.');
    }
  }

  return (
    <main style={{ fontFamily: 'Arial, sans-serif', maxWidth: 360, margin: '48px auto' }}>
      <h1>Yönetici Girişi</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <input placeholder="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder="Şifre" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">Giriş Yap</button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <Link to="/reset">Şifremi unuttum</Link>
    </main>
  );
}