// apps/web/src/pages/SuperAdminPage.tsx
// CHANGELOG v2:
// - Toast komponentine geçti
// - Mobil uyumlu: header collapse, masaüstü tablo + mobil kart layout
// - Modal'lar mobile sığacak şekilde optimize

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Business,
  listBusinesses,
  createBusiness as apiCreateBusiness,
  toggleBusinessActive,
  resetAdminPassword as apiResetAdminPassword,
  toggleWaiterModule as apiToggleWaiterModule
} from '../api/superadminApi';
import { OwnerManagementModal } from './superadmin/OwnerManagementModal';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';

export function SuperAdminPage() {
  const { accessToken, role, logout } = useAuth();
  const navigate = useNavigate();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Yeni işletme modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ business_name: '', slug: '', email: '', password: '' });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Admin şifre sıfırlama modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetForm, setResetForm] = useState({ businessId: '', new_password: '' });
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Owner yönetim modal
  const [ownerModalBusiness, setOwnerModalBusiness] = useState<Business | null>(null);

  useEffect(() => {
    if (!accessToken || role !== 'superadmin') {
      navigate('/login');
      return;
    }
    loadBusinesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, role]);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
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
    if (!accessToken) return;
    try {
      const data = await listBusinesses(accessToken);
      setBusinesses(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Veriler alınamadı.', 'error');
    }
  }

  async function createBusiness() {
    if (!accessToken) return;
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
      await apiCreateBusiness(accessToken, newForm);
      showToast(`${newForm.business_name} başarıyla oluşturuldu!`, 'success');
      setNewForm({ business_name: '', slug: '', email: '', password: '' });
      setShowNewModal(false);
      await loadBusinesses();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(business: Business) {
    if (!accessToken) return;
    try {
      await toggleBusinessActive(accessToken, business.id, !business.is_active);
      showToast(business.is_active ? 'Pasif yapıldı.' : 'Aktif yapıldı.', 'success');
      await loadBusinesses();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata.', 'error');
    }
  }

  async function toggleWaiter(business: Business) {
    if (!accessToken) return;
    try {
      await apiToggleWaiterModule(accessToken, business.id, !business.waiter_module_enabled);
      showToast(business.waiter_module_enabled ? 'Garson modülü kapatıldı.' : 'Garson modülü açıldı.', 'success');
      await loadBusinesses();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata.', 'error');
    }
  }

  async function resetAdminPassword() {
    if (!accessToken) return;
    if (!resetForm.businessId || !resetForm.new_password) {
      showToast('İşletme ve şifre zorunludur.', 'error'); return;
    }
    if (resetForm.new_password.length < 8) {
      showToast('Şifre en az 8 karakter olmalıdır.', 'error'); return;
    }
    try {
      await apiResetAdminPassword(accessToken, resetForm.businessId, resetForm.new_password);
      showToast('Admin şifresi güncellendi.', 'success');
      setResetForm({ businessId: '', new_password: '' });
      setShowResetModal(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata.', 'error');
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      <Toast state={toast} />

      {/* HEADER — Responsive */}
      <div className="bg-white sticky top-0 z-30" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Logo + başlık */}
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#0F172A' }}>
                <span className="text-base md:text-lg">🏢</span>
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-sm md:text-base truncate" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                  Atlas Super Admin
                </h1>
                <p className="text-xs hidden sm:block" style={{ color: '#64748B' }}>{businesses.length} işletme kayıtlı</p>
              </div>
            </div>

            {/* Desktop butonlar */}
            <div className="hidden md:flex gap-2 flex-shrink-0">
              <button onClick={loadBusinesses} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: '#F1F5F9', color: '#0F172A' }}>🔄 Yenile</button>
              <button onClick={() => setShowResetModal(true)} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>🔑 Admin Şifre</button>
              <button onClick={() => setShowNewModal(true)} className="px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#0D9488' }}>+ Yeni</button>
              <button onClick={() => { logout(); navigate('/login'); }} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: '#FEF2F2', color: '#DC2626' }}>Çıkış</button>
            </div>

            {/* Mobil hamburger */}
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: '#F1F5F9' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2">
                {menuOpen ? (
                  <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                ) : (
                  <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
                )}
              </svg>
            </button>
          </div>

          {/* Mobil menu drawer */}
          {menuOpen && (
            <div className="md:hidden mt-3 pt-3 border-t flex flex-col gap-2" style={{ borderColor: '#E2E8F0' }}>
              <button onClick={() => { loadBusinesses(); setMenuOpen(false); }}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-left" style={{ background: '#F1F5F9', color: '#0F172A' }}>
                🔄 Yenile
              </button>
              <button onClick={() => { setShowResetModal(true); setMenuOpen(false); }}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-left" style={{ background: '#FEF3C7', color: '#92400E' }}>
                🔑 Admin Şifre Sıfırla
              </button>
              <button onClick={() => { setShowNewModal(true); setMenuOpen(false); }}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-left text-white" style={{ background: '#0D9488' }}>
                + Yeni İşletme
              </button>
              <button onClick={() => { logout(); navigate('/login'); }}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-left" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                Çıkış Yap
              </button>
            </div>
          )}
        </div>
      </div>

      {/* İSTATİSTİK KARTLARI - Responsive grid */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
        <div className="grid gap-3 mb-4 md:mb-6"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-4" style={{ border: '1px solid #E2E8F0' }}>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#64748B' }}>Toplam İşletme</div>
            <div className="text-xl md:text-2xl font-bold" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>{businesses.length}</div>
          </div>
          <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-4" style={{ border: '1px solid #E2E8F0' }}>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#64748B' }}>Aktif</div>
            <div className="text-xl md:text-2xl font-bold" style={{ color: '#0D9488', fontFamily: 'Georgia, serif' }}>{businesses.filter(b => b.is_active).length}</div>
          </div>
          <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-4" style={{ border: '1px solid #E2E8F0' }}>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#64748B' }}>Pasif</div>
            <div className="text-xl md:text-2xl font-bold" style={{ color: '#DC2626', fontFamily: 'Georgia, serif' }}>{businesses.filter(b => !b.is_active).length}</div>
          </div>
          <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-4" style={{ border: '1px solid #E2E8F0' }}>
            <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#64748B' }}>Toplam Owner</div>
            <div className="text-xl md:text-2xl font-bold" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
              {businesses.reduce((sum, b) => sum + Number(b.owner_count), 0)}
            </div>
          </div>
        </div>

        <h2 className="font-bold text-base mb-3" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>📋 İşletmeler</h2>

        {/* DESKTOP — Tablo görünümü */}
        <div className="hidden lg:block bg-white rounded-2xl overflow-hidden mb-8" style={{ border: '1px solid #E2E8F0' }}>
          <div className="grid items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ gridTemplateColumns: '2fr 1.5fr 2fr 1fr 1fr 1fr 1.2fr 1.5fr', background: '#F8FAFC', color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>
            <div>İşletme</div><div>Slug</div><div>Admin E-posta</div>
            <div className="text-center">Owner</div><div className="text-center">Kat.</div><div className="text-center">Ürün</div>
            <div className="text-center">Garson</div>
            <div className="text-right">İşlem</div>
          </div>

          {businesses.map(b => (
            <div key={b.id} className="grid items-center gap-3 px-4 py-3 text-sm"
              style={{ gridTemplateColumns: '2fr 1.5fr 2fr 1fr 1fr 1fr 1.2fr 1.5fr', borderBottom: '1px solid #F1F5F9', background: b.is_active ? 'white' : '#FEF8F8' }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: b.is_active ? '#0D9488' : '#94A3B8' }}>
                  {b.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="font-semibold truncate" style={{ color: '#0F172A' }}>{b.name}</div>
                  <div className="text-xs" style={{ color: b.is_active ? '#0D9488' : '#DC2626' }}>{b.is_active ? '● Aktif' : '● Pasif'}</div>
                </div>
              </div>
              <div>
                <a href={`https://www.atlasqrmenu.com/m/${b.slug}`} target="_blank" rel="noreferrer"
                  className="text-xs font-mono truncate block" style={{ color: '#0D9488' }}>/{b.slug}</a>
              </div>
              <div className="text-xs truncate" style={{ color: '#64748B' }}>{b.admin_email || '-'}</div>

              <div className="text-center">
                <button onClick={() => setOwnerModalBusiness(b)}
                  className="px-2 py-1 rounded-lg text-xs font-bold active:scale-95 transition-transform"
                  style={{ background: b.owner_count > 0 ? '#F0FDF4' : '#FEF3C7',
                    color: b.owner_count > 0 ? '#16A34A' : '#92400E' }}
                  title="Owner yönetimi">
                  👤 {b.owner_count}
                </button>
              </div>

              <div className="text-center font-semibold" style={{ color: '#0F172A' }}>{b.category_count}</div>
              <div className="text-center font-semibold" style={{ color: '#0F172A' }}>{b.product_count}</div>

              <div className="text-center">
                <button onClick={() => toggleWaiter(b)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: b.waiter_module_enabled ? '#F0FDF4' : '#F1F5F9',
                    color: b.waiter_module_enabled ? '#16A34A' : '#64748B' }}
                  title={b.waiter_module_enabled ? 'Garson modülü AÇIK' : 'Garson modülü KAPALI'}>
                  {b.waiter_module_enabled ? '✅ Açık' : '⚪ Kapalı'}
                </button>
              </div>

              <div className="flex justify-end">
                <button onClick={() => toggleActive(b)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: b.is_active ? '#FEF2F2' : '#F0FDF4', color: b.is_active ? '#DC2626' : '#16A34A' }}>
                  {b.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                </button>
              </div>
            </div>
          ))}

          {businesses.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🏢</div>
              <p className="text-sm" style={{ color: '#94A3B8' }}>Henüz işletme yok</p>
            </div>
          )}
        </div>

        {/* MOBİL & TABLET — Kart görünümü */}
        <div className="lg:hidden flex flex-col gap-3 mb-8">
          {businesses.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
              <div className="text-4xl mb-3">🏢</div>
              <p className="text-sm" style={{ color: '#94A3B8' }}>Henüz işletme yok</p>
            </div>
          )}

          {businesses.map(b => (
            <div key={b.id} className="bg-white rounded-2xl p-4"
              style={{ border: '1px solid #E2E8F0', background: b.is_active ? 'white' : '#FEF8F8' }}>

              {/* Üst: Avatar + İsim + Durum */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: b.is_active ? '#0D9488' : '#94A3B8' }}>
                  {b.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{ color: '#0F172A' }}>{b.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: b.is_active ? '#0D9488' : '#DC2626' }}>
                    {b.is_active ? '● Aktif' : '● Pasif'}
                  </div>
                  <a href={`https://www.atlasqrmenu.com/m/${b.slug}`} target="_blank" rel="noreferrer"
                    className="text-xs font-mono block mt-1 truncate" style={{ color: '#0D9488' }}>
                    /{b.slug}
                  </a>
                  {b.admin_email && (
                    <div className="text-xs mt-1 truncate" style={{ color: '#64748B' }}>✉️ {b.admin_email}</div>
                  )}
                </div>
              </div>

              {/* Sayılar grid */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button onClick={() => setOwnerModalBusiness(b)}
                  className="px-2 py-2 rounded-lg text-xs font-bold flex flex-col items-center"
                  style={{ background: b.owner_count > 0 ? '#F0FDF4' : '#FEF3C7',
                    color: b.owner_count > 0 ? '#16A34A' : '#92400E' }}>
                  <span>👤 {b.owner_count}</span>
                  <span className="text-[10px] font-medium opacity-75">Owner</span>
                </button>
                <div className="px-2 py-2 rounded-lg text-xs font-bold flex flex-col items-center"
                  style={{ background: '#F1F5F9', color: '#0F172A' }}>
                  <span>📁 {b.category_count}</span>
                  <span className="text-[10px] font-medium opacity-75">Kategori</span>
                </div>
                <div className="px-2 py-2 rounded-lg text-xs font-bold flex flex-col items-center"
                  style={{ background: '#F1F5F9', color: '#0F172A' }}>
                  <span>🛒 {b.product_count}</span>
                  <span className="text-[10px] font-medium opacity-75">Ürün</span>
                </div>
              </div>

              {/* Aksiyonlar */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => toggleWaiter(b)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: b.waiter_module_enabled ? '#F0FDF4' : '#F1F5F9',
                    color: b.waiter_module_enabled ? '#16A34A' : '#64748B' }}>
                  {b.waiter_module_enabled ? '✅ Garson Açık' : '⚪ Garson Kapalı'}
                </button>
                <button onClick={() => toggleActive(b)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: b.is_active ? '#FEF2F2' : '#F0FDF4',
                    color: b.is_active ? '#DC2626' : '#16A34A' }}>
                  {b.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* YENİ İŞLETME MODAL — mobile uyumlu */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="px-5 md:px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #E2E8F0' }}>
              <h2 className="font-bold text-base" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>Yeni İşletme Ekle</h2>
              <button onClick={() => { setShowNewModal(false); setFieldErrors({}); }}
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#F1F5F9', color: '#64748B' }}>✕</button>
            </div>
            <div className="p-5 md:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>İşletme Adı</label>
                <input value={newForm.business_name} onChange={(e) => setNewForm(p => ({ ...p, business_name: e.target.value }))}
                  placeholder="Örn: Harika Kafe" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Slug (Menü URL'i)</label>
                <input value={newForm.slug} onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="Örn: harika-kafe" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: `1.5px solid ${fieldErrors.slug ? '#DC2626' : '#E2E8F0'}`, background: '#F8FAFC', color: '#0F172A' }} />
                {fieldErrors.slug && <p className="text-xs mt-1 font-medium" style={{ color: '#DC2626' }}>⚠️ {fieldErrors.slug}</p>}
                {newForm.slug && !fieldErrors.slug && <p className="text-xs mt-1 font-medium" style={{ color: '#0D9488' }}>✅ Menü: <span className="font-mono">/m/{newForm.slug}</span></p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Admin E-posta</label>
                <input type="email" value={newForm.email} onChange={(e) => setNewForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="admin@kafe.com" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: `1.5px solid ${fieldErrors.email ? '#DC2626' : '#E2E8F0'}`, background: '#F8FAFC', color: '#0F172A' }} />
                {fieldErrors.email && <p className="text-xs mt-1 font-medium" style={{ color: '#DC2626' }}>⚠️ {fieldErrors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Şifre</label>
                <div style={{ position: 'relative' }}>
                  <input type={showNewPassword ? 'text' : 'password'} value={newForm.password}
                    onChange={(e) => setNewForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 8 karakter" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: `1.5px solid ${fieldErrors.password ? '#DC2626' : '#E2E8F0'}`, background: '#F8FAFC', color: '#0F172A', paddingRight: 44, boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>
                    {showNewPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs mt-1 font-medium" style={{ color: '#DC2626' }}>⚠️ {fieldErrors.password}</p>}
              </div>
            </div>
            <div className="px-5 md:px-6 py-4 flex gap-3 flex-shrink-0" style={{ borderTop: '1px solid #E2E8F0' }}>
              <button onClick={() => { setShowNewModal(false); setFieldErrors({}); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F1F5F9', color: '#64748B' }}>İptal</button>
              <button onClick={createBusiness} disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: loading ? '#475569' : '#0D9488', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN ŞİFRE SIFIRLA MODAL — mobile uyumlu */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 md:px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #E2E8F0' }}>
              <h2 className="font-bold text-base" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>🔑 Admin Şifre Sıfırla</h2>
              <button onClick={() => setShowResetModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#F1F5F9', color: '#64748B' }}>✕</button>
            </div>
            <div className="p-5 md:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>İşletme Seç</label>
                <select value={resetForm.businessId} onChange={(e) => setResetForm(p => ({ ...p, businessId: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A' }}>
                  <option value="">Seçin</option>
                  {businesses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.admin_email})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Yeni Şifre</label>
                <div style={{ position: 'relative' }}>
                  <input type={showResetPassword ? 'text' : 'password'} value={resetForm.new_password}
                    onChange={(e) => setResetForm(p => ({ ...p, new_password: e.target.value }))}
                    placeholder="Min 8 karakter" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', paddingRight: 44, boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowResetPassword(!showResetPassword)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>
                    {showResetPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-5 md:px-6 py-4 flex gap-3" style={{ borderTop: '1px solid #E2E8F0' }}>
              <button onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F1F5F9', color: '#64748B' }}>İptal</button>
              <button onClick={resetAdminPassword}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#D97706' }}>Şifreyi Güncelle</button>
            </div>
          </div>
        </div>
      )}

      {/* OWNER YÖNETİM MODAL */}
      {ownerModalBusiness && accessToken && (
        <OwnerManagementModal
          business={ownerModalBusiness}
          accessToken={accessToken}
          onClose={() => setOwnerModalBusiness(null)}
          onOwnerCountChanged={loadBusinesses}
          onToast={showToast}
        />
      )}
    </div>
  );
}