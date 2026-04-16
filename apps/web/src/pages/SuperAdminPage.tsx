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
  const [showSecret, setShowSecret] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [newForm, setNewForm] = useState({ business_name: '', slug: '', email: '', password: '' });
  const [resetForm, setResetForm] = useState({ businessId: '', new_password: '' });
  const [showNewForm, setShowNewForm] = useState(false);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  function validateSlug(value: string): string {
    if (/[şığüöçŞIĞÜÖÇ]/.test(value)) return 'Türkçe karakter kullanmayın!';
    if (/\s/.test(value)) return 'Boşluk kullanmayın, tire (-) kullanın!';
    if (/[^a-z0-9-_]/.test(value)) return 'Sadece küçük harf, rakam, tire (-) kullanın!';
    return '';
  }

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase()
      .replace(/\s/g, '-')
      .replace(/[şŞ]/g, 's')
      .replace(/[ığİĞ]/g, 'i')
      .replace(/[üÜ]/g, 'u')
      .replace(/[öÖ]/g, 'o')
      .replace(/[çÇ]/g, 'c');
    setNewForm(p => ({ ...p, slug: cleaned }));
    setFieldErrors(p => ({ ...p, slug: validateSlug(cleaned) }));
  }

  async function login() {
    if (secret.length < 8) { showToast('Gizli anahtar çok kısa.', 'error'); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/businesses`, {
        headers: { 'x-super-admin-secret': secret }
      });
      if (!res.ok) { showToast('Giriş başarısız. Secret yanlış.', 'error'); return; }
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
    setFieldErrors({});
    const slugError = validateSlug(newForm.slug);
    if (slugError) { setFieldErrors({ slug: slugError }); return; }
    if (!newForm.business_name || !newForm.slug || !newForm.email || !newForm.password) {
      showToast('Tüm alanlar zorunludur.', 'error'); return;
    }
    if (newForm.password.length < 8) {
      setFieldErrors({ password: 'Şifre en az 8 karakter olmalıdır.' }); return;
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
        if (data.errors) {
          const errs: Record<string, string> = {};
          data.errors.forEach((e: any) => { errs[e.path[0]] = e.message; });
          setFieldErrors(errs);
        }
        showToast(data.message ?? 'Hata oluştu.', 'error');
        return;
      }
      showToast(`✅ ${newForm.business_name} başarıyla oluşturuldu!`, 'success');
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
    if (resetForm.new_password.length < 8) {
      showToast('Şifre en az 8 karakter olmalıdır.', 'error'); return;
    }
    const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${resetForm.businessId}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-super-admin-secret': secret },
      body: JSON.stringify({ new_password: resetForm.new_password })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('✅ Şifre güncellendi.', 'success');
      setResetForm({ businessId: '', new_password: '' });
    } else {
      showToast(data.message ?? 'Hata.', 'error');
    }
  }

  if (!authed) {
    return (
      <main style={{ fontFamily: 'Arial', maxWidth: 400, margin: '80px auto', padding: 20 }}>
        <h1>🔐 Super Admin Girişi</h1>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input
              type={showSecret ? 'text' : 'password'}
              placeholder="Gizli anahtar"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box' }}
            />
            <button onClick={() => setShowSecret(!showSecret)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>
              {showSecret ? '🙈' : '👁️'}
            </button>
          </div>
          <button onClick={login} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>Giriş</button>
        </div>
        {toast && <p style={{ color: toast.type === 'error' ? 'crimson' : 'green' }}>{toast.message}</p>}
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'Arial', maxWidth: 960, margin: '0 auto', padding: 20 }}>
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
        <button onClick={loadBusinesses} style={{ padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>🔄 Yenile</button>
      </div>

      {showNewForm && (
        <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 20, background: '#f9fafb' }}>
          <h2>Yeni İşletme Ekle</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              İşletme Adı
              <input value={newForm.business_name} onChange={(e) => setNewForm(p => ({ ...p, business_name: e.target.value }))} placeholder="Örn: Harika Kafe" />
            </label>
            <label>
              Slug (Menü URL'i)
              <input value={newForm.slug} onChange={(e) => handleSlugChange(e.target.value)} placeholder="Örn: harika-kafe" />
              {fieldErrors.slug && <small style={{ color: 'crimson' }}>⚠️ {fieldErrors.slug}</small>}
              {newForm.slug && !fieldErrors.slug && <small style={{ color: 'green' }}>✅ Menü: /m/{newForm.slug}</small>}
            </label>
            <label>
              E-posta
              <input type="email" value={newForm.email} onChange={(e) => setNewForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@kafe.com" />
              {fieldErrors.email && <small style={{ color: 'crimson' }}>⚠️ {fieldErrors.email}</small>}
            </label>
            <label>
              Şifre
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newForm.password}
                  onChange={(e) => setNewForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Min 8 karakter"
                  style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box' }}
                />
                <button onClick={() => setShowNewPassword(!showNewPassword)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer' }}>
                  {showNewPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {fieldErrors.password && <small style={{ color: 'crimson' }}>⚠️ {fieldErrors.password}</small>}
            </label>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={createBusiness} disabled={loading} style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
              {loading ? 'Oluşturuluyor...' : '✅ Oluştur'}
            </button>
            <button onClick={() => { setShowNewForm(false); setFieldErrors({}); }}>İptal</button>
          </div>
        </div>
      )}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 20, background: '#f9fafb' }}>
        <h2>🔑 Şifre Sıfırla</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            İşletme Seç
            <select value={resetForm.businessId} onChange={(e) => setResetForm(p => ({ ...p, businessId: e.target.value }))}>
              <option value="">Seçin</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.email})</option>)}
            </select>
          </label>
          <label>
            Yeni Şifre
            <div style={{ position: 'relative' }}>
              <input
                type={showResetPassword ? 'text' : 'password'}
                value={resetForm.new_password}
                onChange={(e) => setResetForm(p => ({ ...p, new_password: e.target.value }))}
                placeholder="Min 8 karakter"
                style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box' }}
              />
              <button onClick={() => setShowResetPassword(!showResetPassword)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer' }}>
                {showResetPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </label>
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
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>Kayıt</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>Durum</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #ddd' }}>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {businesses.map(b => (
            <tr key={b.id} style={{ background: b.is_active ? '#fff' : '#fef2f2' }}>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}><strong>{b.name}</strong></td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                <a href={`https://menuweb-production.up.railway.app/m/${b.slug}`} target="_blank" rel="noreferrer">{b.slug}</a>
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>{b.email}</td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd', textAlign: 'center' }}>{b.category_count}</td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd', textAlign: 'center' }}>{b.product_count}</td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd', fontSize: 12 }}>{new Date(b.created_at).toLocaleDateString('tr-TR')}</td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                <span style={{ color: b.is_active ? 'green' : 'red' }}>{b.is_active ? '✅ Aktif' : '❌ Pasif'}</span>
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                <button onClick={() => toggleActive(b)} style={{ fontSize: 12, padding: '4px 8px', cursor: 'pointer', background: b.is_active ? '#fee2e2' : '#dcfce7', border: '1px solid #ddd', borderRadius: 4 }}>
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