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
import { User, X, Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ui-scrim fade-enter">
      <div className="ui-card w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col text-ink sheet-max-85">

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-line">
          <div>
            <h2 className="font-serif font-bold text-lg text-ink flex items-center gap-2">
              <User size={18} />Owner Yönetimi
            </h2>
            <p className="text-xs mt-0.5 text-ink-muted">
              {business.name} — {activeCount} aktif owner
            </p>
          </div>
          <button
            onClick={onClose}
            className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn"
            aria-label="Kapat"
          >
            <X size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">

          {/* Yeni Owner Form */}
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="btn-primary w-full py-3 rounded-2xl text-sm font-bold mb-4 spring-btn"
            >
              + Yeni Owner Ekle
            </button>
          ) : (
            <div className="p-4 rounded-2xl mb-4 fade-enter"
              style={{ background: 'var(--surface-2)', border: '1.5px solid var(--accent)' }}>
              <h3 className="font-serif font-bold text-sm mb-3 text-ink">Yeni Owner Ekle</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">E-posta</label>
                  <input
                    type="email"
                    value={newForm.email}
                    onChange={(e) => setNewForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="patron@firma.com"
                    className="ui-input w-full px-4 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Şifre</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newForm.password}
                      onChange={(e) => setNewForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Min 8 karakter"
                      className="ui-input w-full px-4 py-2.5 rounded-xl text-sm"
                      style={{ paddingRight: 44, boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                      className="flex items-center text-ink-muted hover:text-ink"
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setShowNewForm(false); setNewForm({ email: '', password: '' }); }}
                    className="ui-chip flex-1 py-2 rounded-xl text-xs font-semibold spring-btn"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleCreate}
                    className="btn-primary flex-1 py-2 rounded-xl text-xs font-bold spring-btn"
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
              <div className="w-8 h-8 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-2" />
              <p className="text-sm text-ink-muted">Yükleniyor...</p>
            </div>
          ) : owners.length === 0 ? (
            <div className="text-center py-8 rounded-2xl border border-dashed border-line" style={{ background: 'var(--surface-2)' }}>
              <div className="mb-2 flex justify-center"><User size={30} className="text-ink-muted" /></div>
              <p className="text-sm text-ink-muted">Henüz owner yok</p>
              <p className="text-xs mt-1 text-ink-muted">"+ Yeni Owner Ekle" ile başlayın</p>
            </div>
          ) : (
            <div className="space-y-2">
              {owners.map(owner => (
                <div
                  key={owner.id}
                  className="p-3 rounded-2xl"
                  style={{
                    background: owner.is_active ? 'var(--surface-2)' : 'var(--state-danger-bg)',
                    border: `1px solid ${owner.is_active ? 'var(--surface-2)' : 'var(--state-danger)'}`
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-ink text-sm font-bold flex-shrink-0"
                        style={owner.is_active ? { background: 'var(--brand)', color: 'var(--on-brand)' } : { background: 'var(--surface-2)', color: 'var(--ink-muted)' }}
                      >
                        {owner.email.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="font-semibold text-sm truncate text-ink">{owner.email}</div>
                        <div className="text-xs" style={{ color: owner.is_active ? 'var(--state-ok)' : 'var(--state-danger)' }}>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 align-middle" />{owner.is_active ? 'Aktif' : 'Pasif'} · {new Date(owner.created_at).toLocaleDateString('tr-TR')}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setResetTarget({ owner, newPassword: '' })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold spring-btn"
                        style={{ background: 'var(--state-warn-bg)', color: 'var(--state-warn)', border: '1px solid var(--state-warn)' }}
                        title="Şifre sıfırla"
                        aria-label="Şifre sıfırla"
                      >
                        <KeyRound size={12} />
                      </button>
                      <button
                        onClick={() => handleToggleActive(owner)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold spring-btn"
                        style={owner.is_active
                          ? { background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1px solid var(--state-danger)' }
                          : { background: 'var(--state-ok-bg)', color: 'var(--state-ok)', border: '1px solid var(--state-ok)' }}
                      >
                        {owner.is_active ? 'Pasif' : 'Aktif'}
                      </button>
                      <button
                        onClick={() => handleDelete(owner)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold spring-btn"
                        style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1px solid var(--state-danger)' }}
                        title="Sil"
                        aria-label="Sil"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Şifre sıfırlama formu */}
                  {resetTarget?.owner.id === owner.id && (
                    <div className="mt-3 pt-3 border-t border-line">
                      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">
                        Yeni Şifre (Owner'a bildirilecek)
                      </label>
                      <div className="flex gap-2">
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type={showResetPassword ? 'text' : 'password'}
                            value={resetTarget.newPassword}
                            onChange={(e) => setResetTarget(p => p ? { ...p, newPassword: e.target.value } : null)}
                            placeholder="Min 8 karakter"
                            className="ui-input w-full px-3 py-2 rounded-xl text-sm"
                            style={{ paddingRight: 40, boxSizing: 'border-box' }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowResetPassword(!showResetPassword)}
                            aria-label={showResetPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                            className="flex items-center text-ink-muted hover:text-ink"
                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}
                          >
                            {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <button
                          onClick={() => setResetTarget(null)}
                          className="ui-chip px-3 py-2 rounded-xl text-xs font-semibold spring-btn"
                        >
                          İptal
                        </button>
                        <button
                          onClick={handleResetPassword}
                          className="btn-primary px-3 py-2 rounded-xl text-xs font-bold spring-btn"
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
        <div className="px-6 py-4 border-t border-line" style={{ background: 'var(--surface-2)' }}>
          <button
            onClick={onClose}
            className="ui-chip w-full py-2.5 rounded-xl text-sm font-semibold spring-btn"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
