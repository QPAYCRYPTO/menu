// apps/web/src/pages/SettingsPage.tsx
// CHANGELOG v3: Ortak Toast komponentine geçti
// - Atölye tasarımı: gece/gündüz uyumlu. Eski "Arkaplan Rengi" ve "Koyu Mod" alanları kaldırıldı
//   (tema artık her ekranın sağ üstündeki güneş/ay düğmesiyle seçiliyor). bg_color / dark_mode
//   değerleri API'ye olduğu gibi geri gönderilir, veritabanında değişmez.

import type { BusinessSettingsResponse } from '@menu/shared';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ImageUploadField } from '../components/ImageUploadField';
import { ThemeColorPicker } from '../components/ThemeColorPicker';
import { isHexColor, normalizeHex, readableTextOn } from '../lib/color';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { BookUser, Camera, Eye, MessageCircle, Palette, Phone, Save, Store, SunMoon } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

type FormState = {
  name: string; logo_url: string; theme_color: string; bg_color: string;
  dark_mode: boolean; description: string;
  contact_phone: string; contact_whatsapp: string; contact_instagram: string;
};

export function SettingsPage() {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [form, setForm] = useState<FormState>({
    name: '', logo_url: '', theme_color: '#0D9488', bg_color: '#F8FAFC',
    dark_mode: false, description: '',
    contact_phone: '', contact_whatsapp: '', contact_instagram: ''
  });

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  async function loadSettings() {
    try {
      setLoading(true);
      const data = await apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken });
      setForm({
        name: data.name ?? '', logo_url: data.logo_url ?? '',
        theme_color: data.theme_color ?? '#0D9488', bg_color: data.bg_color ?? '#F8FAFC',
        dark_mode: data.dark_mode ?? false, description: (data as any).description ?? '',
        contact_phone: (data as any).contact_phone ?? '', contact_whatsapp: (data as any).contact_whatsapp ?? '',
        contact_instagram: (data as any).contact_instagram ?? ''
      });
    } catch (e) { showToast(e instanceof Error ? e.message : 'Ayarlar alınamadı.', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadSettings().catch(() => undefined); }, [accessToken]);

  async function handleLogoUpload(file: File): Promise<string | null> {
    if (!accessToken) return null;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/upload/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });
      if (!response.ok) {
        const p = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(p.message ?? 'Logo yüklenemedi.');
      }
      const data = await response.json() as { logo_url: string };
      setForm(prev => ({ ...prev, logo_url: data.logo_url }));
      showToast('Logo yüklendi.', 'success');
      return data.logo_url;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Logo yüklenemedi.', 'error');
      return null;
    }
  }

  function handleLogoRemove() {
    setForm(prev => ({ ...prev, logo_url: '' }));
  }

  async function saveSettings() {
    const name = form.name.trim();
    if (!name) { showToast('İşletme adı boş olamaz.', 'error'); return; }
    if (!isHexColor(form.theme_color)) { showToast('Tema rengi geçerli bir hex kodu olmalı (örn. #c2410c).', 'error'); return; }
    try {
      await apiRequest<BusinessSettingsResponse>('/admin/business', {
        method: 'PUT', token: accessToken,
        body: { name, logo_url: form.logo_url || undefined, theme_color: form.theme_color, bg_color: form.bg_color, dark_mode: form.dark_mode, description: form.description || undefined, contact_phone: form.contact_phone || undefined, contact_whatsapp: form.contact_whatsapp || undefined, contact_instagram: form.contact_instagram || undefined }
      });
      showToast('Ayarlar kaydedildi.', 'success');
      await loadSettings();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Kaydedilemedi.', 'error'); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin"></div>
    </div>
  );

  return (
    <div className="max-w-3xl text-ink">
      <Toast state={toast} />

      <div className="grid gap-6">

        {/* Canlı Önizleme — müşteri menüsü başlığı (logo, ad, açıklama) + tema rengi */}
        <div className="ui-card rounded-3xl p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-3 px-3 pt-2 text-ink-muted flex items-center gap-2">
            <Eye size={11} className="text-accent" /> Canlı Önizleme
          </p>
          <div className="rounded-2xl p-5 bg-page border border-line">
            <div className="flex items-center gap-4">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-line" />
              ) : (
                <div className="w-16 h-16 rounded-xl flex items-center justify-center font-bold text-xl"
                  style={{ background: form.theme_color, color: readableTextOn(isHexColor(form.theme_color) ? normalizeHex(form.theme_color) : '#073f46') }}>
                  {form.name?.charAt(0) || 'A'}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-serif font-bold text-xl">{form.name || 'İşletme Adı'}</div>
                {form.description && <div className="ui-eyebrow mt-1 truncate" style={{ color: form.theme_color }}>{form.description}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Temel Bilgiler */}
        <div className="ui-card rounded-3xl p-6">
          <h3 className="font-serif font-bold text-lg mb-4 flex items-center gap-2">
            <Store size={16} className="text-accent" /> Temel Bilgiler
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">İşletme Adı</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} maxLength={120}
                className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm"
                placeholder="İşletme adınız..." />
            </div>
            <div>
              <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">Açıklama</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm resize-none"
                rows={2} placeholder="Kısa açıklama..." />
            </div>

            <ImageUploadField
              value={form.logo_url}
              onUpload={handleLogoUpload}
              onRemove={handleLogoRemove}
              label="İşletme Logosu"
              hint="JPG, PNG, WebP, GIF · max 5MB · kare format"
              themeColor={form.theme_color}
              previewSize={72}
              rounded={true}
            />
          </div>
        </div>

        {/* Tema */}
        <div className="ui-card rounded-3xl p-6">
          <h3 className="font-serif font-bold text-lg mb-4 flex items-center gap-2">
            <Palette size={16} className="text-accent" /> Tema & Görünüm
          </h3>
          <div className="mb-5">
            <label className="block text-[11px] font-bold mb-1 uppercase tracking-wider text-ink-muted">Tema Rengi</label>
            <p className="text-xs text-ink-muted mb-3">Müşteri menüsündeki butonlar ve vurgular bu renkte olur. Gündüz ve gece modunda okunurluk otomatik ayarlanır.</p>
            <ThemeColorPicker value={form.theme_color} onChange={hex => setForm(p => ({ ...p, theme_color: hex }))} />
          </div>
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface-2 border border-line">
            <span className="w-9 h-9 rounded-xl bg-surface border border-line flex items-center justify-center shrink-0 text-accent">
              <SunMoon size={16} />
            </span>
            <p className="text-sm text-ink-muted leading-relaxed">
              <strong className="text-ink">Gece / gündüz modu</strong> — Tema ayarı tüm ekranların sağ üstündeki güneş/ay düğmesiyle değiştiriliyor.
              Her cihaz kendi seçimini hatırlar; ilk açılışta cihazın sistem ayarı kullanılır.
            </p>
          </div>
        </div>

        {/* İletişim */}
        <div className="ui-card rounded-3xl p-6">
          <h3 className="font-serif font-bold text-lg mb-4 flex items-center gap-2">
            <BookUser size={16} className="text-accent" /> İletişim Bilgileri
          </h3>
          <div className="space-y-4">
            {[
              { key: 'contact_phone', label: 'Telefon', placeholder: '+90 555 000 00 00', icon: Phone },
              { key: 'contact_whatsapp', label: 'WhatsApp', placeholder: '+90 555 000 00 00', icon: MessageCircle },
              { key: 'contact_instagram', label: 'Instagram', placeholder: '@kullanici_adi', icon: Camera },
            ].map(field => (
              <div key={field.key}>
                <label className="flex items-center gap-1.5 text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted"><field.icon size={12} /> {field.label}</label>
                <input
                  value={(form as any)[field.key]}
                  onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm"
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Kaydet */}
        <button onClick={saveSettings}
          className="btn-primary w-full py-3.5 rounded-full text-sm font-bold tracking-wide flex items-center justify-center gap-2 spring-btn">
          <Save size={14} /> Kaydet
        </button>
      </div>
    </div>
  );
}
