// apps/web/src/pages/SettingsPage.tsx
import type { BusinessSettingsResponse, UploadResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';

type ToastState = { message: string; type: 'error' | 'success' } | null;
type FormState = { name: string; logo_url: string; theme_color: string; bg_color: string; dark_mode: boolean };

export function SettingsPage() {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [form, setForm] = useState<FormState>({ name: '', logo_url: '', theme_color: '#111827', bg_color: '#f9fafb', dark_mode: false });

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
  }

  async function loadSettings() {
    try {
      setLoading(true);
      const data = await apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken });
      setForm({ name: data.name ?? '', logo_url: data.logo_url ?? '', theme_color: data.theme_color ?? '#111827', bg_color: data.bg_color ?? '#f9fafb', dark_mode: data.dark_mode ?? false });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ayarlar alınamadı.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSettings().catch(() => undefined); }, [accessToken]);

  async function uploadLogo(file: File | null) {
    if (!file || !accessToken) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploading(true);
      const response = await fetch(`${API_BASE_URL}/admin/upload`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData });
      if (!response.ok) { const payload = (await response.json().catch(() => ({}))) as { message?: string }; throw new Error(payload.message ?? 'Logo yüklenemedi.'); }
      const data = (await response.json()) as UploadResponse;
      setForm((prev) => ({ ...prev, logo_url: data.image_url }));
      showToast('Logo yüklendi.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Logo yüklenemedi.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function saveSettings() {
    const name = form.name.trim();
    if (!name) { showToast('İşletme adı boş olamaz.', 'error'); return; }
    try {
      await apiRequest<BusinessSettingsResponse>('/admin/business', { method: 'PUT', token: accessToken, body: { name, logo_url: form.logo_url || undefined, theme_color: form.theme_color, bg_color: form.bg_color, dark_mode: form.dark_mode } });
      showToast('Ayarlar kaydedildi.', 'success');
      await loadSettings();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ayarlar kaydedilemedi.', 'error');
    }
  }

  const previewStyle = useMemo(() => ({ background: form.bg_color, color: form.dark_mode ? '#f9fafb' : '#111827', border: `1px solid ${form.theme_color}` }), [form.bg_color, form.dark_mode, form.theme_color]);

  if (loading) return <section>Yükleniyor...</section>;

  return (
    <section>
      <h1>İşletme Ayarları</h1>
      {toast && <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 6, background: toast.type === 'error' ? '#fee2e2' : '#dcfce7', color: toast.type === 'error' ? '#991b1b' : '#166534' }}>{toast.message}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <label>İşletme Adı<input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} maxLength={120} /></label>
          <label>Logo Yükle<input type="file" accept="image/*" onChange={(e) => uploadLogo(e.target.files?.[0] ?? null)} /></label>
          {uploading && <p>Logo yükleniyor...</p>}
          <label>Tema Rengi<input type="color" value={form.theme_color} onChange={(e) => setForm((prev) => ({ ...prev, theme_color: e.target.value }))} /></label>
          <label>Arkaplan Rengi<input type="color" value={form.bg_color} onChange={(e) => setForm((prev) => ({ ...prev, bg_color: e.target.value }))} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.dark_mode} onChange={(e) => setForm((prev) => ({ ...prev, dark_mode: e.target.checked }))} />Koyu Mod</label>
          <button onClick={saveSettings}>Kaydet</button>
        </div>
        <aside style={{ borderRadius: 10, padding: 10, ...previewStyle }}>
          <h3 style={{ marginTop: 0 }}>Canlı Önizleme</h3>
          {form.logo_url ? <img src={form.logo_url} alt="Logo" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `2px solid ${form.theme_color}` }} /> : <div style={{ width: 72, height: 72, borderRadius: 8, border: `2px dashed ${form.theme_color}` }} />}
          <p style={{ margin: '10px 0 0' }}>{form.name || 'İşletme Adı'}</p>
          <small>Tema: {form.theme_color}</small>
        </aside>
      </div>
    </section>
  );
}