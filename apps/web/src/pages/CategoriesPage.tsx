import type { CategoryResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type ToastState = {
  message: string;
  type: 'error' | 'success';
} | null;

export function CategoriesPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<CategoryResponse[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.sort_order - b.sort_order), [items]);

  async function loadCategories() {
    try {
      const data = await apiRequest<CategoryResponse[]>('/admin/categories', { token: accessToken });
      setItems(data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kategoriler alınamadı.', 'error');
    }
  }

  useEffect(() => {
    loadCategories().catch(() => undefined);
  }, [accessToken]);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2200);
  }

  async function addCategory() {
    const name = newName.trim();

    if (!name) {
      showToast('Kategori adı boş olamaz.', 'error');
      return;
    }

    try {
      await apiRequest<CategoryResponse>('/admin/categories', {
        method: 'POST',
        token: accessToken,
        body: { name }
      });
      setNewName('');
      await loadCategories();
      showToast('Kategori eklendi.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kategori eklenemedi.', 'error');
    }
  }

  async function saveCategory(item: CategoryResponse) {
    const name = editingName.trim();

    if (!name) {
      showToast('Kategori adı boş olamaz.', 'error');
      return;
    }

    try {
      await apiRequest<CategoryResponse>(`/admin/categories/${item.id}`, {
        method: 'PUT',
        token: accessToken,
        body: {
          name,
          is_active: item.is_active,
          sort_order: item.sort_order
        }
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
        method: 'PUT',
        token: accessToken,
        body: {
          is_active: !item.is_active,
          sort_order: item.sort_order,
          name: item.name
        }
      });
      await loadCategories();
      showToast(item.is_active ? 'Kategori pasif yapıldı.' : 'Kategori aktif yapıldı.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kategori durumu güncellenemedi.', 'error');
    }
  }

  async function moveCategory(index: number, direction: 'up' | 'down') {
    const current = sortedItems[index];
    const target = direction === 'up' ? sortedItems[index - 1] : sortedItems[index + 1];

    if (!current || !target) return;

    try {
      await apiRequest<CategoryResponse>(`/admin/categories/${current.id}`, {
        method: 'PUT',
        token: accessToken,
        body: {
          sort_order: target.sort_order,
          name: current.name,
          is_active: current.is_active
        }
      });

      await apiRequest<CategoryResponse>(`/admin/categories/${target.id}`, {
        method: 'PUT',
        token: accessToken,
        body: {
          sort_order: current.sort_order,
          name: target.name,
          is_active: target.is_active
        }
      });

      await loadCategories();
      showToast('Kategori sırası güncellendi.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kategori sırası güncellenemedi.', 'error');
    }
  }

  return (
    <section>
      <h1>Kategoriler</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          placeholder="Yeni kategori adı"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={120}
        />
        <button onClick={addCategory}>Ekle</button>
      </div>

      {toast && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 10px',
            borderRadius: 6,
            background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: toast.type === 'error' ? '#991b1b' : '#166534'
          }}
        >
          {toast.message}
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {sortedItems.map((item, index) => (
          <li key={item.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {editingId === item.id ? (
                <input value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={120} />
              ) : (
                <strong>
                  {item.name} {!item.is_active && <span style={{ color: '#a16207' }}>(Pasif)</span>}
                </strong>
              )}

              <span style={{ opacity: 0.8 }}>Sıra: {item.sort_order}</span>

              {editingId === item.id ? (
                <>
                  <button onClick={() => saveCategory(item)}>Kaydet</button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditingName('');
                    }}
                  >
                    İptal
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingName(item.name);
                    }}
                  >
                    Düzenle
                  </button>
                  <button onClick={() => toggleActive(item)}>{item.is_active ? 'Pasif Yap' : 'Aktif Yap'}</button>
                </>
              )}

              <button disabled={index === 0} onClick={() => moveCategory(index, 'up')}>
                ↑
              </button>
              <button disabled={index === sortedItems.length - 1} onClick={() => moveCategory(index, 'down')}>
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
