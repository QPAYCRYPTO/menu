// apps/web/src/pages/CategoriesPage.tsx
// CHANGELOG v2: Ortak Toast komponentine geçti

import type { CategoryResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { ChevronDown, ChevronUp, FolderOpen, FolderPlus, Pencil, Plus } from 'lucide-react';

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
    <div className="max-w-2xl text-ink">
      <Toast state={toast} />

      {/* Ekle */}
      <div className="ui-card rounded-3xl p-6 mb-6">
        <h2 className="text-[11px] font-bold mb-4 uppercase tracking-wider text-ink-muted flex items-center gap-2">
          <FolderPlus size={11} className="text-accent" /> Yeni Kategori
        </h2>
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="Kategori adı..."
            maxLength={120}
            className="ui-input flex-1 min-w-0 px-4 py-2.5 rounded-2xl text-sm"
          />
          <button
            onClick={addCategory}
            className="btn-primary px-5 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 spring-btn flex-shrink-0"
          >
            <Plus size={14} /> Ekle
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {sortedItems.map((item, index) => (
          <div key={item.id} className="ui-card rounded-3xl p-4 flex items-center gap-3"
            style={{borderColor: item.is_active ? undefined : 'var(--state-danger)', opacity: item.is_active ? 1 : 0.75}}>

            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0"
              style={item.is_active
                ? {background: 'var(--accent-soft)', color: 'var(--ink)', border: '1px solid var(--line)'}
                : {background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1px solid var(--state-danger)'}}>
              {item.sort_order}
            </div>

            <div className="flex-1 min-w-0">
              {editingId === item.id ? (
                <input
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  autoFocus
                  className="ui-input w-full px-3 py-1.5 rounded-xl text-sm"
                  style={{borderColor: 'var(--accent)'}}
                />
              ) : (
                <div className="truncate">
                  <span className="font-serif font-bold text-sm">{item.name}</span>
                  {!item.is_active && <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold" style={{background: 'var(--state-danger-bg)', color: 'var(--state-danger)'}}>Pasif</span>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {editingId === item.id ? (
                <>
                  <button onClick={() => saveCategory(item)} className="btn-primary px-3 py-1.5 rounded-xl text-xs font-bold spring-btn">Kaydet</button>
                  <button onClick={() => { setEditingId(null); setEditingName(''); }} className="ui-chip px-3 py-1.5 rounded-xl text-xs font-semibold spring-btn">İptal</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditingId(item.id); setEditingName(item.name); }}
                    className="ui-chip px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 spring-btn">
                    <Pencil size={10} /> Düzenle
                  </button>
                  <button onClick={() => toggleActive(item)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold spring-btn"
                    style={item.is_active
                      ? {background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1px solid var(--state-danger)'}
                      : {background: 'var(--state-ok-bg)', color: 'var(--state-ok)', border: '1px solid var(--state-ok)'}}>
                    {item.is_active ? 'Pasif' : 'Aktif'}
                  </button>
                </>
              )}

              <div className="flex flex-col gap-1">
                <button disabled={index === 0} onClick={() => moveCategory(index, 'up')}
                  className="ui-chip w-6 h-5 rounded-md flex items-center justify-center text-[9px] disabled:opacity-30"
                  aria-label="Yukarı taşı"><ChevronUp size={10} /></button>
                <button disabled={index === sortedItems.length - 1} onClick={() => moveCategory(index, 'down')}
                  className="ui-chip w-6 h-5 rounded-md flex items-center justify-center text-[9px] disabled:opacity-30"
                  aria-label="Aşağı taşı"><ChevronDown size={10} /></button>
              </div>
            </div>
          </div>
        ))}

        {sortedItems.length === 0 && (
          <div className="ui-card text-center py-16 rounded-3xl border-dashed">
            <div className="mb-3 flex justify-center text-ink-muted"><FolderOpen size={36} /></div>
            <p className="text-sm text-ink-muted">Henüz kategori yok</p>
            <p className="text-xs mt-1 text-ink-muted">Yukarıdan yeni kategori ekleyin</p>
          </div>
        )}
      </div>
    </div>
  );
}
