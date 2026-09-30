// apps/web/src/pages/ProductsPage.tsx
// CHANGELOG v4: Browser confirm() yerine ortak ConfirmModal komponenti

import type { CategoryResponse, ProductResponse, UploadResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ImageUploadField } from '../components/ImageUploadField';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { ConfirmModal, type ConfirmState } from '../components/ConfirmModal';
import { Select } from '../components/Select';
import { Layers, Pencil, Plus, ShoppingCart, Trash2, UtensilsCrossed, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

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
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductResponse | null>(null);
  const [form, setForm] = useState<ProductFormState>(initialForm);

  const sortedCategories = useMemo(() => [...categories].filter(c => c.is_active).sort((a, b) => a.sort_order - b.sort_order), [categories]);
  // Panel kısayolu: /admin/products?yeni=1 → kategoriler yüklenince "Yeni Ürün" formu açılır
  const [searchParams, setSearchParams] = useSearchParams();
  const wantsNew = searchParams.get('yeni') === '1';

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

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

  useEffect(() => {
    if (!wantsNew || sortedCategories.length === 0) return;
    openCreateModal();
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('yeni'); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew, sortedCategories.length]);

  function openEditModal(item: ProductResponse) {
    setEditingItem(item);
    setForm({ category_id: item.category_id, name: item.name, description: item.description ?? '', priceTl: priceIntToTl(item.price_int), image_url: item.image_url ?? '', sort_order: String(item.sort_order), is_active: item.is_active });
    setIsModalOpen(true);
  }

  function closeModal() { setIsModalOpen(false); setEditingItem(null); setForm(initialForm); }

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

  // YENİ: Browser confirm() kaldırıldı, ConfirmModal kullanılıyor
  function askDeleteProduct(item: ProductResponse) {
    setConfirm({
      title: 'Ürünü Sil?',
      message: <><strong>{item.name}</strong> pasif yapılacak. Geçmiş siparişlerde görünmeye devam eder.</>,
      confirmText: 'Evet, Sil',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await apiRequest(`/admin/products/${item.id}`, { method: 'DELETE', token: accessToken });
          showToast('Ürün silindi.', 'success');
          await loadProducts();
        } catch (e) {
          showToast(e instanceof Error ? e.message : 'Silinemedi.', 'error');
          throw e;
        }
      }
    });
  }

  return (
    <div className="text-ink">
      <Toast state={toast} />
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <Layers size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <Select
            value={selectedCategoryId}
            onChange={onCategoryFilterChange}
            ariaLabel="Kategori filtresi"
            className="ui-input pl-9 pr-4 py-2.5 rounded-2xl text-sm font-medium"
            style={{minWidth: 180}}
            options={[{ value: '', label: 'Tüm Kategoriler' }, ...sortedCategories.map(c => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <button onClick={openCreateModal}
          className="btn-primary px-5 py-2.5 rounded-2xl text-sm font-bold ml-auto flex items-center gap-2 spring-btn">
          <Plus size={14} /> Yeni Ürün
        </button>
      </div>

      <div className="grid gap-4" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))'}}>
        {items.map(item => (
          <div key={item.id} className="ui-card rounded-3xl overflow-hidden flex flex-col">
            <div className="relative bg-surface-2" style={{aspectRatio: '1'}}>
              {item.image_url ? (
                <img src={item.thumb_url || item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-muted"><UtensilsCrossed size={36} /></div>
              )}
              {!item.is_active && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
                  <span className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1px solid var(--state-danger)'}}>Pasif</span>
                </div>
              )}
            </div>
            <div className="p-3 flex-1 flex flex-col">
              <div className="font-serif font-bold text-sm mb-1 leading-snug">{item.name}</div>
              <div className="font-extrabold text-sm mb-3 text-ink tracking-tight">{priceIntToTl(item.price_int)} TL</div>
              <div className="flex gap-2 mt-auto">
                <button onClick={() => openEditModal(item)}
                  className="ui-chip flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 spring-btn">
                  <Pencil size={10} /> Düzenle
                </button>
                <button onClick={() => askDeleteProduct(item)}
                  className="py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 spring-btn"
                  style={{background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1px solid var(--state-danger)'}}>
                  <Trash2 size={10} /> Sil
                </button>
              </div>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="ui-card col-span-full text-center py-16 rounded-3xl border-dashed">
            <div className="mb-3 flex justify-center text-ink-muted"><ShoppingCart size={36} /></div>
            <p className="text-sm text-ink-muted">Henüz ürün yok</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ui-scrim fade-enter">
          <div className="ui-card w-full max-w-lg rounded-3xl overflow-hidden">

            <div className="px-6 py-4 flex items-center justify-between border-b border-line">
              <h2 className="font-serif font-bold text-lg text-ink">
                {editingItem ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
              </h2>
              <button onClick={closeModal} aria-label="Kapat"
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn">
                <X size={12} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto" style={{maxHeight: '70vh'}}>
              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">Kategori</label>
                <Select
                  value={form.category_id}
                  onChange={v => setForm(p => ({ ...p, category_id: v }))}
                  ariaLabel="Kategori"
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm"
                  options={[{ value: '', label: 'Kategori seçin' }, ...sortedCategories.map(c => ({ value: c.id, label: c.name }))]}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">Ürün Adı</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm"
                  placeholder="Ürün adı..." />
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">Fiyat (TL)</label>
                <input value={form.priceTl} onChange={e => setForm(p => ({ ...p, priceTl: e.target.value }))}
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm"
                  placeholder="Örn: 145,50" />
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">Açıklama</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm resize-none"
                  rows={2} placeholder="Açıklama..." />
              </div>

              <ImageUploadField
                value={form.image_url}
                onUpload={handleImageUpload}
                onRemove={handleImageRemove}
                label="Ürün Fotoğrafı"
                hint="JPG, PNG, WebP, GIF · max 5MB · kare öneri"
                themeColor="var(--accent)"
                previewSize={80}
              />

              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="sr-only" />
                  <div className="w-10 h-6 rounded-full transition-all border border-line"
                    style={{background: form.is_active ? 'var(--brand)' : 'var(--surface-2)'}}>
                    <div className="w-5 h-5 bg-white rounded-full shadow transition-all" style={{marginTop: 1, marginLeft: form.is_active ? '17px' : '1px'}}></div>
                  </div>
                </div>
                <span className="text-sm font-medium text-ink">Aktif ürün</span>
              </label>
            </div>

            <div className="px-6 py-4 flex gap-3 border-t border-line">
              <button onClick={closeModal} className="ui-chip flex-1 py-2.5 rounded-2xl text-sm font-semibold spring-btn">İptal</button>
              <button onClick={saveProduct} className="btn-primary flex-1 py-2.5 rounded-2xl text-sm font-bold spring-btn">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
