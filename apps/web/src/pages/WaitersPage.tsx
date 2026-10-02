// apps/web/src/pages/WaitersPage.tsx
// Personel (eski adıyla Garsonlar). Her personelin serbest yazılan bir ünvanı olabilir (Garson, Komi, Şef…);
// ünvan yalnızca etikettir — yetkiler ayrıca seçilir.
// CHANGELOG v4:
// - Browser confirm() yerine ortak ConfirmModal komponenti
// - Garson silme özel modal'ı kaldırıldı, ConfirmModal'a geçti

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Waiter,
  WaiterPermissions,
  WaiterStatus,
  WaiterTokenResponse,
  DEFAULT_PERMISSIONS,
  PERMISSION_TEMPLATES,
  listWaiters,
  createWaiter as apiCreateWaiter,
  updateWaiter as apiUpdateWaiter,
  setWaiterPassword as apiSetPassword,
  setWaiterStatus as apiSetStatus,
  deleteWaiter as apiDeleteWaiter,
  generateWaiterToken as apiGenerateToken,
  listWaiterSessions,
  revokeWaiterSession
} from '../api/waiterAdminApi';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import {
  Ban, Check, CircleCheck, Clock, Copy, KeyRound, Mail, MessageCircle, Pencil, Phone, QrCode, Trash2, TriangleAlert, UserPlus, Users, X, type LucideIcon
} from 'lucide-react';
import { ConfirmModal, type ConfirmState } from '../components/ConfirmModal';
import { LocalQrImage } from '../components/LocalQrImage';
import { Select } from '../components/Select';

const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://www.atlasqrmenu.com';
const DURATION_OPTIONS = [1, 2, 4, 6, 8, 10, 12];
/** Ünvan için hızlı seçimler — admin istediğini de yazabilir */
const TITLE_SUGGESTIONS = ['Garson', 'Komi', 'Şef', 'Aşçı', 'Barista', 'Kasiyer', 'Müdür'];

const PERMISSION_LABELS: Record<keyof WaiterPermissions, { label: string; desc: string }> = {
  can_refund: { label: 'İade yapabilir', desc: 'Mutfak başladıktan sonra (Hazırlanıyor / Hazır) iptal ve adet azaltma doğrudan uygulanır. Kapalıysa admin onayına düşer. Mutfak başlamadan iptal herkese serbesttir.' },
  can_see_other_tables: { label: 'Başkasının masasını görebilir', desc: 'Başka personelin açtığı masaları listede ve detayda görür' },
  can_edit_other_tables: { label: 'Başkasının masasında işlem yapabilir', desc: 'Başka personelin masasına sipariş ekler, adet değiştirir, iptal eder, taşır' },
  can_transfer_table: { label: 'Masa taşıyabilir', desc: 'Adisyonu başka bir boş masaya taşır' },
  can_merge_tables: { label: 'Masa birleştirip ayırabilir', desc: 'İki masayı tek adisyon yapar veya ayırır' },
  can_use_break: { label: 'Mola kullanabilir', desc: 'Profilinden süre seçip molaya çıkar' }
};

function whatsappLink(phone: string, loginUrl: string, waiterName: string, businessName: string) {
  const message = `Merhaba ${waiterName}, ${businessName} sistem girişin için link:\n${loginUrl}`;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

// ── Garson satırı görsel yardımcıları (lucide ikon rozetleri) ──
const ACTION_BTN = 'h-11 rounded-2xl flex items-center border spring-btn transition-colors bg-surface border-line hover:bg-surface-2';

// Durum renkleri tema değişkenlerinden (gece/gündüz okunur)
const WAITER_STATUS: Record<WaiterStatus, { label: string; color: string; icon: LucideIcon }> = {
  active:   { label: 'Aktif',  color: 'var(--state-ok)', icon: Check },
  on_leave: { label: 'İzinli', color: 'var(--state-warn)', icon: Clock },
  inactive: { label: 'Pasif',  color: 'var(--state-danger)', icon: Ban }
};

/** Rengin saydam tonu — hex ve var(--…) ile çalışır */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Sade işlem ikonu (Atölye ikon dili): tek renk, ince çizgi. Renk yalnızca anlam taşıyorsa verilir (sil = kırmızı). */
function IconBadge({ icon: Icon, color = 'currentColor' }: { icon: LucideIcon; color?: string }) {
  return (
    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ color }}>
      <Icon size={18} strokeWidth={1.5} />
    </span>
  );
}

