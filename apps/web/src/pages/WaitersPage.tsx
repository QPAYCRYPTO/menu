// apps/web/src/pages/WaitersPage.tsx
// CHANGELOG v4:
// - Browser confirm() yerine ortak ConfirmModal komponenti
// - Garson silme özel modal'ı kaldırıldı, ConfirmModal'a geçti

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  Waiter,
  WaiterPermissions,
  WaiterStatus,
  WaiterTokenResponse,
  DEFAULT_PERMISSIONS,
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
import { withAlpha } from '../lib/color';
import { ConfirmModal, type ConfirmState } from '../components/ConfirmModal';

const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://www.atlasqrmenu.com';
const DURATION_OPTIONS = [1, 2, 4, 6, 8, 10, 12];

const PERMISSION_LABELS: Record<keyof WaiterPermissions, { label: string; desc: string }> = {
  can_delete_items: { label: 'Sipariş silebilir', desc: 'Adisyondan ürün silebilir (admin onayına düşer)' },
  can_merge_tables: { label: 'Masa birleştirme/ayırma', desc: 'İki masayı tek adisyon yapabilir veya ayırabilir' },
  can_transfer_table: { label: 'Masa transferi', desc: 'Bir adisyonu başka bir masaya taşıyabilir' },
  can_see_other_tables: { label: 'Diğer masaları görebilir', desc: 'Başka garsonun açtığı masaları da görür' },
  can_add_note: { label: 'Adisyona not ekleyebilir', desc: 'Ürünlere not ekleyebilir (az pişmiş, soğansız vb.)' },
  can_use_break: { label: 'Mola/vardiya kullanabilir', desc: 'İşe giriş / mola / çıkış butonlarını kullanır' }
};

