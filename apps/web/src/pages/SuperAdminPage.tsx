// apps/web/src/pages/SuperAdminPage.tsx
import { useEffect, useState } from 'react';

const API_BASE_URL = 'https://menuapi-production-3a61.up.railway.app/api';

type Business = {
  id: string;
  name: string;
  slug: string;
  email: string;
  is_active: boolean;
  created_at: string;
  category_count: number;
  product_count: number;
};

type ToastState = { message: string; type: 'error' | 'success' } | null;

export function SuperAdminPage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(false);

  const [newForm, setNewForm] = useState({ business_name: '', slug: '', email: '', password: '' });
  const [resetForm, setResetForm] = useState({ businessId: '', new_password: '' });
  const [showNewForm, setShowNewForm] = useState(false);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function login() {
    if (secret.length < 10) { showToast('Gizli anahtar çok kısa.', 'error'); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/businesses`, {
        headers: { 'x-super-admin-secret': secret }
      });
      if (!res.ok) { showToast('Giriş başarısız.', 'error'); return; }
      const data = await res.json();
      setBusinesses(data);
      setAuthed(true);
    } catch {
      showToast('Bağlantı hatası.', 'error');
    }
  }

  async function loadBusinesses() {
    const res = await fetch(`${API_BASE_URL}/superadmin/businesses`, {
      headers: { 'x-super-admin-secret': secret }
    });
    const data = await res.json();
    setBusinesses(data);
  }

  async function createBusiness() {
    if (!newForm.business_name || !newForm.slug || !newForm.email || !newForm.password) {
      showToast('Tüm alanlar zorunludur.', 'error'); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-super-admin-secret': secret },
        body: JSON.stringify(newForm)
      });
      const data = await res.json();
      if (!res.ok) { 
        console.log('Hata detayı:', data);
        showToast(data.message ?? JSON.stringify(data), 'error'); 
        return; 
      }
      showToast(`✅ ${newForm.business_name} oluşturuldu!`, 'success');
      setNewForm({ business_name: '', slug: '', email: '', password: '' });
      setShowNewForm(false);
      await loadBusinesses();
    } catch {
      showToast('Hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(business: Business) {
    const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${business.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-super-admin-secret': secret },
      body: JSON.stringify({ is_active: !business.is_active })
    });
    if (res.ok) {
      showToast(business.is_active ? 'Pasif yapıldı.' : 'Aktif yapıldı.', 'success');
      await loadBusinesses();
    }
  }

  async function resetPassword() {
    if (!resetForm.businessId || !resetForm.new_password) {
      showToast('İşletme ve şifre zorunludur.', 'error'); return;
    }
    const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${resetForm.businessId}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-super-admin-secret': secret },
      body: JSON.stringify({ new_password: resetForm.new_password })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Şifre güncellendi.', 'success');
      setResetForm({ businessId: '', new_password: '' });
    } else {
      showToast(data.message ?? 'Hata.', 'error');
    }
  }

  if (!authed) {
    return (
      <main style={{ fontFamily: 'Arial', maxWidth: 400, margin: '80px auto', padding: 20 }}>
        <h1>🔐 Super Admin</h1>
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            type="password"
            placeholder="Gizli anahtar"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
          />
          <button onClick={login}>Giriş</button>
        </div>
        {toast && <p style={{ color: toast.type === 'error' ? 'crimson' : 'green' }}>{toast.message}</p>}
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'Arial', maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1>🏢 Atlas Super Admin</h1>

      {toast && (
        <div style={{ padding: '10px 14px', borderRadius: 6, marginBottom: 16, background: toast.type === 'error' ? '#fee2e2' : '#dcfce7', color: toast.type === 'error' ? '#991b1b' : '#166534' }}>
          {toast.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setShowNewForm(!showNewForm)} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
          + Yeni İşletme Ekle
        </button>
        <button onClick={loadBusinesses} style={{ padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
          🔄 Yenile
        </button>
      </div>

      {showNewForm && (
        <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 20, background: '#f9fafb' }}>
          <h2>Yeni İşletme</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>İşletme Adı<input value={newForm.business_name} onChange={(e) => setNewForm(p => ({ ...p, business_name: e.target.value }))} placeholder="Örn: Demo Kafe" /></label>
            <label>Slug (URL)<input value={newForm.slug} onChange={(e) => setNewForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s/g, '-') }))} placeholder="Örn: demo-kafe" /></label>
            <label>E-posta<input type="email" value={newForm.email} onChange={(e) => setNewForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@kafe.com" /></label>
            <label>Şifre<input type="password" value={newForm.password} onChange={(e) => setNewForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 8 karakter" /></label>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={createBusiness} disabled={loading} style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
              {loading ? 'Oluşturuluyor...' : '✅ Oluştur'}
            </button>
            <button onClick={() => setShowNewForm(false)}>İptal</button>
          </div>
        </div>
      )}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 20, background: '#f9fafb' }}>
        <h2>🔑 Şifre Sıfırla</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>İşletme Seç
            <select value={resetForm.businessId} onChange={(e) => setResetForm(p => ({ ...p, businessId: e.target.value }))}>
              <option value="">Seçin</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.email})</option>)}
            </select>
          </label>
          <label>Yeni Şifre<input type="password" value={resetForm.new_password} onChange={(e) => setResetForm(p => ({ ...p, new_password: e.target.value }))} placeholder="Min 8 karakter" /></label>
        </div>
        <button onClick={resetPassword} style={{ marginTop: 10, background: '#d97706', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
          Şifreyi Güncelle
        </button>
      </div>

      <h2>📋 İşletmeler ({businesses.length})</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>İşletme</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>Slug</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>E-posta</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>Kategori</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>Ürün</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>Durum</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {businesses.map(b => (
            <tr key={b.id}>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>{b.name}</td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                <a href={`https://menuweb-production.up.railway.app/m/${b.slug}`} target="_blank" rel="noreferrer">{b.slug}</a>
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>{b.email}</td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>{b.category_count}</td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>{b.product_count}</td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                <span style={{ color: b.is_active ? 'green' : 'red' }}>{b.is_active ? '✅ Aktif' : '❌ Pasif'}</span>
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                <button onClick={() => toggleActive(b)} style={{ fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}>
                  {b.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}