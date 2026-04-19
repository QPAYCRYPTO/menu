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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
              👤 Owner Yönetimi
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              {business.name} — {activeCount} aktif owner
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: '#F1F5F9', color: '#64748B' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">

          {/* Yeni Owner Form */}
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white mb-4 active:scale-95 transition-transform"
              style={{ background: '#0D9488' }}
            >
              + Yeni Owner Ekle
            </button>
          ) : (
            <div className="p-4 rounded-xl mb-4" style={{ background: '#F8FAFC', border: '1.5px solid #0D9488' }}>
              <h3 className="font-semibold text-sm mb-3" style={{ color: '#0F172A' }}>Yeni Owner Ekle</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>E-posta</label>
                  <input
                    type="email"
                    value={newForm.email}
                    onChange={(e) => setNewForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="patron@firma.com"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Şifre</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newForm.password}
                      onChange={(e) => setNewForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Min 8 karakter"
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                      style={{ border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A', paddingRight: 44, boxSizing: 'border-box' }}
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
                    className="flex-1 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: '#F1F5F9', color: '#64748B' }}
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleCreate}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{ background: '#0D9488' }}
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
              <p className="text-sm" style={{ color: '#94A3B8' }}>Yükleniyor...</p>
            </div>
          ) : owners.length === 0 ? (
            <div className="text-center py-8 rounded-xl" style={{ background: '#F8FAFC', border: '1px dashed #E2E8F0' }}>
              <div className="text-3xl mb-2">👤</div>
              <p className="text-sm" style={{ color: '#94A3B8' }}>Henüz owner yok</p>
              <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>"+ Yeni Owner Ekle" ile başlayın</p>
            </div>
          ) : (
            <div className="space-y-2">
              {owners.map(owner => (
                <div
                  key={owner.id}
                  className="p-3 rounded-xl"
                  style={{
                    background: owner.is_active ? 'white' : '#FEF8F8',
                    border: `1px solid ${owner.is_active ? '#E2E8F0' : '#FECACA'}`
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ background: owner.is_active ? '#0D9488' : '#94A3B8' }}
                      >
                        {owner.email.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{owner.email}</div>
                        <div className="text-xs" style={{ color: owner.is_active ? '#0D9488' : '#DC2626' }}>
                          {owner.is_active ? '● Aktif' : '● Pasif'} · {new Date(owner.created_at).toLocaleDateString('tr-TR')}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setResetTarget({ owner, newPassword: '' })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#FEF3C7', color: '#92400E' }}
                        title="Şifre sıfırla"
                      >
                        🔑
                      </button>
                      <button
                        onClick={() => handleToggleActive(owner)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                        style={{
                          background: owner.is_active ? '#FEF2F2' : '#F0FDF4',
                          color: owner.is_active ? '#DC2626' : '#16A34A'
                        }}
                      >
                        {owner.is_active ? 'Pasif' : 'Aktif'}
                      </button>
                      <button
                        onClick={() => handleDelete(owner)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#FEF2F2', color: '#DC2626' }}
                        title="Sil"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Şifre sıfırlama formu */}
                  {resetTarget?.owner.id === owner.id && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid #E2E8F0' }}>
                      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>
                        Yeni Şifre (Owner'a bildirilecek)
                      </label>
                      <div className="flex gap-2">
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type={showResetPassword ? 'text' : 'password'}
                            value={resetTarget.newPassword}
                            onChange={(e) => setResetTarget(p => p ? { ...p, newPassword: e.target.value } : null)}
                            placeholder="Min 8 karakter"
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A', paddingRight: 40, boxSizing: 'border-box' }}
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
                          className="px-3 py-2 rounded-lg text-xs font-semibold"
                          style={{ background: '#F1F5F9', color: '#64748B' }}
                        >
                          İptal
                        </button>
                        <button
                          onClick={handleResetPassword}
                          className="px-3 py-2 rounded-lg text-xs font-semibold text-white"
                          style={{ background: '#D97706' }}
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
        <div className="px-6 py-4" style={{ borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#F1F5F9', color: '#0F172A' }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}