export function WaitersPage() {
  const { accessToken } = useAuth();

  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [loading, setLoading] = useState(false);

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [formData, setFormData] = useState({
    name: '', title: '', phone: '', email: '', password: '',
    permissions: { ...DEFAULT_PERMISSIONS } as WaiterPermissions
  });
  const [editingWaiter, setEditingWaiter] = useState<Waiter | null>(null);

  const [passwordModalWaiter, setPasswordModalWaiter] = useState<Waiter | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  const [tokenModalWaiter, setTokenModalWaiter] = useState<Waiter | null>(null);
  const [selectedHours, setSelectedHours] = useState(8);

  const [qrResult, setQrResult] = useState<WaiterTokenResponse | null>(null);

  useEffect(() => {
    if (accessToken) loadWaiters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Panel kısayolu: /admin/waiters?yeni=1 → "Personel Ekle" formu açılır
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('yeni') !== '1') return;
    openCreateForm();
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('yeni'); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  async function loadWaiters() {
    if (!accessToken) return;
    try {
      const data = await listWaiters(accessToken);
      setWaiters(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Personel listesi alınamadı.', 'error');
    }
  }

  function openCreateForm() {
    setFormMode('create');
    setEditingWaiter(null);
    setFormData({ name: '', title: '', phone: '', email: '', password: '', permissions: { ...DEFAULT_PERMISSIONS } });
  }

  function openEditForm(w: Waiter) {
    setFormMode('edit');
    setEditingWaiter(w);
    setFormData({
      name: w.name,
      title: w.title ?? '',
      phone: w.phone ?? '',
      email: w.email ?? '',
      password: '',
      permissions: { ...w.permissions }
    });
  }

  function closeForm() {
    setFormMode(null);
    setEditingWaiter(null);
  }

  async function handleSave() {
    if (!accessToken) return;
    if (!formData.name.trim()) { showToast('Ad Soyad boş olamaz.', 'error'); return; }
    if (formMode === 'create' && formData.email.trim() && !formData.password) {
      showToast('Email girdiyseniz şifre de belirlemelisiniz.', 'error'); return;
    }
    if (formData.password && formData.password.length < 8) {
      showToast('Şifre en az 8 karakter olmalı.', 'error'); return;
    }

    setLoading(true);
    try {
      if (formMode === 'create') {
        await apiCreateWaiter(accessToken, {
          name: formData.name.trim(),
          title: formData.title.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          password: formData.password || undefined,
          permissions: formData.permissions
        });
        showToast('Personel eklendi.', 'success');
      } else if (editingWaiter) {
        await apiUpdateWaiter(accessToken, editingWaiter.id, {
          name: formData.name.trim(),
          title: formData.title.trim() || null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          permissions: formData.permissions
        });
        showToast('Personel güncellendi.', 'success');
      }
      closeForm();
      await loadWaiters();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(waiter: Waiter, newStatus: WaiterStatus) {
    if (!accessToken) return;
    try {
      await apiSetStatus(accessToken, waiter.id, newStatus);
      const statusLabel = newStatus === 'active' ? 'Aktif' : newStatus === 'on_leave' ? 'İzinli' : 'Pasif';
      showToast(`${waiter.name} ${statusLabel.toLowerCase()} yapıldı.`, 'success');
      await loadWaiters();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata.', 'error');
    }
  }

  async function handleSetPassword() {
    if (!accessToken || !passwordModalWaiter) return;
    if (newPasswordValue.length < 8) {
      showToast('Şifre en az 8 karakter olmalı.', 'error'); return;
    }
    try {
      await apiSetPassword(accessToken, passwordModalWaiter.id, newPasswordValue);
      showToast('Şifre güncellendi.', 'success');
      setPasswordModalWaiter(null);
      setNewPasswordValue('');
      await loadWaiters();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata.', 'error');
    }
  }

  async function handleGenerateToken() {
    if (!accessToken || !tokenModalWaiter) return;
    try {
      const result = await apiGenerateToken(accessToken, tokenModalWaiter.id, selectedHours);
      setTokenModalWaiter(null);
      setQrResult(result);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata.', 'error');
    }
  }

  // YENİ: Browser confirm() kaldırıldı, ConfirmModal kullanılıyor (warning tonu)
  function askRevokeActiveSessions(waiter: Waiter) {
    setConfirm({
      title: 'QR Oturumlarını İptal Et?',
      message: <><strong>{waiter.name}</strong> için aktif tüm QR oturumları kapatılacak. Tekrar QR ile girmesi için yeni QR oluşturmanız gerekir.</>,
      confirmText: 'Evet, İptal Et',
      tone: 'warning',
      onConfirm: async () => {
        if (!accessToken) return;
        try {
          const sessions = await listWaiterSessions(accessToken, waiter.id);
          for (const s of sessions) {
            await revokeWaiterSession(accessToken, s.id);
          }
          showToast(`${sessions.length} oturum iptal edildi.`, 'success');
        } catch (e) {
          showToast(e instanceof Error ? e.message : 'Hata.', 'error');
          throw e;
        }
      }
    });
  }

  // YENİ: Eski deleteConfirmWaiter modal'ı kaldırıldı, ConfirmModal'a geçti
  function askDeleteWaiter(waiter: Waiter) {
    setConfirm({
      title: 'Personeli Sil?',
      message: (
        <>
          <strong>{waiter.name}</strong> silinecek ve listeden kaldırılacak. Açık oturumları kapanır.<br/>
          Geçmiş siparişlerdeki kayıtları korunur. İpucu: geçici ayrılıklar için "Pasif" veya "İzinli" durumunu kullanabilirsiniz.
        </>
      ),
      confirmText: 'Evet, Sil',
      tone: 'danger',
      onConfirm: async () => {
        if (!accessToken) return;
        try {
          await apiDeleteWaiter(accessToken, waiter.id);
          showToast('Personel silindi.', 'success');
          await loadWaiters();
        } catch (e) {
          showToast(e instanceof Error ? e.message : 'Hata.', 'error');
          throw e;
        }
      }
    });
  }

  function waiterLoginUrl(token: string): string {
    return `${PUBLIC_BASE_URL}/g/${encodeURIComponent(token)}`;
  }

  function statusBadge(status: WaiterStatus) {
    const config = WAITER_STATUS[status];
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
        style={{ background: tint(config.color, 12), color: config.color, borderColor: tint(config.color, 30) }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: config.color }} aria-hidden="true" />{config.label}
      </span>
    );
  }

  const activeCount = waiters.filter(w => w.status === 'active').length;

  return (
    <div className="text-ink">
      <Toast state={toast} />
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />

      {/* Başlık kartı */}
      <div className="ui-card rounded-[28px] p-5 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-surface-2 border border-line text-ink">
            <Users size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Personel</h1>
            <p className="text-xs text-ink-muted font-medium">
              {waiters.length} kişi kayıtlı • {activeCount} aktif
            </p>
          </div>
        </div>
        <button onClick={openCreateForm}
          className="btn-primary px-5 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-2 spring-btn">
          <UserPlus size={16} /> Personel Ekle
        </button>
      </div>

      <div className="ui-card rounded-[32px] p-3 md:p-5 space-y-3">
        {waiters.length === 0 && (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-surface-2 border border-line text-ink-muted">
              <Users size={26} />
            </div>
            <p className="text-sm text-ink-muted">Henüz personel eklenmedi</p>
            <button onClick={openCreateForm}
              className="btn-primary mt-4 px-4 py-2 rounded-2xl text-sm font-bold spring-btn">
              İlk Personeli Ekle
            </button>
          </div>
        )}

        {waiters.map(w => {
          const status = WAITER_STATUS[w.status];
          const StatusIcon = status.icon;
          return (
            <div key={w.id}
              className={`rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-line transition-colors ${
                w.status === 'active' ? 'bg-surface hover:bg-surface-2' : 'bg-surface-2'}`}>

              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-serif font-bold text-lg flex-shrink-0 bg-surface-2 border border-line text-ink"
                  style={{ opacity: w.status === 'active' ? 1 : 0.6 }}>
                  {w.name.charAt(0).toLocaleUpperCase('tr')}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold truncate">{w.name}</h3>
                    {w.title && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-2 border border-line text-ink">
                        {w.title}
                      </span>
                    )}
                    {statusBadge(w.status)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-ink-muted">
                    {w.phone && <span className="flex items-center gap-1"><Phone size={12} className="text-ink-muted" /> {w.phone}</span>}
                    {w.phone && w.email && <span className="text-ink-muted">•</span>}
                    {w.email && <span className="flex items-center gap-1 truncate"><Mail size={12} className="text-ink-muted" /> {w.email}</span>}
                  </div>
                </div>
              </div>

              {/* Aksiyon rozetleri */}
              <div className="flex items-center gap-2 flex-wrap">
                {w.status === 'active' && (
                  <>
                    <button onClick={() => setTokenModalWaiter(w)}
                      title="QR giriş kodu" aria-label="QR giriş kodu"
                      className={`${ACTION_BTN} px-3.5 gap-2`}>
                      <IconBadge icon={QrCode} />
                      <span className="text-xs font-bold">QR</span>
                    </button>
                    <button onClick={() => askRevokeActiveSessions(w)}
                      title="Aktif QR'ları iptal et" aria-label="Aktif QR'ları iptal et"
                      className={`${ACTION_BTN} w-11 justify-center`}>
                      <IconBadge icon={Ban} />
                    </button>
                  </>
                )}
                <button onClick={() => openEditForm(w)}
                  title="Düzenle" aria-label="Düzenle"
                  className={`${ACTION_BTN} w-11 justify-center`}>
                  <IconBadge icon={Pencil} />
                </button>
                <button onClick={() => { setPasswordModalWaiter(w); setNewPasswordValue(''); }}
                  title="Şifre belirle/sıfırla" aria-label="Şifre belirle/sıfırla"
                  className={`${ACTION_BTN} w-11 justify-center`}>
                  <IconBadge icon={KeyRound} />
                </button>
                <label className={`${ACTION_BTN} px-3 gap-2 cursor-pointer`} title="Durum">
                  <IconBadge icon={StatusIcon} color={status.color} />
                  <Select
                    value={w.status}
                    onChange={v => handleStatusChange(w, v)}
                    ariaLabel="Durum"
                    className="bg-transparent text-xs font-bold focus:outline-none pr-1"
                    style={{ color: status.color }}
                    options={(Object.keys(WAITER_STATUS) as WaiterStatus[]).map(k => ({ value: k, label: WAITER_STATUS[k].label }))} />
                </label>
                <button onClick={() => askDeleteWaiter(w)}
                  title="Sil" aria-label="Sil"
                  className={`${ACTION_BTN} w-11 justify-center`}>
                  <IconBadge icon={Trash2} color="var(--state-danger)" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* YENİ/DÜZENLE FORM MODAL */}
      {formMode !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ui-scrim fade-enter">
          <div className="ui-card w-full max-w-lg rounded-3xl overflow-hidden my-8">
            <div className="px-6 py-4 flex items-center justify-between border-b border-line">
              <h2 className="font-serif font-bold text-lg">
                {formMode === 'create' ? 'Personel Ekle' : `${editingWaiter?.name} — Düzenle`}
              </h2>
              <button onClick={closeForm} aria-label="Kapat"
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn">
                <X size={12} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
                  Ad Soyad <span style={{ color: 'var(--state-danger)' }}>*</span>
                </label>
                <input value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" />
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
                  Ünvan
                </label>
                <input value={formData.title} maxLength={40}
                  onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                  placeholder="Örn: Garson, Komi, Şef…"
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {TITLE_SUGGESTIONS.map(t => (
                    <button key={t} type="button" onClick={() => setFormData(p => ({ ...p, title: t }))}
                      className={`px-3 py-1 rounded-full text-xs font-semibold spring-btn ${
                        formData.title.trim().toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr') ? 'ui-chip-active' : 'ui-chip'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-1.5 text-ink-muted">
                  Rozet olarak görünür; istediğiniz ünvanı yazabilirsiniz. Yetkiler aşağıda ayrıca seçilir.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
                  Telefon (WhatsApp için)
                </label>
                <input value={formData.phone}
                  onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                  placeholder="0532 123 45 67"
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" />
                <p className="text-xs mt-1 text-ink-muted">
                  QR linkini WhatsApp'tan göndermek için
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
                  Email (opsiyonel)
                </label>
                <input type="email" value={formData.email}
                  onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                  placeholder="ahmet@kafe.com"
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" />
                <p className="text-xs mt-1 text-ink-muted">
                  Email verirseniz personel email+şifre ile de girebilir
                </p>
              </div>

              {formMode === 'create' && (
                <div>
                  <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
                    Şifre (email verdiyseniz zorunlu)
                  </label>
                  <input type="password" value={formData.password}
                    onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 8 karakter"
                    className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold mb-2 uppercase tracking-wider text-ink-muted">
                  Yetkiler
                </label>
                {/* Hazır şablonlar: yetkileri doldurur, sonra tek tek değiştirilebilir */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {PERMISSION_TEMPLATES.map(t => {
                    const active = (Object.keys(t.permissions) as (keyof WaiterPermissions)[])
                      .every(k => formData.permissions[k] === t.permissions[k]);
                    return (
                      <button key={t.key} type="button" title={t.desc}
                        onClick={() => setFormData(p => ({ ...p, permissions: { ...t.permissions } }))}
                        className={`px-2 py-2 rounded-2xl text-xs font-bold spring-btn ${active ? 'ui-chip-active' : 'ui-chip'}`}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-ink-muted mb-3">
                  Şablon seç, gerekirse aşağıdan değiştir. Sipariş almak, not yazmak, çağrı almak ve teslim etmek her personelde açıktır.
                </p>
                <div className="space-y-2">
                  {(Object.keys(PERMISSION_LABELS) as (keyof WaiterPermissions)[]).map(key => (
                    <label key={key}
                      className="ui-card flex items-start gap-3 p-3 rounded-2xl cursor-pointer">
                      <input type="checkbox"
                        checked={formData.permissions[key]}
                        onChange={(e) => setFormData(p => ({
                          ...p,
                          permissions: { ...p.permissions, [key]: e.target.checked }
                        }))}
                        className="mt-0.5"
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-ink">
                          {PERMISSION_LABELS[key].label}
                        </div>
                        <div className="text-xs mt-0.5 text-ink-muted">
                          {PERMISSION_LABELS[key].desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3 border-t border-line">
              <button onClick={closeForm}
                className="ui-chip flex-1 py-2.5 rounded-2xl text-sm font-semibold spring-btn">
                İptal
              </button>
              <button onClick={handleSave} disabled={loading}
                className="btn-primary flex-1 py-2.5 rounded-2xl text-sm font-bold spring-btn">
                {loading ? 'Kaydediliyor...' : (formMode === 'create' ? 'Ekle' : 'Kaydet')}
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordModalWaiter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ui-scrim fade-enter">
          <div className="ui-card w-full max-w-md rounded-3xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-line">
              <h2 className="font-serif font-bold text-lg flex items-center gap-2">
                <KeyRound size={18} className="flex-shrink-0" /> Şifre Belirle — {passwordModalWaiter.name}
              </h2>
              <button onClick={() => setPasswordModalWaiter(null)} aria-label="Kapat"
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 spring-btn">
                <X size={12} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
                  Yeni Şifre
                </label>
                <input type="password" value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Min 8 karakter"
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm"
                  autoFocus />
                {!passwordModalWaiter.email && (
                  <p className="text-xs mt-2 flex items-start gap-1.5" style={{ color: 'var(--state-warn)' }}>
                    <TriangleAlert size={12} className="flex-shrink-0 mt-0.5" /> <span>Bu personelin email'i yok. Şifreyle giriş için önce email eklemelisiniz.</span>
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3 border-t border-line">
              <button onClick={() => setPasswordModalWaiter(null)}
                className="ui-chip flex-1 py-2.5 rounded-2xl text-sm font-semibold spring-btn">
                İptal
              </button>
              <button onClick={handleSetPassword}
                className="btn-primary flex-1 py-2.5 rounded-2xl text-sm font-bold spring-btn">
                Şifreyi Güncelle
              </button>
            </div>
          </div>
        </div>
      )}

      {tokenModalWaiter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ui-scrim fade-enter">
          <div className="ui-card w-full max-w-md rounded-3xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-line">
              <h2 className="font-serif font-bold text-lg">
                QR Üret — {tokenModalWaiter.name}
              </h2>
              <button onClick={() => setTokenModalWaiter(null)} aria-label="Kapat"
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 spring-btn">
                <X size={12} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold mb-2 uppercase tracking-wider text-ink-muted">
                  Geçerlilik Süresi (saat)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map(h => (
                    <button key={h} onClick={() => setSelectedHours(h)}
                      className={`py-2.5 rounded-2xl text-sm font-semibold spring-btn ${selectedHours === h ? 'btn-primary font-bold' : 'ui-chip text-ink-muted'}`}>
                      {h} saat
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-3 text-ink-muted">
                  Yeni QR üretildiğinde eski QR'lar iptal olur.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3 border-t border-line">
              <button onClick={() => setTokenModalWaiter(null)}
                className="ui-chip flex-1 py-2.5 rounded-2xl text-sm font-semibold spring-btn">
                İptal
              </button>
              <button onClick={handleGenerateToken}
                className="btn-primary flex-1 py-2.5 rounded-2xl text-sm font-bold spring-btn">
                QR Üret
              </button>
            </div>
          </div>
        </div>
      )}

      {qrResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ui-scrim fade-enter">
          <div className="ui-card w-full max-w-md rounded-3xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-line">
              <h2 className="font-serif font-bold text-lg flex items-center gap-2">
                <CircleCheck size={18} className="flex-shrink-0" style={{ color: 'var(--state-ok)' }} /> {qrResult.waiter_name} için QR hazır
              </h2>
              <button onClick={() => setQrResult(null)} aria-label="Kapat"
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 spring-btn">
                <X size={12} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-white rounded-2xl p-4 flex items-center justify-center shadow-lg">
                <LocalQrImage value={waiterLoginUrl(qrResult.token)} />
              </div>

              <div className="p-3 rounded-2xl" style={{ background: 'var(--state-warn-bg)', border: '1px solid var(--state-warn)' }}>
                <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--state-warn)' }}>
                  <TriangleAlert size={12} className="flex-shrink-0 mt-0.5" /> <span>Bu QR sadece <b>{new Date(qrResult.expires_at).toLocaleString('tr-TR')}</b> tarihine kadar geçerli.</span>
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
                  Giriş Linki
                </label>
                <div className="flex gap-2">
                  <input readOnly value={waiterLoginUrl(qrResult.token)}
                    className="ui-input flex-1 min-w-0 px-3 py-2 rounded-2xl text-xs font-mono" />
                  <button onClick={() => {
                    navigator.clipboard.writeText(waiterLoginUrl(qrResult.token));
                    showToast('Link kopyalandı.', 'success');
                  }}
                    className="btn-primary px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 spring-btn">
                    <Copy size={12} /> Kopyala
                  </button>
                </div>
              </div>

              {qrResult.waiter_phone && (
                <a
                  href={whatsappLink(qrResult.waiter_phone, waiterLoginUrl(qrResult.token), qrResult.waiter_name, 'AtlasQR')}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 rounded-2xl text-sm font-bold text-center flex items-center justify-center gap-2 spring-btn no-underline"
                  style={{ background: '#25D366', color: '#073f46' }}>
                  <MessageCircle size={16} /> WhatsApp'tan Gönder ({qrResult.waiter_phone})
                </a>
              )}
            </div>
            <div className="px-6 py-4 border-t border-line">
              <button onClick={() => setQrResult(null)}
                className="ui-chip w-full py-2.5 rounded-2xl text-sm font-semibold spring-btn">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
