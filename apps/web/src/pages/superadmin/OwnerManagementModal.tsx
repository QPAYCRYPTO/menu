// apps/web/src/pages/superadmin/OwnerManagementModal.tsx
// Bir işletmenin owner'larını yöneten modal.
// SuperAdminPage'den bağımsız — yeniden kullanılabilir.

import { useEffect, useState } from 'react';
import {
  Business,
  Owner,
  listOwners,
  createOwner,
  toggleOwnerActive,
  deleteOwner,
  resetOwnerPassword
} from '../../api/superadminApi';

type Props = {
  business: Business;
  accessToken: string;
  onClose: () => void;
  onOwnerCountChanged: () => void; // Dışarıya "liste güncellendi" sinyali
  onToast: (message: string, type: 'error' | 'success') => void;
};

export function OwnerManagementModal({ business, accessToken, onClose, onOwnerCountChanged, onToast }: Props) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(false);

  // Yeni owner form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ email: '', password: '' });
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Şifre sıfırlama (inline)
  const [resetTarget, setResetTarget] = useState<{ owner: Owner; newPassword: string } | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listOwners(accessToken, business.id);
      setOwners(data);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Owner\'lar alınamadı.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newForm.email || !newForm.password) {
      onToast('Email ve şifre zorunludur.', 'error');
      return;
    }
    if (newForm.password.length < 8) {
      onToast('Şifre en az 8 karakter olmalıdır.', 'error');
      return;
    }

    try {
      await createOwner(accessToken, business.id, newForm);
      onToast('Owner oluşturuldu.', 'success');
      setNewForm({ email: '', password: '' });
      setShowNewForm(false);
      await refresh();
      onOwnerCountChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Owner oluşturulamadı.', 'error');
    }
  }

  async function handleToggleActive(owner: Owner) {
    try {
      await toggleOwnerActive(accessToken, business.id, owner.id, !owner.is_active);
      onToast(owner.is_active ? 'Owner pasifleştirildi.' : 'Owner aktifleştirildi.', 'success');
      await refresh();
      onOwnerCountChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'İşlem başarısız.', 'error');
    }
  }

  async function handleDelete(owner: Owner) {
    if (!confirm(`${owner.email} adlı owner'ı silmek istediğinize emin misiniz?`)) return;
    try {
      await deleteOwner(accessToken, business.id, owner.id);
      onToast('Owner silindi.', 'success');
      await refresh();
      onOwnerCountChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Silme başarısız.', 'error');
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    if (resetTarget.newPassword.length < 8) {
      onToast('Şifre en az 8 karakter olmalıdır.', 'error');
      return;
    }
    try {
      await resetOwnerPassword(accessToken, business.id, resetTarget.owner.id, resetTarget.newPassword);
      onToast('Owner şifresi güncellendi.', 'success');
      setResetTarget(null);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Hata.', 'error');
    }
  }

  const activeCount = owners.filter(o => o.is_active).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md fade-enter">
      <div className="glass-dark w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col text-white" style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/15">
          <div>
            <h2 className="font-serif font-bold text-lg text-white">
              👤 Owner Yönetimi
            </h2>
            <p className="text-xs mt-0.5 text-white/65">
              {business.name} — {activeCount} aktif owner
            </p>
          </div>
          <button
            onClick={onClose}
            className="glass-pill w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn"
            aria-label="Kapat"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">

          {/* Yeni Owner Form */}
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="btn-accent w-full py-3 rounded-2xl text-sm font-bold mb-4 spring-btn"
            >
              + Yeni Owner Ekle
            </button>
          ) : (
            <div className="p-4 rounded-2xl mb-4 fade-enter"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,122,41,0.6)' }}>
              <h3 className="font-serif font-bold text-sm mb-3 text-white">Yeni Owner Ekle</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">E-posta</label>
                  <input
                    type="email"
                    value={newForm.email}
                    onChange={(e) => setNewForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="patron@firma.com"
                    className="glass-input w-full px-4 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Şifre</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newForm.password}
                      onChange={(e) => setNewForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Min 8 karakter"
                      className="glass-input w-full px-4 py-2.5 rounded-xl text-sm"
                      style={{ paddingRight: 44, boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}
                    >
                      {showNewPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setShowNewForm(false); setNewForm({ email: '', password: '' }); }}
                    className="glass-pill flex-1 py-2 rounded-xl text-xs font-semibold spring-btn"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleCreate}
                    className="btn-accent flex-1 py-2 rounded-xl text-xs font-bold spring-btn"
                  >
                    Oluştur
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Owner Listesi */}
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-2" />
              <p className="text-sm text-white/60">Yükleniyor...</p>
            </div>
          ) : owners.length === 0 ? (
            <div className="text-center py-8 rounded-2xl border border-dashed border-white/25" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="text-3xl mb-2">👤</div>
              <p className="text-sm text-white/70">Henüz owner yok</p>
              <p className="text-xs mt-1 text-white/50">"+ Yeni Owner Ekle" ile başlayın</p>
            </div>
          ) : (
            <div className="space-y-2">
              {owners.map(owner => (
                <div
                  key={owner.id}
                  className="p-3 rounded-2xl"
                  style={{
                    background: owner.is_active ? 'rgba(255,255,255,0.08)' : 'rgba(244,63,94,0.12)',
                    border: `1px solid ${owner.is_active ? 'rgba(255,255,255,0.18)' : 'rgba(251,113,133,0.45)'}`
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ background: owner.is_active ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.18)' }}
                      >
                        {owner.email.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="font-semibold text-sm truncate text-white">{owner.email}</div>
                        <div className="text-xs" style={{ color: owner.is_active ? 'var(--success)' : 'var(--danger)' }}>
                          {owner.is_active ? '● Aktif' : '● Pasif'} · {new Date(owner.created_at).toLocaleDateString('tr-TR')}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setResetTarget({ owner, newPassword: '' })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold spring-btn"
                        style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.4)' }}
                        title="Şifre sıfırla"
                      >
                        🔑
                      </button>
                      <button
                        onClick={() => handleToggleActive(owner)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold spring-btn"
                        style={owner.is_active
                          ? { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.4)' }
                          : { background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid rgba(52,211,153,0.4)' }}
                      >
                        {owner.is_active ? 'Pasif' : 'Aktif'}
                      </button>
                      <button
                        onClick={() => handleDelete(owner)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold spring-btn"
                        style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.4)' }}
                        title="Sil"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Şifre sıfırlama formu */}
                  {resetTarget?.owner.id === owner.id && (
                    <div className="mt-3 pt-3 border-t border-white/15">
                      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">
                        Yeni Şifre (Owner'a bildirilecek)
                      </label>
                      <div className="flex gap-2">
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type={showResetPassword ? 'text' : 'password'}
                            value={resetTarget.newPassword}
                            onChange={(e) => setResetTarget(p => p ? { ...p, newPassword: e.target.value } : null)}
                            placeholder="Min 8 karakter"
                            className="glass-input w-full px-3 py-2 rounded-xl text-sm"
                            style={{ paddingRight: 40, boxSizing: 'border-box' }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowResetPassword(!showResetPassword)}
                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}
                          >
                            {showResetPassword ? '🙈' : '👁️'}
                          </button>
                        </div>
                        <button
                          onClick={() => setResetTarget(null)}
                          className="glass-pill px-3 py-2 rounded-xl text-xs font-semibold spring-btn"
                        >
                          İptal
                        </button>
                        <button
                          onClick={handleResetPassword}
                          className="btn-accent px-3 py-2 rounded-xl text-xs font-bold spring-btn"
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/15" style={{ background: 'rgba(0,0,0,0.15)' }}>
          <button
            onClick={onClose}
            className="glass-pill w-full py-2.5 rounded-xl text-sm font-semibold spring-btn"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
