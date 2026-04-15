// apps/web/src/pages/ResetPage.tsx
import { useState } from 'react';
import { apiRequest } from '../api/client';

export function ResetPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest('/auth/request-reset', { method: 'POST', body: { email }, retryOn401: false });
    setMessage('Şifre sıfırlama bağlantısı için talep alındı.');
  }

  return (
    <main style={{ fontFamily: 'Arial, sans-serif', maxWidth: 360, margin: '48px auto' }}>
      <h1>Şifre Sıfırla</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <input placeholder="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button type="submit">Sıfırlama Talebi Gönder</button>
      </form>
      {message && <p>{message}</p>}
    </main>
  );
}