function whatsappLink(phone: string, loginUrl: string, waiterName: string, businessName: string) {
  const message = `Merhaba ${waiterName}, ${businessName} sistem girişin için link:\n${loginUrl}`;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

// ── Garson satırı görsel yardımcıları (lucide ikon rozetleri) ──
const ACTION_BTN = 'h-11 rounded-2xl flex items-center border spring-btn transition-colors bg-white/[0.06] border-white/10 hover:bg-white/[0.1] hover:border-white/20';

const WAITER_STATUS: Record<WaiterStatus, { label: string; color: string; icon: LucideIcon }> = {
  active:   { label: 'Aktif',  color: '#34D399', icon: Check },
  on_leave: { label: 'İzinli', color: '#FBBF24', icon: Clock },
  inactive: { label: 'Pasif',  color: '#FB7185', icon: Ban }
};

// Baş harf avatarı: isimden sabit renk (her render'da aynı)
const AVATAR_COLORS = ['#FB923C', '#FBBF24', '#C084FC', '#38BDF8', '#34D399', '#F472B6', '#818CF8'];
function avatarColorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function IconBadge({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: withAlpha(color, 0.15), color }}>
      <Icon size={16} />
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
    name: '', phone: '', email: '', password: '',
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

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  async function loadWaiters() {
    if (!accessToken) return;
    try {
      const data = await listWaiters(accessToken);
      setWaiters(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Garsonlar alınamadı.', 'error');
    }
  }

  function openCreateForm() {
    setFormMode('create');
    setEditingWaiter(null);
    setFormData({ name: '', phone: '', email: '', password: '', permissions: { ...DEFAULT_PERMISSIONS } });
  }

  function openEditForm(w: Waiter) {
    setFormMode('edit');
    setEditingWaiter(w);
    setFormData({
      name: w.name,
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
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          password: formData.password || undefined,
          permissions: formData.permissions
        });
        showToast('Garson eklendi.', 'success');
      } else if (editingWaiter) {
        await apiUpdateWaiter(accessToken, editingWaiter.id, {
          name: formData.name.trim(),
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          permissions: formData.permissions
        });
        showToast('Garson güncellendi.', 'success');
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
      message: <><strong>{waiter.name}</strong> için aktif tüm QR oturumları kapatılacak. Garson tekrar QR ile girmek için yeni QR oluşturmanız gerekir.</>,
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
      title: 'Garsonu Sil?',
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
          showToast('Garson silindi.', 'success');
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

  function qrImageUrl(token: string): string {
    const url = waiterLoginUrl(token);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
  }

  function statusBadge(status: WaiterStatus) {
    const config = WAITER_STATUS[status];
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
        style={{ background: withAlpha(config.color, 0.12), color: config.color, borderColor: withAlpha(config.color, 0.25) }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: config.color }} aria-hidden="true" />{config.label}
      </span>
    );
  }

  const activeCount = waiters.filter(w => w.status === 'active').length;

  return (
    <div className="text-white">
      <Toast state={toast} />
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />

      {/* Başlık kartı */}
      <div className="glass-dark rounded-[28px] p-5 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center border"
            style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)' }}>
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Garsonlar</h1>
            <p className="text-xs text-white/60 font-medium">
              {waiters.length} garson kayıtlı • {activeCount} aktif
            </p>
          </div>
        </div>
        <button onClick={openCreateForm}
          className="btn-accent px-5 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-2 spring-btn">
          <UserPlus size={16} /> Yeni Garson
        </button>
      </div>

      <div className="glass-dark rounded-[32px] p-3 md:p-5 space-y-3">
        {waiters.length === 0 && (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-white/5 border border-white/10 text-white/60">
              <Users size={26} />
            </div>
            <p className="text-sm text-white/70">Henüz garson eklenmedi</p>
            <button onClick={openCreateForm}
              className="btn-accent mt-4 px-4 py-2 rounded-2xl text-sm font-bold spring-btn">
              İlk Garsonu Ekle
            </button>
          </div>
        )}

        {waiters.map(w => {
          const avatarColor = avatarColorFor(w.name);
          const status = WAITER_STATUS[w.status];
          const StatusIcon = status.icon;
          return (
            <div key={w.id}
              className="rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border transition-colors"
              style={{
                background: w.status === 'active' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.22)',
                borderColor: 'rgba(255,255,255,0.07)'
              }}>

              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg flex-shrink-0 border"
                  style={{
                    background: `linear-gradient(135deg, ${withAlpha(avatarColor, 0.22)}, ${withAlpha(avatarColor, 0.08)})`,
                    borderColor: withAlpha(avatarColor, 0.35),
                    color: avatarColor,
                    opacity: w.status === 'active' ? 1 : 0.6
                  }}>
                  {w.name.charAt(0).toLocaleUpperCase('tr')}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold truncate">{w.name}</h3>
                    {statusBadge(w.status)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-white/60">
                    {w.phone && <span className="flex items-center gap-1"><Phone size={12} className="text-white/40" /> {w.phone}</span>}
                    {w.phone && w.email && <span className="text-white/30">•</span>}
                    {w.email && <span className="flex items-center gap-1 truncate"><Mail size={12} className="text-white/40" /> {w.email}</span>}
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
                      <IconBadge icon={QrCode} color="#34D399" />
                      <span className="text-xs font-bold" style={{ color: '#34D399' }}>QR</span>
                    </button>
                    <button onClick={() => askRevokeActiveSessions(w)}
                      title="Aktif QR'ları iptal et" aria-label="Aktif QR'ları iptal et"
                      className={`${ACTION_BTN} w-11 justify-center`}>
                      <IconBadge icon={Ban} color="#FBBF24" />
                    </button>
                  </>
                )}
                <button onClick={() => openEditForm(w)}
                  title="Düzenle" aria-label="Düzenle"
                  className={`${ACTION_BTN} w-11 justify-center`}>
                  <IconBadge icon={Pencil} color="#FB923C" />
                </button>
                <button onClick={() => { setPasswordModalWaiter(w); setNewPasswordValue(''); }}
                  title="Şifre belirle/sıfırla" aria-label="Şifre belirle/sıfırla"
                  className={`${ACTION_BTN} w-11 justify-center`}>
                  <IconBadge icon={KeyRound} color="#38BDF8" />
                </button>
                <label className={`${ACTION_BTN} px-3 gap-2 cursor-pointer`} title="Durum">
                  <IconBadge icon={StatusIcon} color={status.color} />
                  <select
                    value={w.status}
                    onChange={(e) => handleStatusChange(w, e.target.value as WaiterStatus)}
                    className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer pr-1"
                    style={{ color: status.color }}>
                    <option value="active">Aktif</option>
                    <option value="on_leave">İzinli</option>
                    <option value="inactive">Pasif</option>
                  </select>
                </label>
                <button onClick={() => askDeleteWaiter(w)}
                  title="Sil" aria-label="Sil"
                  className={`${ACTION_BTN} w-11 justify-center`}>
                  <IconBadge icon={Trash2} color="#FB7185" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* YENİ/DÜZENLE FORM MODAL */}
      {formMode !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-black/50 backdrop-blur-md fade-enter">
          <div className="glass-dark w-full max-w-lg rounded-3xl overflow-hidden my-8">
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/15">
              <h2 className="font-serif font-bold text-lg">
                {formMode === 'create' ? 'Yeni Garson Ekle' : `${editingWaiter?.name} — Düzenle`}
              </h2>
              <button onClick={closeForm} aria-label="Kapat"
                className="glass-pill w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn">
                <X size={12} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                  Ad Soyad <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="glass-input w-full px-4 py-2.5 rounded-2xl text-sm" />
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                  Telefon (WhatsApp için)
                </label>
                <input value={formData.phone}
                  onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                  placeholder="0532 123 45 67"
                  className="glass-input w-full px-4 py-2.5 rounded-2xl text-sm" />
                <p className="text-xs mt-1 text-white/55">
                  QR linkini WhatsApp'tan göndermek için
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                  Email (opsiyonel)
                </label>
                <input type="email" value={formData.email}
                  onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                  placeholder="ahmet@kafe.com"
                  className="glass-input w-full px-4 py-2.5 rounded-2xl text-sm" />
                <p className="text-xs mt-1 text-white/55">
                  Email verirseniz garson email+şifre ile de girebilir
                </p>
              </div>

              {formMode === 'create' && (
                <div>
                  <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                    Şifre (email verdiyseniz zorunlu)
                  </label>
                  <input type="password" value={formData.password}
                    onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 8 karakter"
                    className="glass-input w-full px-4 py-2.5 rounded-2xl text-sm" />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold mb-2 uppercase tracking-wider text-white/70">
                  Yetkiler
                </label>
                <div className="space-y-2">
                  {(Object.keys(PERMISSION_LABELS) as (keyof WaiterPermissions)[]).map(key => (
                    <label key={key}
                      className="glass-card flex items-start gap-3 p-3 rounded-2xl cursor-pointer">
                      <input type="checkbox"
                        checked={formData.permissions[key]}
                        onChange={(e) => setFormData(p => ({
                          ...p,
                          permissions: { ...p.permissions, [key]: e.target.checked }
                        }))}
                        className="mt-0.5"
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-white">
                          {PERMISSION_LABELS[key].label}
                        </div>
                        <div className="text-xs mt-0.5 text-white/65">
                          {PERMISSION_LABELS[key].desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3 border-t border-white/15">
              <button onClick={closeForm}
                className="glass-pill flex-1 py-2.5 rounded-2xl text-sm font-semibold spring-btn">
                İptal
              </button>
              <button onClick={handleSave} disabled={loading}
                className="btn-accent flex-1 py-2.5 rounded-2xl text-sm font-bold spring-btn">
                {loading ? 'Kaydediliyor...' : (formMode === 'create' ? 'Ekle' : 'Kaydet')}
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordModalWaiter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md fade-enter">
          <div className="glass-dark w-full max-w-md rounded-3xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/15">
              <h2 className="font-serif font-bold text-lg flex items-center gap-2">
                <KeyRound size={18} className="flex-shrink-0" /> Şifre Belirle — {passwordModalWaiter.name}
              </h2>
              <button onClick={() => setPasswordModalWaiter(null)} aria-label="Kapat"
                className="glass-pill w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 spring-btn">
                <X size={12} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                  Yeni Şifre
                </label>
                <input type="password" value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Min 8 karakter"
                  className="glass-input w-full px-4 py-2.5 rounded-2xl text-sm"
                  autoFocus />
                {!passwordModalWaiter.email && (
                  <p className="text-xs mt-2 flex items-start gap-1.5" style={{ color: 'var(--warning)' }}>
                    <TriangleAlert size={12} className="flex-shrink-0 mt-0.5" /> <span>Bu garsonun email'i yok. Şifreyle giriş için önce email eklemelisiniz.</span>
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3 border-t border-white/15">
              <button onClick={() => setPasswordModalWaiter(null)}
                className="glass-pill flex-1 py-2.5 rounded-2xl text-sm font-semibold spring-btn">
                İptal
              </button>
              <button onClick={handleSetPassword}
                className="btn-accent flex-1 py-2.5 rounded-2xl text-sm font-bold spring-btn">
                Şifreyi Güncelle
              </button>
            </div>
          </div>
        </div>
      )}

      {tokenModalWaiter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md fade-enter">
          <div className="glass-dark w-full max-w-md rounded-3xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/15">
              <h2 className="font-serif font-bold text-lg">
                QR Üret — {tokenModalWaiter.name}
              </h2>
              <button onClick={() => setTokenModalWaiter(null)} aria-label="Kapat"
                className="glass-pill w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 spring-btn">
                <X size={12} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold mb-2 uppercase tracking-wider text-white/70">
                  Geçerlilik Süresi (saat)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map(h => (
                    <button key={h} onClick={() => setSelectedHours(h)}
                      className={`py-2.5 rounded-2xl text-sm font-semibold spring-btn ${selectedHours === h ? 'btn-accent font-bold' : 'glass-pill text-white/80'}`}>
                      {h} saat
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-3 text-white/55">
                  Yeni QR üretildiğinde eski QR'lar iptal olur.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3 border-t border-white/15">
              <button onClick={() => setTokenModalWaiter(null)}
                className="glass-pill flex-1 py-2.5 rounded-2xl text-sm font-semibold spring-btn">
                İptal
              </button>
              <button onClick={handleGenerateToken}
                className="btn-accent flex-1 py-2.5 rounded-2xl text-sm font-bold spring-btn">
                QR Üret
              </button>
            </div>
          </div>
        </div>
      )}

      {qrResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md fade-enter">
          <div className="glass-dark w-full max-w-md rounded-3xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/15">
              <h2 className="font-serif font-bold text-lg flex items-center gap-2">
                <CircleCheck size={18} className="flex-shrink-0" style={{ color: 'var(--success)' }} /> {qrResult.waiter_name} için QR hazır
              </h2>
              <button onClick={() => setQrResult(null)} aria-label="Kapat"
                className="glass-pill w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 spring-btn">
                <X size={12} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-white rounded-2xl p-4 flex items-center justify-center shadow-lg">
                <img src={qrImageUrl(qrResult.token)} alt="QR kod" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>

              <div className="p-3 rounded-2xl" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)' }}>
                <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--warning)' }}>
                  <TriangleAlert size={12} className="flex-shrink-0 mt-0.5" /> <span>Bu QR sadece <b>{new Date(qrResult.expires_at).toLocaleString('tr-TR')}</b> tarihine kadar geçerli.</span>
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                  Giriş Linki
                </label>
                <div className="flex gap-2">
                  <input readOnly value={waiterLoginUrl(qrResult.token)}
                    className="glass-input flex-1 min-w-0 px-3 py-2 rounded-2xl text-xs font-mono" />
                  <button onClick={() => {
                    navigator.clipboard.writeText(waiterLoginUrl(qrResult.token));
                    showToast('Link kopyalandı.', 'success');
                  }}
                    className="btn-accent px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 spring-btn">
                    <Copy size={12} /> Kopyala
                  </button>
                </div>
              </div>

              {qrResult.waiter_phone && (
                <a
                  href={whatsappLink(qrResult.waiter_phone, waiterLoginUrl(qrResult.token), qrResult.waiter_name, 'AtlasQR')}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white text-center flex items-center justify-center gap-2 spring-btn border border-white/40"
                  style={{ background: 'rgba(37,211,102,0.85)', textDecoration: 'none' }}>
                  <MessageCircle size={16} /> WhatsApp'tan Gönder ({qrResult.waiter_phone})
                </a>
              )}
            </div>
            <div className="px-6 py-4 border-t border-white/15">
              <button onClick={() => setQrResult(null)}
                className="glass-pill w-full py-2.5 rounded-2xl text-sm font-semibold spring-btn">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
