// apps/web/src/pages/SuperAdminPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';

type Business = {
  id: string;
  name: string;
  slug: string;
  admin_email: string | null;
  owner_count: number;
  is_active: boolean;
  created_at: string;
  category_count: number;
  product_count: number;
};

type Owner = {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ToastState = { message: string; type: 'error' | 'success' } | null;

export function SuperAdminPage() {
  const { accessToken, role, logout } = useAuth();
  const navigate = useNavigate();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [newForm, setNewForm] = useState({ business_name: '', slug: '', email: '', password: '' });
  const [resetForm, setResetForm] = useState({ businessId: '', new_password: '' });
  const [showNewModal, setShowNewModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Owner management state
  const [ownerModalBusiness, setOwnerModalBusiness] = useState<Business | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [newOwnerForm, setNewOwnerForm] = useState({ email: '', password: '' });
  const [showNewOwnerForm, setShowNewOwnerForm] = useState(false);
  const [showNewOwnerPassword, setShowNewOwnerPassword] = useState(false);
  const [ownerPasswordReset, setOwnerPasswordReset] = useState<{ owner: Owner; newPassword: string } | null>(null);
  const [showOwnerResetPassword, setShowOwnerResetPassword] = useState(false);

  useEffect(() => {
    if (!accessToken || role !== 'superadmin') {
      navigate('/login');
      return;
    }
    loadBusinesses();
  }, [accessToken, role]);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  function authHeaders() {
    return { Authorization: `Bearer ${accessToken}` };
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

  async function loadBusinesses() {
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/businesses`, {
        headers: authHeaders()
      });
      if (!res.ok) { showToast('Veriler alınamadı.', 'error'); return; }
      const data = await res.json();
      setBusinesses(data);
    } catch {
      showToast('Bağlantı hatası.', 'error');
    }
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      showToast(`${newForm.business_name} başarıyla oluşturuldu!`, 'success');
      setNewForm({ business_name: '', slug: '', email: '', password: '' });
      setShowNewModal(false);
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
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ is_active: !business.is_active })
    });
    if (res.ok) {
      showToast(business.is_active ? 'Pasif yapıldı.' : 'Aktif yapıldı.', 'success');
      await loadBusinesses();
    }
  }

  async function resetAdminPassword() {
    if (!resetForm.businessId || !resetForm.new_password) {
      showToast('İşletme ve şifre zorunludur.', 'error'); return;
    }
    if (resetForm.new_password.length < 8) {
      showToast('Şifre en az 8 karakter olmalıdır.', 'error'); return;
    }
    const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${resetForm.businessId}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ new_password: resetForm.new_password })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Admin şifresi güncellendi.', 'success');
      setResetForm({ businessId: '', new_password: '' });
      setShowResetModal(false);
    } else {
      showToast(data.message ?? 'Hata.', 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // OWNER İŞLEMLERİ
  // ─────────────────────────────────────────────────────────────

  async function openOwnerModal(business: Business) {
    setOwnerModalBusiness(business);
    setShowNewOwnerForm(false);
    setNewOwnerForm({ email: '', password: '' });
    setOwnerPasswordReset(null);
    await loadOwners(business.id);
  }

  function closeOwnerModal() {
    setOwnerModalBusiness(null);
    setOwners([]);
    setShowNewOwnerForm(false);
    setNewOwnerForm({ email: '', password: '' });
    setOwnerPasswordReset(null);
  }

  async function loadOwners(businessId: string) {
    setLoadingOwners(true);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${businessId}/owners`, {
        headers: authHeaders()
      });
      if (!res.ok) { showToast('Owner\'lar alınamadı.', 'error'); return; }
      const data = await res.json();
      setOwners(data);
    } catch {
      showToast('Bağlantı hatası.', 'error');
    } finally {
      setLoadingOwners(false);
    }
  }

  async function createOwner() {
    if (!ownerModalBusiness) return;
    if (!newOwnerForm.email || !newOwnerForm.password) {
      showToast('Email ve şifre zorunludur.', 'error'); return;
    }
    if (newOwnerForm.password.length < 8) {
      showToast('Şifre en az 8 karakter olmalıdır.', 'error'); return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${ownerModalBusiness.id}/owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(newOwnerForm)
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message ?? 'Owner oluşturulamadı.', 'error');
        return;
      }
      showToast('Owner oluşturuldu.', 'success');
      setNewOwnerForm({ email: '', password: '' });
      setShowNewOwnerForm(false);
      await loadOwners(ownerModalBusiness.id);
      await loadBusinesses(); // owner_count güncellensin
    } catch {
      showToast('Bağlantı hatası.', 'error');
    }
  }

  async function toggleOwnerActive(owner: Owner) {
    if (!ownerModalBusiness) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/superadmin/businesses/${ownerModalBusiness.id}/owners/${owner.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ is_active: !owner.is_active })
        }
      );
      if (!res.ok) { showToast('İşlem başarısız.', 'error'); return; }
      showToast(owner.is_active ? 'Owner pasifleştirildi.' : 'Owner aktifleştirildi.', 'success');
      await loadOwners(ownerModalBusiness.id);
      await loadBusinesses();
    } catch {
      showToast('Bağlantı hatası.', 'error');
    }
  }

  async function deleteOwner(owner: Owner) {
    if (!ownerModalBusiness) return;
    if (!confirm(`${owner.email} adlı owner'ı silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/superadmin/businesses/${ownerModalBusiness.id}/owners/${owner.id}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (!res.ok) { showToast('Silme başarısız.', 'error'); return; }
      showToast('Owner silindi.', 'success');
      await loadOwners(ownerModalBusiness.id);
      await loadBusinesses();
    } catch {
      showToast('Bağlantı hatası.', 'error');
    }
  }

  async function resetOwnerPassword() {
    if (!ownerModalBusiness || !ownerPasswordReset) return;
    if (ownerPasswordReset.newPassword.length < 8) {
      showToast('Şifre en az 8 karakter olmalıdır.', 'error'); return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/superadmin/businesses/${ownerModalBusiness.id}/owners/${ownerPasswordReset.owner.id}/reset-password`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ new_password: ownerPasswordReset.newPassword })
        }
      );
      const data = await res.json();
      if (!res.ok) { showToast(data.message ?? 'Hata.', 'error'); return; }
      showToast('Owner şifresi güncellendi.', 'success');
      setOwnerPasswordReset(null);
    } catch {
      showToast('Bağlantı hatası.', 'error');
    }
  }

  return (
    <div className="min-h-screen" style={{background: '#F8FAFC'}}>

      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: toast.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`}}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white sticky top-0 z-10" style={{borderBottom: '1px solid #E2E8F0'}}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background: '#0F172A'}}>
              <span className="text-lg">🏢</span>
            </div>
            <div>
              <h1 className="font-bold text-base" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>
                Atlas Super Admin
              </h1>
              <p className="text-xs" style={{color: '#64748B'}}>{businesses.length} işletme kayıtlı</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadBusinesses} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{background: '#F1F5F9', color: '#0F172A'}}>🔄 Yenile</button>
            <button onClick={() => setShowResetModal(true)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{background: '#FEF3C7', color: '#92400E'}}>🔑 Admin Şifre</button>
            <button onClick={() => setShowNewModal(true)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{background: '#0D9488'}}>+ Yeni İşletme</button>
            <button onClick={() => { logout(); navigate('/login'); }} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{background: '#FEF2F2', color: '#DC2626'}}>Çıkış</button>
          </div>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="grid gap-4 mb-6" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'}}>
          <div className="bg-white rounded-2xl p-4" style={{border: '1px solid #E2E8F0'}}>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{color: '#64748B'}}>Toplam İşletme</div>
            <div className="text-2xl font-bold" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>{businesses.length}</div>
          </div>
          <div className="bg-white rounded-2xl p-4" style={{border: '1px solid #E2E8F0'}}>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{color: '#64748B'}}>Aktif</div>
            <div className="text-2xl font-bold" style={{color: '#0D9488', fontFamily: 'Georgia, serif'}}>{businesses.filter(b => b.is_active).length}</div>
          </div>
          <div className="bg-white rounded-2xl p-4" style={{border: '1px solid #E2E8F0'}}>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{color: '#64748B'}}>Pasif</div>
            <div className="text-2xl font-bold" style={{color: '#DC2626', fontFamily: 'Georgia, serif'}}>{businesses.filter(b => !b.is_active).length}</div>
          </div>
          <div className="bg-white rounded-2xl p-4" style={{border: '1px solid #E2E8F0'}}>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{color: '#64748B'}}>Toplam Owner</div>
            <div className="text-2xl font-bold" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>
              {businesses.reduce((sum, b) => sum + Number(b.owner_count), 0)}
            </div>
          </div>
        </div>

        <h2 className="font-bold text-base mb-3" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>📋 İşletmeler</h2>

        <div className="bg-white rounded-2xl overflow-hidden mb-8" style={{border: '1px solid #E2E8F0'}}>
          <div className="grid items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{gridTemplateColumns: '2fr 1.5fr 2fr 1fr 1fr 1fr 1.5fr', background: '#F8FAFC', color: '#64748B', borderBottom: '1px solid #E2E8F0'}}>
            <div>İşletme</div><div>Slug</div><div>Admin E-posta</div>
            <div className="text-center">Owner</div><div className="text-center">Kat.</div><div className="text-center">Ürün</div>
            <div className="text-right">İşlem</div>
          </div>

          {businesses.map(b => (
            <div key={b.id} className="grid items-center gap-3 px-4 py-3 text-sm"
              style={{gridTemplateColumns: '2fr 1.5fr 2fr 1fr 1fr 1fr 1.5fr', borderBottom: '1px solid #F1F5F9', background: b.is_active ? 'white' : '#FEF8F8'}}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{background: b.is_active ? '#0D9488' : '#94A3B8'}}>
                  {b.name.charAt(0).toUpperCase()}
                </div>
                <div style={{minWidth: 0}}>
                  <div className="font-semibold truncate" style={{color: '#0F172A'}}>{b.name}</div>
                  <div className="text-xs" style={{color: b.is_active ? '#0D9488' : '#DC2626'}}>{b.is_active ? '● Aktif' : '● Pasif'}</div>
                </div>
              </div>
              <div>
                <a href={`https://www.atlasqrmenu.com/m/${b.slug}`} target="_blank" rel="noreferrer"
                  className="text-xs font-mono truncate block" style={{color: '#0D9488'}}>/{b.slug}</a>
              </div>
              <div className="text-xs truncate" style={{color: '#64748B'}}>{b.admin_email || '-'}</div>

              {/* Owner butonu */}
              <div className="text-center">
                <button
                  onClick={() => openOwnerModal(b)}
                  className="px-2 py-1 rounded-lg text-xs font-bold active:scale-95 transition-transform"
                  style={{
                    background: b.owner_count > 0 ? '#F0FDF4' : '#FEF3C7',
                    color: b.owner_count > 0 ? '#16A34A' : '#92400E'
                  }}
                  title="Owner yönetimi"
                >
                  👤 {b.owner_count}
                </button>
              </div>

              <div className="text-center font-semibold" style={{color: '#0F172A'}}>{b.category_count}</div>
              <div className="text-center font-semibold" style={{color: '#0F172A'}}>{b.product_count}</div>

              <div className="flex justify-end">
                <button onClick={() => toggleActive(b)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{background: b.is_active ? '#FEF2F2' : '#F0FDF4', color: b.is_active ? '#DC2626' : '#16A34A'}}>
                  {b.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                </button>
              </div>
            </div>
          ))}

          {businesses.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🏢</div>
              <p className="text-sm" style={{color: '#94A3B8'}}>Henüz işletme yok</p>
            </div>
          )}
        </div>
      </div>

      {/* YENİ İŞLETME MODAL */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: 'rgba(15,23,42,0.6)'}}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between" style={{borderBottom: '1px solid #E2E8F0'}}>
              <h2 className="font-bold text-base" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Yeni İşletme Ekle</h2>
              <button onClick={() => { setShowNewModal(false); setFieldErrors({}); }}
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{background: '#F1F5F9', color: '#64748B'}}>✕</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto" style={{maxHeight: '70vh'}}>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>İşletme Adı</label>
                <input value={newForm.business_name} onChange={(e) => setNewForm(p => ({ ...p, business_name: e.target.value }))}
                  placeholder="Örn: Harika Kafe" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Slug (Menü URL'i)</label>
                <input value={newForm.slug} onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="Örn: harika-kafe" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{border: `1.5px solid ${fieldErrors.slug ? '#DC2626' : '#E2E8F0'}`, background: '#F8FAFC', color: '#0F172A'}} />
                {fieldErrors.slug && <p className="text-xs mt-1 font-medium" style={{color: '#DC2626'}}>⚠️ {fieldErrors.slug}</p>}
                {newForm.slug && !fieldErrors.slug && <p className="text-xs mt-1 font-medium" style={{color: '#0D9488'}}>✅ Menü: <span className="font-mono">/m/{newForm.slug}</span></p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Admin E-posta</label>
                <input type="email" value={newForm.email} onChange={(e) => setNewForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="admin@kafe.com" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{border: `1.5px solid ${fieldErrors.email ? '#DC2626' : '#E2E8F0'}`, background: '#F8FAFC', color: '#0F172A'}} />
                {fieldErrors.email && <p className="text-xs mt-1 font-medium" style={{color: '#DC2626'}}>⚠️ {fieldErrors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Şifre</label>
                <div style={{position: 'relative'}}>
                  <input type={showNewPassword ? 'text' : 'password'} value={newForm.password}
                    onChange={(e) => setNewForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 8 karakter" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{border: `1.5px solid ${fieldErrors.password ? '#DC2626' : '#E2E8F0'}`, background: '#F8FAFC', color: '#0F172A', paddingRight: 44, boxSizing: 'border-box'}} />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18}}>
                    {showNewPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs mt-1 font-medium" style={{color: '#DC2626'}}>⚠️ {fieldErrors.password}</p>}
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3" style={{borderTop: '1px solid #E2E8F0'}}>
              <button onClick={() => { setShowNewModal(false); setFieldErrors({}); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{background: '#F1F5F9', color: '#64748B'}}>İptal</button>
              <button onClick={createBusiness} disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{background: loading ? '#475569' : '#0D9488', cursor: loading ? 'not-allowed' : 'pointer'}}>
                {loading ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN ŞİFRE SIFIRLA MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: 'rgba(15,23,42,0.6)'}}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between" style={{borderBottom: '1px solid #E2E8F0'}}>
              <h2 className="font-bold text-base" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>🔑 Admin Şifresini Sıfırla</h2>
              <button onClick={() => setShowResetModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{background: '#F1F5F9', color: '#64748B'}}>✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>İşletme Seç</label>
                <select value={resetForm.businessId} onChange={(e) => setResetForm(p => ({ ...p, businessId: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}>
                  <option value="">Seçin</option>
                  {businesses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.admin_email})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Yeni Şifre</label>
                <div style={{position: 'relative'}}>
                  <input type={showResetPassword ? 'text' : 'password'} value={resetForm.new_password}
                    onChange={(e) => setResetForm(p => ({ ...p, new_password: e.target.value }))}
                    placeholder="Min 8 karakter" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', paddingRight: 44, boxSizing: 'border-box'}} />
                  <button type="button" onClick={() => setShowResetPassword(!showResetPassword)}
                    style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18}}>
                    {showResetPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3" style={{borderTop: '1px solid #E2E8F0'}}>
              <button onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{background: '#F1F5F9', color: '#64748B'}}>İptal</button>
              <button onClick={resetAdminPassword}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{background: '#D97706'}}>Şifreyi Güncelle</button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────── */}
      {/* OWNER YÖNETIM MODAL */}
      {/* ─────────────────────────────────────────────────────── */}
      {ownerModalBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: 'rgba(15,23,42,0.6)'}}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{maxHeight: '85vh'}}>
            <div className="px-6 py-4 flex items-center justify-between" style={{borderBottom: '1px solid #E2E8F0'}}>
              <div>
                <h2 className="font-bold text-base" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>
                  👤 Owner Yönetimi
                </h2>
                <p className="text-xs mt-0.5" style={{color: '#64748B'}}>
                  {ownerModalBusiness.name} — {owners.filter(o => o.is_active).length} aktif owner
                </p>
              </div>
              <button onClick={closeOwnerModal}
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{background: '#F1F5F9', color: '#64748B'}}>✕</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* Yeni Owner Form */}
              {!showNewOwnerForm ? (
                <button
                  onClick={() => setShowNewOwnerForm(true)}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white mb-4"
                  style={{background: '#0D9488'}}
                >
                  + Yeni Owner Ekle
                </button>
              ) : (
                <div className="p-4 rounded-xl mb-4" style={{background: '#F8FAFC', border: '1.5px solid #0D9488'}}>
                  <h3 className="font-semibold text-sm mb-3" style={{color: '#0F172A'}}>Yeni Owner Ekle</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>E-posta</label>
                      <input
                        type="email"
                        value={newOwnerForm.email}
                        onChange={(e) => setNewOwnerForm(p => ({...p, email: e.target.value}))}
                        placeholder="patron@firma.com"
                        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                        style={{border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A'}}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Şifre</label>
                      <div style={{position: 'relative'}}>
                        <input
                          type={showNewOwnerPassword ? 'text' : 'password'}
                          value={newOwnerForm.password}
                          onChange={(e) => setNewOwnerForm(p => ({...p, password: e.target.value}))}
                          placeholder="Min 8 karakter"
                          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                          style={{border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A', paddingRight: 44, boxSizing: 'border-box'}}
                        />
                        <button type="button" onClick={() => setShowNewOwnerPassword(!showNewOwnerPassword)}
                          style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18}}>
                          {showNewOwnerPassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setShowNewOwnerForm(false); setNewOwnerForm({email: '', password: ''}); }}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold"
                        style={{background: '#F1F5F9', color: '#64748B'}}
                      >
                        İptal
                      </button>
                      <button
                        onClick={createOwner}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                        style={{background: '#0D9488'}}
                      >
                        Oluştur
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Owner Listesi */}
              {loadingOwners ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{color: '#94A3B8'}}>Yükleniyor...</p>
                </div>
              ) : owners.length === 0 ? (
                <div className="text-center py-8 rounded-xl" style={{background: '#F8FAFC', border: '1px dashed #E2E8F0'}}>
                  <div className="text-3xl mb-2">👤</div>
                  <p className="text-sm" style={{color: '#94A3B8'}}>Henüz owner yok</p>
                  <p className="text-xs mt-1" style={{color: '#CBD5E1'}}>"+ Yeni Owner Ekle" ile başlayın</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {owners.map(owner => (
                    <div key={owner.id}
                      className="p-3 rounded-xl"
                      style={{
                        background: owner.is_active ? 'white' : '#FEF8F8',
                        border: `1px solid ${owner.is_active ? '#E2E8F0' : '#FECACA'}`
                      }}
                    >
                      {/* Owner satırı */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                            style={{background: owner.is_active ? '#0D9488' : '#94A3B8'}}
                          >
                            {owner.email.charAt(0).toUpperCase()}
                          </div>
                          <div style={{minWidth: 0}}>
                            <div className="font-semibold text-sm truncate" style={{color: '#0F172A'}}>{owner.email}</div>
                            <div className="text-xs" style={{color: owner.is_active ? '#0D9488' : '#DC2626'}}>
                              {owner.is_active ? '● Aktif' : '● Pasif'} · {new Date(owner.created_at).toLocaleDateString('tr-TR')}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => setOwnerPasswordReset({owner, newPassword: ''})}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                            style={{background: '#FEF3C7', color: '#92400E'}}
                            title="Şifre sıfırla"
                          >
                            🔑
                          </button>
                          <button
                            onClick={() => toggleOwnerActive(owner)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                            style={{
                              background: owner.is_active ? '#FEF2F2' : '#F0FDF4',
                              color: owner.is_active ? '#DC2626' : '#16A34A'
                            }}
                          >
                            {owner.is_active ? 'Pasif' : 'Aktif'}
                          </button>
                          <button
                            onClick={() => deleteOwner(owner)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                            style={{background: '#FEF2F2', color: '#DC2626'}}
                            title="Sil"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Şifre sıfırlama formu (inline) */}
                      {ownerPasswordReset?.owner.id === owner.id && (
                        <div className="mt-3 pt-3" style={{borderTop: '1px solid #E2E8F0'}}>
                          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>
                            Yeni Şifre (Owner'a bildirilecek)
                          </label>
                          <div className="flex gap-2">
                            <div style={{position: 'relative', flex: 1}}>
                              <input
                                type={showOwnerResetPassword ? 'text' : 'password'}
                                value={ownerPasswordReset.newPassword}
                                onChange={(e) => setOwnerPasswordReset(p => p ? {...p, newPassword: e.target.value} : null)}
                                placeholder="Min 8 karakter"
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A', paddingRight: 40, boxSizing: 'border-box'}}
                                autoFocus
                              />
                              <button type="button" onClick={() => setShowOwnerResetPassword(!showOwnerResetPassword)}
                                style={{position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16}}>
                                {showOwnerResetPassword ? '🙈' : '👁️'}
                              </button>
                            </div>
                            <button
                              onClick={() => setOwnerPasswordReset(null)}
                              className="px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{background: '#F1F5F9', color: '#64748B'}}
                            >
                              İptal
                            </button>
                            <button
                              onClick={resetOwnerPassword}
                              className="px-3 py-2 rounded-lg text-xs font-semibold text-white"
                              style={{background: '#D97706'}}
                            >
                              Güncelle
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4" style={{borderTop: '1px solid #E2E8F0', background: '#F8FAFC'}}>
              <button
                onClick={closeOwnerModal}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{background: '#F1F5F9', color: '#0F172A'}}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}