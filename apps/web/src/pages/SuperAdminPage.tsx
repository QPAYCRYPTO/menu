// apps/web/src/pages/SuperAdminPage.tsx
// CHANGELOG v2:
// - Toast komponentine geçti
// - Mobil uyumlu: header collapse, masaüstü tablo + mobil kart layout
// - Modal'lar mobile sığacak şekilde optimize

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { useThemedPage } from '../lib/theme';
import {
  Business,
  listBusinesses,
  createBusiness as apiCreateBusiness,
  toggleBusinessActive,
  resetAdminPassword as apiResetAdminPassword,
  toggleWaiterModule as apiToggleWaiterModule,
  toggleKitchenModule as apiToggleKitchenModule
} from '../api/superadminApi';
import { OwnerManagementModal } from './superadmin/OwnerManagementModal';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import {
  Building2, RefreshCw, TriangleAlert, KeyRound, X, Menu, ClipboardList, User, CircleCheck, Circle,
  Mail, Folder, ShoppingCart, Eye, EyeOff
} from 'lucide-react';

// Warm glass rozet/buton stilleri (semantik tokenlar)
// Durum rozetleri (gece/gündüz uyumlu)
const BADGE_SUCCESS: React.CSSProperties = { background: 'var(--state-ok-bg)', color: 'var(--state-ok)', border: '1px solid transparent' };
const BADGE_WARNING: React.CSSProperties = { background: 'var(--state-warn-bg)', color: 'var(--state-warn)', border: '1px solid transparent' };
const BADGE_DANGER: React.CSSProperties = { background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1px solid transparent' };
// Modül (feature flag) düğmeleri: açık = petrol dolgu, kapalı = yüzey + çerçeve
const FLAG_ON: React.CSSProperties = { background: 'var(--brand)', color: 'var(--on-brand)', border: '1px solid transparent' };
const FLAG_OFF: React.CSSProperties = { background: 'var(--surface)', color: 'var(--ink-muted)', border: '1px solid var(--line)' };

export function SuperAdminPage() {
  useThemedPage();
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

  async function toggleKitchen(business: Business) {
    if (!accessToken) return;
    try {
      await apiToggleKitchenModule(accessToken, business.id, !business.kitchen_module_enabled);
      showToast(business.kitchen_module_enabled ? 'Mutfak modülü kapatıldı.' : 'Mutfak modülü açıldı.', 'success');
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
    <div className="min-h-screen bg-page text-ink">
      <Toast state={toast} />

      {/* HEADER — Responsive */}
      <div className="sticky top-0 z-30 px-3 md:px-6 pt-3 bg-page">
        <div className="ui-card max-w-7xl mx-auto rounded-3xl px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Logo + başlık */}
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-brand text-on-brand">
                <Building2 className="w-4 h-4 md:w-[18px] md:h-[18px]" />
              </div>
              <div className="min-w-0">
                <h1 className="font-serif font-bold text-base md:text-xl truncate text-ink">
                  Atlas Super Admin
                </h1>
                <p className="ui-eyebrow hidden sm:block">{businesses.length} işletme kayıtlı</p>
              </div>
            </div>

            {/* Desktop butonlar */}
            <div className="hidden md:flex gap-2 flex-shrink-0">
              <ThemeToggle />
              <button onClick={loadBusinesses} className="btn-outline px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1.5"><RefreshCw size={14} />Yenile</button>
              <button onClick={() => navigate('/superadmin/errors')} className="px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1.5" style={BADGE_DANGER}><TriangleAlert size={14} />Hatalar</button>
              <button onClick={() => setShowResetModal(true)} className="px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1.5" style={BADGE_WARNING}><KeyRound size={14} />Admin Şifre</button>
              <button onClick={() => setShowNewModal(true)} className="btn-primary px-3 py-2 rounded-xl text-sm font-bold spring-btn">+ Yeni</button>
              <button onClick={() => { logout(); navigate('/login'); }} className="px-3 py-2 rounded-xl text-sm font-semibold spring-btn" style={BADGE_DANGER}>Çıkış</button>
            </div>

            {/* Mobil: tema + hamburger */}
            <div className="md:hidden flex items-center gap-2"><ThemeToggle /></div>
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="ui-chip md:hidden w-9 h-9 rounded-xl flex items-center justify-center spring-btn" aria-label="Menü">
              {menuOpen ? <X size={14} /> : <Menu size={14} />}
            </button>
          </div>

          {/* Mobil menu drawer */}
          {menuOpen && (
            <div className="md:hidden mt-3 pt-3 border-t border-line flex flex-col gap-2 fade-enter">
              <button onClick={() => { loadBusinesses(); setMenuOpen(false); }}
                className="ui-chip px-3 py-2.5 rounded-xl text-sm font-semibold text-left flex items-center gap-2">
                <RefreshCw size={14} />Yenile
              </button>
              <button onClick={() => { navigate('/superadmin/errors'); setMenuOpen(false); }}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-left flex items-center gap-2" style={BADGE_DANGER}>
                <TriangleAlert size={14} />Hata Logu
              </button>
              <button onClick={() => { setShowResetModal(true); setMenuOpen(false); }}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-left flex items-center gap-2" style={BADGE_WARNING}>
                <KeyRound size={14} />Admin Şifre Sıfırla
              </button>
              <button onClick={() => { setShowNewModal(true); setMenuOpen(false); }}
                className="btn-primary px-3 py-2.5 rounded-xl text-sm font-bold text-left">
                + Yeni İşletme
              </button>
              <button onClick={() => { logout(); navigate('/login'); }}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-left" style={BADGE_DANGER}>
                Çıkış Yap
              </button>
            </div>
          )}
        </div>
      </div>

      {/* İSTATİSTİK KARTLARI - Responsive grid */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-4 md:pt-6">
        <div className="grid gap-3 mb-4 md:mb-6"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <div className="ui-card rounded-2xl md:rounded-3xl p-3 md:p-4">
            <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-ink-muted">Toplam İşletme</div>
            <div className="font-serif text-xl md:text-2xl font-bold text-ink">{businesses.length}</div>
          </div>
          <div className="ui-card rounded-2xl md:rounded-3xl p-3 md:p-4">
            <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-ink-muted">Aktif</div>
            <div className="font-serif text-xl md:text-2xl font-bold" style={{ color: 'var(--state-ok)' }}>{businesses.filter(b => b.is_active).length}</div>
          </div>
          <div className="ui-card rounded-2xl md:rounded-3xl p-3 md:p-4">
            <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-ink-muted">Pasif</div>
            <div className="font-serif text-xl md:text-2xl font-bold" style={{ color: 'var(--state-danger)' }}>{businesses.filter(b => !b.is_active).length}</div>
          </div>
          <div className="ui-card rounded-2xl md:rounded-3xl p-3 md:p-4">
            <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-ink-muted">Toplam Owner</div>
            <div className="font-serif text-xl md:text-2xl font-bold" style={{ color: 'var(--accent)' }}>
              {businesses.reduce((sum, b) => sum + Number(b.owner_count), 0)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3 px-1">
          <h2 className="font-serif font-bold text-base text-ink flex items-center gap-2"><ClipboardList size={16} />İşletmeler</h2>
          <div className="flex-1 h-px bg-surface-2" />
        </div>

        {/* DESKTOP — Tablo görünümü */}
        <div className="hidden lg:block ui-card rounded-3xl overflow-hidden mb-8">
          <div className="grid items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted border-b border-line"
            style={{ gridTemplateColumns: '2fr 1.5fr 2fr 1fr 1fr 1fr 1.2fr 1.2fr 1.5fr', background: 'var(--surface-2)' }}>
            <div>İşletme</div><div>Slug</div><div>Admin E-posta</div>
            <div className="text-center">Owner</div><div className="text-center">Kat.</div><div className="text-center">Ürün</div>
            <div className="text-center">Garson</div>
            <div className="text-center">Mutfak</div>
            <div className="text-right">İşlem</div>
          </div>

          {businesses.map(b => (
            <div key={b.id} className="grid items-center gap-3 px-4 py-3 text-sm border-b border-line bg-surface hover:bg-surface-2 transition-colors"
              style={{ gridTemplateColumns: '2fr 1.5fr 2fr 1fr 1fr 1fr 1.2fr 1.2fr 1.5fr', background: b.is_active ? undefined : 'var(--state-danger-bg)' }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={b.is_active ? { background: 'var(--brand)', color: 'var(--on-brand)' } : { background: 'var(--surface-2)', color: 'var(--ink-muted)' }}>
                  {b.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="font-semibold truncate text-ink">{b.name}</div>
                  <div className="text-xs" style={{ color: b.is_active ? 'var(--state-ok)' : 'var(--state-danger)' }}><span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 align-middle" />{b.is_active ? 'Aktif' : 'Pasif'}</div>
                </div>
              </div>
              <div>
                <a href={`https://www.atlasqrmenu.com/m/${b.slug}`} target="_blank" rel="noreferrer"
                  className="text-xs font-mono truncate block text-accent hover:text-accent">/{b.slug}</a>
              </div>
              <div className="text-xs truncate text-ink-muted">{b.admin_email || '-'}</div>

              <div className="text-center">
                <button onClick={() => setOwnerModalBusiness(b)}
                  className="px-2 py-1 rounded-lg text-xs font-bold spring-btn inline-flex items-center gap-1"
                  style={b.owner_count > 0 ? BADGE_SUCCESS : BADGE_WARNING}
                  title="Owner yönetimi">
                  <User size={12} />{b.owner_count}
                </button>
              </div>

              <div className="text-center font-semibold text-ink">{b.category_count}</div>
              <div className="text-center font-semibold text-ink">{b.product_count}</div>

              <div className="text-center">
                <button onClick={() => toggleWaiter(b)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold spring-btn inline-flex items-center gap-1"
                  style={b.waiter_module_enabled ? FLAG_ON : FLAG_OFF}
                  title={b.waiter_module_enabled ? 'Garson modülü AÇIK' : 'Garson modülü KAPALI'}>
                  {b.waiter_module_enabled ? <><CircleCheck size={12} />Açık</> : <><Circle size={12} />Kapalı</>}
                </button>
              </div>

              <div className="text-center">
                <button onClick={() => toggleKitchen(b)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold spring-btn inline-flex items-center gap-1"
                  style={b.kitchen_module_enabled ? FLAG_ON : FLAG_OFF}
                  title={b.kitchen_module_enabled ? 'Mutfak modülü AÇIK' : 'Mutfak modülü KAPALI'}>
                  {b.kitchen_module_enabled ? <><CircleCheck size={12} />Açık</> : <><Circle size={12} />Kapalı</>}
                </button>
              </div>

              <div className="flex justify-end">
                <button onClick={() => toggleActive(b)} className="px-3 py-1.5 rounded-lg text-xs font-semibold spring-btn"
                  style={b.is_active ? BADGE_DANGER : BADGE_SUCCESS}>
                  {b.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                </button>
              </div>
            </div>
          ))}

          {businesses.length === 0 && (
            <div className="text-center py-16">
              <div className="mb-3 flex justify-center"><Building2 size={36} className="text-ink-muted" /></div>
              <p className="text-sm text-ink-muted">Henüz işletme yok</p>
            </div>
          )}
        </div>

        {/* MOBİL & TABLET — Kart görünümü */}
        <div className="lg:hidden flex flex-col gap-3 mb-8">
          {businesses.length === 0 && (
            <div className="ui-card text-center py-16 rounded-3xl">
              <div className="mb-3 flex justify-center"><Building2 size={36} className="text-ink-muted" /></div>
              <p className="text-sm text-ink-muted">Henüz işletme yok</p>
            </div>
          )}

          {businesses.map(b => (
            <div key={b.id} className="ui-card rounded-3xl p-4"
              style={b.is_active ? undefined : { background: 'var(--state-danger-bg)', borderColor: 'var(--state-danger)' }}>

              {/* Üst: Avatar + İsim + Durum */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={b.is_active ? { background: 'var(--brand)', color: 'var(--on-brand)' } : { background: 'var(--surface-2)', color: 'var(--ink-muted)' }}>
                  {b.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif font-bold text-sm text-ink">{b.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: b.is_active ? 'var(--state-ok)' : 'var(--state-danger)' }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 align-middle" />{b.is_active ? 'Aktif' : 'Pasif'}
                  </div>
                  <a href={`https://www.atlasqrmenu.com/m/${b.slug}`} target="_blank" rel="noreferrer"
                    className="text-xs font-mono block mt-1 truncate text-accent">
                    /{b.slug}
                  </a>
                  {b.admin_email && (
                    <div className="text-xs mt-1 truncate text-ink-muted"><Mail size={12} className="inline-block align-[-2px] mr-1" />{b.admin_email}</div>
                  )}
                </div>
              </div>

              {/* Sayılar grid */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button onClick={() => setOwnerModalBusiness(b)}
                  className="px-2 py-2 rounded-xl text-xs font-bold flex flex-col items-center spring-btn"
                  style={b.owner_count > 0 ? BADGE_SUCCESS : BADGE_WARNING}>
                  <span className="inline-flex items-center gap-1"><User size={12} />{b.owner_count}</span>
                  <span className="text-[10px] font-medium opacity-75">Owner</span>
                </button>
                <div className="px-2 py-2 rounded-xl text-xs font-bold flex flex-col items-center bg-surface-2 border border-line text-ink">
                  <span className="inline-flex items-center gap-1"><Folder size={12} />{b.category_count}</span>
                  <span className="text-[10px] font-medium opacity-75">Kategori</span>
                </div>
                <div className="px-2 py-2 rounded-xl text-xs font-bold flex flex-col items-center bg-surface-2 border border-line text-ink">
                  <span className="inline-flex items-center gap-1"><ShoppingCart size={12} />{b.product_count}</span>
                  <span className="text-[10px] font-medium opacity-75">Ürün</span>
                </div>
              </div>

              {/* Aksiyonlar */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => toggleWaiter(b)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold spring-btn inline-flex items-center justify-center gap-1"
                  style={b.waiter_module_enabled ? FLAG_ON : FLAG_OFF}>
                  {b.waiter_module_enabled ? <><CircleCheck size={12} />Garson Açık</> : <><Circle size={12} />Garson Kapalı</>}
                </button>
                <button onClick={() => toggleKitchen(b)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold spring-btn inline-flex items-center justify-center gap-1"
                  style={b.kitchen_module_enabled ? FLAG_ON : FLAG_OFF}>
                  {b.kitchen_module_enabled ? <><CircleCheck size={12} />Mutfak Açık</> : <><Circle size={12} />Mutfak Kapalı</>}
                </button>
                <button onClick={() => toggleActive(b)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold spring-btn"
                  style={b.is_active ? BADGE_DANGER : BADGE_SUCCESS}>
                  {b.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* YENİ İŞLETME MODAL — mobile uyumlu */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 ui-scrim fade-enter">
          <div className="ui-card w-full max-w-lg rounded-3xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="px-5 md:px-6 py-4 flex items-center justify-between flex-shrink-0 border-b border-line">
              <h2 className="font-serif font-bold text-lg text-ink">Yeni İşletme Ekle</h2>
              <button onClick={() => { setShowNewModal(false); setFieldErrors({}); }}
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn" aria-label="Kapat">
                <X size={12} />
              </button>
            </div>
            <div className="p-5 md:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">İşletme Adı</label>
                <input value={newForm.business_name} onChange={(e) => setNewForm(p => ({ ...p, business_name: e.target.value }))}
                  placeholder="Örn: Harika Kafe" className="ui-input w-full px-4 py-2.5 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Slug (Menü URL'i)</label>
                <input value={newForm.slug} onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="Örn: harika-kafe" className="ui-input w-full px-4 py-2.5 rounded-xl text-sm"
                  style={fieldErrors.slug ? { borderColor: 'var(--state-danger)' } : undefined} />
                {fieldErrors.slug && <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: 'var(--state-danger)' }}><TriangleAlert size={12} />{fieldErrors.slug}</p>}
                {newForm.slug && !fieldErrors.slug && <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: 'var(--state-ok)' }}><CircleCheck size={12} />Menü: <span className="font-mono">/m/{newForm.slug}</span></p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Admin E-posta</label>
                <input type="email" value={newForm.email} onChange={(e) => setNewForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="admin@kafe.com" className="ui-input w-full px-4 py-2.5 rounded-xl text-sm"
                  style={fieldErrors.email ? { borderColor: 'var(--state-danger)' } : undefined} />
                {fieldErrors.email && <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: 'var(--state-danger)' }}><TriangleAlert size={12} />{fieldErrors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Şifre</label>
                <div style={{ position: 'relative' }}>
                  <input type={showNewPassword ? 'text' : 'password'} value={newForm.password}
                    onChange={(e) => setNewForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 8 karakter" className="ui-input w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{ ...(fieldErrors.password ? { borderColor: 'var(--state-danger)' } : {}), paddingRight: 44, boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? 'Şifreyi gizle' : 'Şifreyi göster'} className="flex items-center text-ink-muted hover:text-ink"
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs mt-1 font-medium flex items-center gap-1" style={{ color: 'var(--state-danger)' }}><TriangleAlert size={12} />{fieldErrors.password}</p>}
              </div>
            </div>
            <div className="px-5 md:px-6 py-4 flex gap-3 flex-shrink-0 border-t border-line">
              <button onClick={() => { setShowNewModal(false); setFieldErrors({}); }}
                className="ui-chip flex-1 py-2.5 rounded-xl text-sm font-semibold spring-btn">İptal</button>
              <button onClick={createBusiness} disabled={loading}
                className="btn-primary flex-1 py-2.5 rounded-xl text-sm font-bold spring-btn">
                {loading ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN ŞİFRE SIFIRLA MODAL — mobile uyumlu */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 ui-scrim fade-enter">
          <div className="ui-card w-full max-w-md rounded-3xl overflow-hidden">
            <div className="px-5 md:px-6 py-4 flex items-center justify-between border-b border-line">
              <h2 className="font-serif font-bold text-lg text-ink flex items-center gap-2"><KeyRound size={18} />Admin Şifre Sıfırla</h2>
              <button onClick={() => setShowResetModal(false)}
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn" aria-label="Kapat">
                <X size={12} />
              </button>
            </div>
            <div className="p-5 md:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">İşletme Seç</label>
                <select value={resetForm.businessId} onChange={(e) => setResetForm(p => ({ ...p, businessId: e.target.value }))}
                  className="ui-input w-full px-4 py-2.5 rounded-xl text-sm">
                  <option value="">Seçin</option>
                  {businesses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.admin_email})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Yeni Şifre</label>
                <div style={{ position: 'relative' }}>
                  <input type={showResetPassword ? 'text' : 'password'} value={resetForm.new_password}
                    onChange={(e) => setResetForm(p => ({ ...p, new_password: e.target.value }))}
                    placeholder="Min 8 karakter" className="ui-input w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{ paddingRight: 44, boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowResetPassword(!showResetPassword)}
                    aria-label={showResetPassword ? 'Şifreyi gizle' : 'Şifreyi göster'} className="flex items-center text-ink-muted hover:text-ink"
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>
                    {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-5 md:px-6 py-4 flex gap-3 border-t border-line">
              <button onClick={() => setShowResetModal(false)}
                className="ui-chip flex-1 py-2.5 rounded-xl text-sm font-semibold spring-btn">İptal</button>
              <button onClick={resetAdminPassword}
                className="btn-primary flex-1 py-2.5 rounded-xl text-sm font-bold spring-btn">Şifreyi Güncelle</button>
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
