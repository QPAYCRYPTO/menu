import type { CategoryResponse, ProductResponse, UploadResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

type ToastState = {
  message: string;
  type: 'error' | 'success';
} | null;

type ProductFormState = {
  category_id: string;
  name: string;
  description: string;
  priceTl: string;
  image_url: string;
  sort_order: string;
  is_active: boolean;
};

const initialForm: ProductFormState = {
  category_id: '',
  name: '',
  description: '',
  priceTl: '',
  image_url: '',
  sort_order: '',
  is_active: true
};

function tlToPriceInt(value: string): number {
  const numeric = Number(value.replace(',', '.'));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : NaN;
}

function priceIntToTl(value: number): string {
  return (value / 100).toFixed(2);
}

export function ProductsPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<ProductResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductResponse | null>(null);
  const [form, setForm] = useState<ProductFormState>(initialForm);
  const [uploading, setUploading] = useState(false);

  const sortedCategories = useMemo(
    () => [...categories].filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  );

  async function loadCategories() {
    const data = await apiRequest<CategoryResponse[]>('/admin/categories', { token: accessToken });
    setCategories(data);
  }

  async function loadProducts(categoryId = selectedCategoryId) {
    const query = new URLSearchParams({ page: '1', page_size: '100' });
    if (categoryId) query.set('category_id', categoryId);

    const data = await apiRequest<ProductResponse[]>(`/admin/products?${query.toString()}`, { token: accessToken });
    setItems(data);
  }

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => {
    Promise.all([loadCategories(), loadProducts()]).catch((error: unknown) => {
      showToast(error instanceof Error ? error.message : 'Ürün verileri alınamadı.', 'error');
    });
  }, [accessToken]);

  async function onCategoryFilterChange(categoryId: string) {
    setSelectedCategoryId(categoryId);
    try {
      await loadProducts(categoryId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Filtreleme başarısız.', 'error');
    }
  }

  function openCreateModal() {
    setEditingItem(null);
    setForm({ ...initialForm, category_id: sortedCategories[0]?.id ?? '' });
    setIsModalOpen(true);
  }

  function openEditModal(item: ProductResponse) {
    setEditingItem(item);
    setForm({
      category_id: item.category_id,
      name: item.name,
      description: item.description ?? '',
      priceTl: priceIntToTl(item.price_int),
      image_url: item.image_url ?? '',
      sort_order: String(item.sort_order),
      is_active: item.is_active
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingItem(null);
    setForm(initialForm);
  }

  async function onUploadImage(file: File | null) {
    if (!file || !accessToken) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const response = await fetch(`${API_BASE_URL}/admin/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? 'Görsel yüklenemedi.');
      }

      const data = (await response.json()) as UploadResponse;
      setForm((prev) => ({ ...prev, image_url: data.image_url }));
      showToast('Görsel yüklendi.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Görsel yüklenemedi.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function saveProduct() {
    const name = form.name.trim();
    const price_int = tlToPriceInt(form.priceTl);

    if (!name) {
      showToast('Ürün adı boş olamaz.', 'error');
      return;
    }

    if (!form.category_id) {
      showToast('Kategori seçimi zorunludur.', 'error');
      return;
    }

    if (!Number.isFinite(price_int) || price_int < 0) {
      showToast('Fiyat geçersiz.', 'error');
      return;
    }

    const payload = {
      category_id: form.category_id,
      name,
      price_int,
      description: form.description.trim() || undefined,
      image_url: form.image_url || undefined,
      sort_order: form.sort_order ? Number(form.sort_order) : undefined,
      is_active: form.is_active
    };

    try {
      if (editingItem) {
        await apiRequest<ProductResponse>(`/admin/products/${editingItem.id}`, {
          method: 'PUT',
          token: accessToken,
          body: payload
        });
        showToast('Ürün güncellendi.', 'success');
      } else {
        await apiRequest<ProductResponse>('/admin/products', {
          method: 'POST',
          token: accessToken,
          body: payload
        });
        showToast('Ürün eklendi.', 'success');
      }

      closeModal();
      await loadProducts();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ürün kaydedilemedi.', 'error');
    }
  }

  return (
    <section>
      <h1>Ürünler</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={selectedCategoryId} onChange={(e) => onCategoryFilterChange(e.target.value)}>
          <option value="">Tüm kategoriler</option>
          {sortedCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <button onClick={openCreateModal}>Yeni Ürün Ekle</button>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
        {items.map((item) => (
          <article key={item.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 10 }}>
            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                overflow: 'hidden',
                borderRadius: 8,
                background: '#f3f4f6',
                marginBottom: 8
              }}
            >
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : null}
            </div>

            <strong>{item.name}</strong>
            <p style={{ margin: '6px 0' }}>{priceIntToTl(item.price_int)} TL</p>
            <p style={{ opacity: 0.8, fontSize: 13 }}>{item.description || 'Açıklama yok'}</p>
            <button onClick={() => openEditModal(item)}>Düzenle</button>
          </article>
        ))}
      </div>

      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.35)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 30
          }}
        >
          <div style={{ width: 'min(560px, 92vw)', background: '#fff', borderRadius: 10, padding: 16 }}>
            <h2>{editingItem ? 'Ürün Düzenle' : 'Ürün Ekle'}</h2>

            <div style={{ display: 'grid', gap: 8 }}>
              <label>
                Kategori
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
                >
                  <option value="">Kategori seçin</option>
                  {sortedCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Ürün Adı
                <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
              </label>

              <label>
                Fiyat (TL)
                <input
                  value={form.priceTl}
                  onChange={(e) => setForm((prev) => ({ ...prev, priceTl: e.target.value }))}
                  placeholder="Örn: 145,50"
                />
              </label>

              <label>
                Açıklama
                <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
              </label>

              <label>
                Sıra
                <input
                  type="number"
                  min={1}
                  value={form.sort_order}
                  onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Aktif ürün
              </label>

              <label>
                Görsel Yükle
                <input type="file" accept="image/*" onChange={(e) => onUploadImage(e.target.files?.[0] ?? null)} />
              </label>

              {uploading && <p>Görsel yükleniyor...</p>}
              {form.image_url && (
                <div style={{ width: 140, aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', border: '1px solid #ddd' }}>
                  <img src={form.image_url} alt="Ürün görseli" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={closeModal}>İptal</button>
              <button onClick={saveProduct}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
