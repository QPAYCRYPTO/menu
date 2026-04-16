// apps/web/src/pages/SettingsPage.tsx
import type { BusinessSettingsResponse, UploadResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';

type ToastState = { message: string; type: 'error' | 'success' } | null;
type FormState = { name: string; logo_url: string; theme_color: string; bg_color: string; dark_mode: boolean; description: string; contact_phone: string; contact_whatsapp: string; contact_instagram: string; };

export function SettingsPage() {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [form, setForm] = useState<FormState>({ name: '', logo_url: '', theme_color: '#0D9488', bg_color: '#F8FAFC', dark_mode: false, description: '', contact_phone: '', contact_whatsapp: '', contact_instagram: '' });

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
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

  async function uploadLogo(file: File | null) {
    if (!file || !accessToken) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploading(true);
      const response = await fetch(`${API_BASE_URL}/admin/upload`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData });
      if (!response.ok) { const p = (await response.json().catch(() => ({}))) as { message?: string }; throw new Error(p.message ?? 'Logo yüklenemedi.'); }
      const data = (await response.json()) as UploadResponse;
      setForm(prev => ({ ...prev, logo_url: data.image_url }));
      showToast('Logo yüklendi.', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Logo yüklenemedi.', 'error'); }
    finally { setUploading(false); }
  }

  async function saveSettings() {
    const name = form.name.trim();
    if (!name) { showToast('İşletme adı boş olamaz.', 'error'); return; }
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
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor: '#0D9488', borderTopColor: 'transparent'}}></div>
    </div>
  );

  return (
    <div className="max-w-3xl">
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: toast.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`}}>
          {toast.message}
        </div>
      )}

      <div className="grid gap-6">

        {/* Canlı Önizleme */}
        <div className="rounded-2xl p-6 shadow-sm" style={{background: form.bg_color, border: `2px solid ${form.theme_color}20`}}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{color: form.theme_color}}>Canlı Önizleme</p>
          <div className="flex items-center gap-4">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="w-16 h-16 rounded-xl object-cover" style={{border: `2px solid ${form.theme_color}`}} />
            ) : (
              <div className="w-16 h-16 rounded-xl flex items-center justify-center font-bold text-xl text-white" style={{background: form.theme_color}}>
                {form.name?.charAt(0) || 'A'}
              </div>
            )}
            <div>
              <div className="font-bold text-lg" style={{color: form.dark_mode ? '#F8FAFC' : '#0F172A', fontFamily: 'Georgia, serif'}}>{form.name || 'İşletme Adı'}</div>
              {form.description && <div className="text-sm mt-0.5" style={{color: form.dark_mode ? '#94A3B8' : '#64748B'}}>{form.description}</div>}
              <div className="flex gap-2 mt-2">
                <div className="w-4 h-4 rounded-full" style={{background: form.theme_color}}></div>
                <div className="w-4 h-4 rounded-full" style={{background: form.bg_color, border: '1px solid #E2E8F0'}}></div>
                <div className="w-4 h-4 rounded-full" style={{background: form.dark_mode ? '#0F172A' : '#F1F5F9'}}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Temel Bilgiler */}
        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{border: '1px solid #E2E8F0'}}>
          <h3 className="font-bold mb-4" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Temel Bilgiler</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>İşletme Adı</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} maxLength={120}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                placeholder="İşletme adınız..." />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Açıklama</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                rows={2} placeholder="Kısa açıklama..." />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Logo</label>
              <input type="file" accept="image/*" onChange={e => uploadLogo(e.target.files?.[0] ?? null)}
                className="w-full px-4 py-2 rounded-xl text-sm"
                style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#64748B'}} />
              {uploading && <p className="text-xs mt-1" style={{color: '#0D9488'}}>Logo yükleniyor...</p>}
            </div>
          </div>
        </div>

        {/* Tema */}
        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{border: '1px solid #E2E8F0'}}>
          <h3 className="font-bold mb-4" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Tema & Görünüm</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Tema Rengi</label>
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl" style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC'}}>
                <input type="color" value={form.theme_color} onChange={e => setForm(p => ({ ...p, theme_color: e.target.value }))} className="w-8 h-8 rounded-lg cursor-pointer border-0" />
                <span className="text-sm font-mono" style={{color: '#0F172A'}}>{form.theme_color}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>Arkaplan Rengi</label>
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl" style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC'}}>
                <input type="color" value={form.bg_color} onChange={e => setForm(p => ({ ...p, bg_color: e.target.value }))} className="w-8 h-8 rounded-lg cursor-pointer border-0" />
                <span className="text-sm font-mono" style={{color: '#0F172A'}}>{form.bg_color}</span>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input type="checkbox" checked={form.dark_mode} onChange={e => setForm(p => ({ ...p, dark_mode: e.target.checked }))} className="sr-only" />
                <div className="w-10 h-6 rounded-full transition-all" style={{background: form.dark_mode ? '#0D9488' : '#E2E8F0'}}>
                  <div className="w-5 h-5 bg-white rounded-full shadow transition-all mt-0.5" style={{marginLeft: form.dark_mode ? '18px' : '2px'}}></div>
                </div>
              </div>
              <span className="text-sm font-medium" style={{color: '#0F172A'}}>Koyu Mod</span>
            </label>
          </div>
        </div>

        {/* İletişim */}
        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{border: '1px solid #E2E8F0'}}>
          <h3 className="font-bold mb-4" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>İletişim Bilgileri</h3>
          <div className="space-y-4">
            {[
              { key: 'contact_phone', label: 'Telefon', placeholder: '+90 555 000 00 00', icon: '📞' },
              { key: 'contact_whatsapp', label: 'WhatsApp', placeholder: '+90 555 000 00 00', icon: '💬' },
              { key: 'contact_instagram', label: 'Instagram', placeholder: '@kullanici_adi', icon: '📸' },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{color: '#64748B'}}>{field.icon} {field.label}</label>
                <input
                  value={(form as any)[field.key]}
                  onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Kaydet */}
        <button onClick={saveSettings}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white tracking-wide"
          style={{background: '#0F172A'}}>
          Kaydet
        </button>
      </div>
    </div>
  );
}