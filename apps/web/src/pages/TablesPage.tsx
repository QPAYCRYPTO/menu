// apps/web/src/pages/TablesPage.tsx
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Table = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type ToastState = { message: string; type: 'error' | 'success' } | null;

export function TablesPage() {
  const { accessToken } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
  }

  async function loadTables() {
    try {
      const data = await apiRequest<Table[]>('/admin/tables', { token: accessToken });
      setTables(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Masalar alınamadı.', 'error');
    }
  }

  useEffect(() => { loadTables(); }, [accessToken]);

  async function addTable() {
    const name = newName.trim();
    if (!name) { showToast('Masa adı boş olamaz.', 'error'); return; }
    try {
      await apiRequest('/admin/tables', { method: 'POST', token: accessToken, body: { name } });
      setNewName('');
      await loadTables();
      showToast('Masa eklendi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Masa eklenemedi.', 'error');
    }
  }

  async function saveTable(table: Table) {
    const name = editingName.trim();
    if (!name) { showToast('Masa adı boş olamaz.', 'error'); return; }
    try {
      await apiRequest(`/admin/tables/${table.id}`, { method: 'PUT', token: accessToken, body: { name } });
      setEditingId(null);
      setEditingName('');
      await loadTables();
      showToast('Masa güncellendi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi.', 'error');
    }
  }

  async function toggleActive(table: Table) {
    try {
      await apiRequest(`/admin/tables/${table.id}`, { method: 'PUT', token: accessToken, body: { is_active: !table.is_active } });
      await loadTables();
      showToast(table.is_active ? 'Masa pasif yapıldı.' : 'Masa aktif yapıldı.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi.', 'error');
    }
  }

  async function deleteTable(id: string) {
    if (!confirm('Bu masayı silmek istediğinize emin misiniz?')) return;
    try {
      await apiRequest(`/admin/tables/${id}`, { method: 'DELETE', token: accessToken });
      await loadTables();
      showToast('Masa silindi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Silinemedi.', 'error');
    }
  }

  return (
    <div className="max-w-2xl">
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: toast.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`}}>
          {toast.message}
        </div>
      )}

      {/* Yeni Masa Ekle */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm" style={{border: '1px solid #E2E8F0'}}>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{color: '#64748B'}}>Yeni Masa Ekle</h2>
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTable()}
            placeholder="Örn: Masa 1, Bahçe 3, VIP..."
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
          />
          <button onClick={addTable}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{background: '#0F172A'}}>
            + Ekle
          </button>
        </div>
      </div>

      {/* Masa Listesi */}
      <div className="space-y-3">
        {tables.map(table => (
          <div key={table.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3"
            style={{border: `1px solid ${table.is_active ? '#E2E8F0' : '#FEE2E2'}`, opacity: table.is_active ? 1 : 0.7}}>

            {/* QR ikonu */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{background: table.is_active ? '#CCFBF1' : '#FEE2E2'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={table.is_active ? '#0D9488' : '#DC2626'} strokeWidth="2.5">
                <rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/>
                <rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/>
              </svg>
            </div>

            {/* İsim */}
            <div className="flex-1">
              {editingId === table.id ? (
                <input value={editingName} onChange={e => setEditingName(e.target.value)} autoFocus
                  className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
                  style={{border: '1.5px solid #0D9488', background: '#F8FAFC'}} />
              ) : (
                <div>
                  <span className="font-semibold text-sm" style={{color: '#0F172A'}}>{table.name}</span>
                  {!table.is_active && <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{background: '#FEE2E2', color: '#DC2626'}}>Pasif</span>}
                </div>
              )}
            </div>

            {/* Butonlar */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {editingId === table.id ? (
                <>
                  <button onClick={() => saveTable(table)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{background: '#0D9488'}}>Kaydet</button>
                  <button onClick={() => { setEditingId(null); setEditingName(''); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{background: '#F1F5F9', color: '#64748B'}}>İptal</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditingId(table.id); setEditingName(table.name); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{background: '#F1F5F9', color: '#0F172A'}}>
                    Düzenle
                  </button>
                  <button onClick={() => toggleActive(table)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{background: table.is_active ? '#FEF2F2' : '#F0FDF4', color: table.is_active ? '#DC2626' : '#16A34A'}}>
                    {table.is_active ? 'Pasif' : 'Aktif'}
                  </button>
                  <button onClick={() => deleteTable(table.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{background: '#FEF2F2', color: '#DC2626'}}>
                    Sil
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {tables.length === 0 && (
          <div className="text-center py-16 rounded-2xl" style={{background: 'white', border: '1px dashed #E2E8F0'}}>
            <div className="text-4xl mb-3">🪑</div>
            <p className="text-sm" style={{color: '#94A3B8'}}>Henüz masa yok</p>
            <p className="text-xs mt-1" style={{color: '#CBD5E1'}}>Yukarıdan yeni masa ekleyin</p>
          </div>
        )}
      </div>
    </div>
  );
}