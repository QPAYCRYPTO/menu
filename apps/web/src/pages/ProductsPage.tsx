// apps/web/src/pages/ProductsPage.tsx
// CHANGELOG:
// - Görsel yükleme alanı ImageUploadField komponentine geçti
// - Drag & drop, preview, değiştir/kaldır desteği

import type { CategoryResponse, ProductResponse, UploadResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ImageUploadField } from '../components/ImageUploadField';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

type ToastState = { message: string; type: 'error' | 'success' } | null;
type ProductFormState = {
  category_id: string; name: string; description: string;
  priceTl: string; image_url: string; sort_order: string; is_active: boolean;
};

const initialForm: ProductFormState = { category_id: '', name: '', description: '', priceTl: '', image_url: '', sort_order: '', is_active: true };

function tlToPriceInt(value: string): number {
  const numeric = Number(value.replace(',', '.'));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : NaN;
}
function priceIntToTl(value: number): string { return (value / 100).toFixed(2); }

export function ProductsPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<ProductResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductResponse | null>(null);
  const [form, setForm] = useState<ProductFormState>(initialForm);

  const sortedCategories = useMemo(() => [...categories].filter(c => c.is_active).sort((a, b) => a.sort_order - b.sort_order), [categories]);

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
    Promise.all([loadCategories(), loadProducts()]).catch((e: unknown) => {
      showToast(e instanceof Error ? e.message : 'Veriler alınamadı.', 'error');
    });
  }, [accessToken]);

  async function onCategoryFilterChange(categoryId: string) {
    setSelectedCategoryId(categoryId);
    try { await loadProducts(categoryId); } catch (e) {
      showToast(e instanceof Error ? e.message : 'Filtreleme başarısız.', 'error');
    }
  }

  function openCreateModal() {
    setEditingItem(null);
    setForm({ ...initialForm, category_id: sortedCategories[0]?.id ?? '' });
    setIsModalOpen(true);
  }

  function openEditModal(item: ProductResponse) {
    setEditingItem(item);
    setForm({ category_id: item.category_id, name: item.name, description: item.description ?? '', priceTl: priceIntToTl(item.price_int), image_url: item.image_url ?? '', sort_order: String(item.sort_order), is_active: item.is_active });
    setIsModalOpen(true);
  }

  function closeModal() { setIsModalOpen(false); setEditingItem(null); setForm(initialForm); }

  // Görseli yükle ve form state'ine yaz
  async function handleImageUpload(file: File): Promise<string | null> {
    if (!accessToken) return null;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });
      if (!response.ok) {
        const p = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(p.message ?? 'Görsel yüklenemedi.');
      }
      const data = (await response.json()) as UploadResponse;
      setForm(prev => ({ ...prev, image_url: data.image_url }));
      showToast('Görsel yüklendi.', 'success');
      return data.image_url;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Görsel yüklenemedi.', 'error');
      return null;
    }
  }

  function handleImageRemove() {
    setForm(prev => ({ ...prev, image_url: '' }));
  }

  async function saveProduct() {
    const name = form.name.trim();
    const price_int = tlToPriceInt(form.priceTl);
    if (!name) { showToast('Ürün adı boş olamaz.', 'error'); return; }
    if (!form.category_id) { showToast('Kategori seçimi zorunludur.', 'error'); return; }
    if (!Number.isFinite(price_int) || price_int < 0) { showToast('Fiyat geçersiz.', 'error'); return; }
    const payload = { category_id: form.category_id, name, price_int, description: form.description.trim() || undefined, image_url: form.image_url || undefined, sort_order: form.sort_order ? Number(form.sort_order) : undefined, is_active: form.is_active };
    try {
      if (editingItem) {
        await apiRequest<ProductResponse>(`/admin/products/${editingItem.id}`, { method: 'PUT', token: accessToken, body: payload });
        showToast('Ürün güncellendi.', 'success');
      } else {
        await apiRequest<ProductResponse>('/admin/products', { method: 'POST', token: accessToken, body: payload });
        showToast('Ürün eklendi.', 'success');
      }
      closeModal();
      await loadProducts();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Ürün kaydedilemedi.', 'error'); }
  }

  async function deleteProduct(item: ProductResponse) {
    if (!confirm(`"${item.name}" silinsin mi?`)) return;
    try {
      await apiRequest(`/admin/products/${item.id}`, { method: 'DELETE', token: accessToken });
      showToast('Ürün silindi.', 'success');
      await loadProducts();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Silinemedi.', 'error'); }
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: toast.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`}}>
          {toast.message}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={selectedCategoryId}
          onChange={e => onCategoryFilterChange(e.target.value)}
          className="px-4 py-2.5 rounded-xl text-sm outline-none font-medium"
          style={{border: '1.5px solid #E2E8F0', background: 'white', color: '#0F172A', minWidth: 160}}
        >
          <option value="">Tüm Kategoriler</option>
          {sortedCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={openCreateModal}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white ml-auto"
          style={{background: '#0F172A'}}>
          + Yeni Ürün
        </button>
      </div>

      {/* Grid */}
      <div className="grid gap-4" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))'}}>
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{border: '1px solid #E2E8F0'}}>
            <div className="relative" style={{aspectRatio: '1', background: '#F8FAFC'}}>
              {item.image_url ? (
                <img src={item.thumb_url || item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
              )}
              {!item.is_active && (
                <div className="absolute inset-0 flex items-center justify-center" style={{background: 'rgba(0,0,0,0.4)'}}>
                  <span className="text-xs font-bold text-white px-2 py-1 rounded-full" style={{background: '#DC2626'}}>Pasif</span>
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm mb-1" style={{color: '#0F172A'}}>{item.name}</div>
              <div className="font-bold text-sm mb-3" style={{color: '#0D9488'}}>{priceIntToTl(item.price_int)} TL</div>
              <div className="flex gap-2">
                <button onClick={() => openEditModal(item)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                  style={{background: '#F1F5F9', color: '#0F172A'}}>
                  Düzenle
                </button>
                <button onClick={() => deleteProduct(item)}
                  className="py-1.5 px-2 rounded-lg text-xs font-semibold"
                  style={{background: '#FEF2F2', color: '#DC2626'}}>
                  Sil
                </button>
              </div>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="col-span-full text-center py-16 rounded-2xl" style={{background: 'white', border: '1px dashed #E2E8F0'}}>
            <div className="text-4xl mb-3">🛒</div>
            <p className="text-sm" style={{color: '#94A3B8'}}>Henüz ürün yok</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: 'rgba(15,23,42,0.6)'}}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

            {/* Modal Header */}
            <div className="px-6 py-4 flex items-center justify-between" style={{borderBottom: '1px solid #E2E8F0'}}>
              <h2 className="font-bold text-base" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>
                {editingItem ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
              </h2>
              <button onClick={closeModal} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background: '#F1F5F9', color: '#64748B'}}>✕</button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto" style={{maxHeight: '70vh'}}>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Kategori</label>
                <select
                  value={form.category_id}
                  onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                >
                  <option value="">Kategori seçin</option>
                  {sortedCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Ürün Adı</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                  placeholder="Ürün adı..." />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Fiyat (TL)</label>
                <input value={form.priceTl} onChange={e => setForm(p => ({ ...p, priceTl: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                  placeholder="Örn: 145,50" />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Açıklama</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                  rows={2} placeholder="Açıklama..." />
              </div>

              {/* YENİ: Görsel yükleme komponenti */}
              <ImageUploadField
                value={form.image_url}
                onUpload={handleImageUpload}
                onRemove={handleImageRemove}
                label="Ürün Fotoğrafı"
                hint="PNG, JPG · max 5MB · kare öneri"
                themeColor="#EC4899"
                previewSize={80}
              />

              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="sr-only" />
                  <div className="w-10 h-6 rounded-full transition-all" style={{background: form.is_active ? '#0D9488' : '#E2E8F0'}}>
                    <div className="w-5 h-5 bg-white rounded-full shadow transition-all mt-0.5" style={{marginLeft: form.is_active ? '18px' : '2px'}}></div>
                  </div>
                </div>
                <span className="text-sm font-medium" style={{color: '#0F172A'}}>Aktif ürün</span>
              </label>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 flex gap-3" style={{borderTop: '1px solid #E2E8F0'}}>
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{background: '#F1F5F9', color: '#64748B'}}>İptal</button>
              <button onClick={saveProduct} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{background: '#0F172A'}}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}