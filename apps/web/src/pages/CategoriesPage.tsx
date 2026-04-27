// apps/web/src/pages/CategoriesPage.tsx
// CHANGELOG v2: Ortak Toast komponentine geçti

import type { CategoryResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';

export function CategoriesPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<CategoryResponse[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.sort_order - b.sort_order), [items]);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  async function loadCategories() {
    try {
      const data = await apiRequest<CategoryResponse[]>('/admin/categories', { token: accessToken });
      setItems(data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kategoriler alınamadı.', 'error');
    }
  }

  useEffect(() => { loadCategories().catch(() => undefined); }, [accessToken]);

  async function addCategory() {
    const name = newName.trim();
    if (!name) { showToast('Kategori adı boş olamaz.', 'error'); return; }
    try {
      await apiRequest<CategoryResponse>('/admin/categories', { method: 'POST', token: accessToken, body: { name } });
      setNewName('');
      await loadCategories();
      showToast('Kategori eklendi.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kategori eklenemedi.', 'error');
    }
  }

  async function saveCategory(item: CategoryResponse) {
    const name = editingName.trim();
    if (!name) { showToast('Kategori adı boş olamaz.', 'error'); return; }
    try {
      await apiRequest<CategoryResponse>(`/admin/categories/${item.id}`, {
        method: 'PUT', token: accessToken,
        body: { name, is_active: item.is_active, sort_order: item.sort_order }
      });
      setEditingId(null);
      setEditingName('');
      await loadCategories();
      showToast('Kategori güncellendi.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kategori güncellenemedi.', 'error');
    }
  }

  async function toggleActive(item: CategoryResponse) {
    try {
      await apiRequest<CategoryResponse>(`/admin/categories/${item.id}`, {
        method: 'PUT', token: accessToken,
        body: { is_active: !item.is_active, sort_order: item.sort_order, name: item.name }
      });
      await loadCategories();
      showToast(item.is_active ? 'Pasif yapıldı.' : 'Aktif yapıldı.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Güncelleme başarısız.', 'error');
    }
  }

  async function moveCategory(index: number, direction: 'up' | 'down') {
    const current = sortedItems[index];
    const target = direction === 'up' ? sortedItems[index - 1] : sortedItems[index + 1];
    if (!current || !target) return;
    try {
      await apiRequest<CategoryResponse>(`/admin/categories/${current.id}`, {
        method: 'PUT', token: accessToken,
        body: { sort_order: target.sort_order, name: current.name, is_active: current.is_active }
      });
      await apiRequest<CategoryResponse>(`/admin/categories/${target.id}`, {
        method: 'PUT', token: accessToken,
        body: { sort_order: current.sort_order, name: target.name, is_active: target.is_active }
      });
      await loadCategories();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Sıralama güncellenemedi.', 'error');
    }
  }

  return (
    <div className="max-w-2xl">
      <Toast state={toast} />

      {/* Ekle */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm" style={{border: '1px solid #E2E8F0'}}>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{color: '#64748B'}}>Yeni Kategori</h2>
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="Kategori adı..."
            maxLength={120}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
          />
          <button
            onClick={addCategory}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{background: '#0F172A'}}
          >
            + Ekle
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {sortedItems.map((item, index) => (
          <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3"
            style={{border: `1px solid ${item.is_active ? '#E2E8F0' : '#FEE2E2'}`, opacity: item.is_active ? 1 : 0.7}}>

            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{background: item.is_active ? '#CCFBF1' : '#FEE2E2', color: item.is_active ? '#0F766E' : '#DC2626'}}>
              {item.sort_order}
            </div>

            <div className="flex-1">
              {editingId === item.id ? (
                <input
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
                  style={{border: '1.5px solid #0D9488', background: '#F8FAFC'}}
                />
              ) : (
                <div>
                  <span className="font-semibold text-sm" style={{color: '#0F172A'}}>{item.name}</span>
                  {!item.is_active && <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{background: '#FEE2E2', color: '#DC2626'}}>Pasif</span>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {editingId === item.id ? (
                <>
                  <button onClick={() => saveCategory(item)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{background: '#0D9488'}}>Kaydet</button>
                  <button onClick={() => { setEditingId(null); setEditingName(''); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{background: '#F1F5F9', color: '#64748B'}}>İptal</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditingId(item.id); setEditingName(item.name); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{background: '#F1F5F9', color: '#0F172A'}}>
                    Düzenle
                  </button>
                  <button onClick={() => toggleActive(item)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{background: item.is_active ? '#FEF2F2' : '#F0FDF4', color: item.is_active ? '#DC2626' : '#16A34A'}}>
                    {item.is_active ? 'Pasif' : 'Aktif'}
                  </button>
                </>
              )}

              <div className="flex flex-col gap-1">
                <button disabled={index === 0} onClick={() => moveCategory(index, 'up')}
                  className="w-6 h-5 rounded flex items-center justify-center text-xs disabled:opacity-30"
                  style={{background: '#F1F5F9', color: '#64748B'}}>↑</button>
                <button disabled={index === sortedItems.length - 1} onClick={() => moveCategory(index, 'down')}
                  className="w-6 h-5 rounded flex items-center justify-center text-xs disabled:opacity-30"
                  style={{background: '#F1F5F9', color: '#64748B'}}>↓</button>
              </div>
            </div>
          </div>
        ))}

        {sortedItems.length === 0 && (
          <div className="text-center py-16 rounded-2xl" style={{background: 'white', border: '1px dashed #E2E8F0'}}>
            <div className="text-4xl mb-3">📂</div>
            <p className="text-sm" style={{color: '#94A3B8'}}>Henüz kategori yok</p>
            <p className="text-xs mt-1" style={{color: '#CBD5E1'}}>Yukarıdan yeni kategori ekleyin</p>
          </div>
        )}
      </div>
    </div>
  );
}