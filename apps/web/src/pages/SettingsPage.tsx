// apps/web/src/pages/SettingsPage.tsx
// İşletme ayarları — sekmeli tek form: Genel · Görünüm · İletişim · Wi-Fi · Hesap
// - Tüm sekmeler tek formu paylaşır; altta sabit Kaydet çubuğu yalnızca değişiklik varken etkin.
//   (Admin düzeninde sayfa belgeyle kaydığı ve içerik kutusu overflow'lu olduğu için `sticky` çalışmaz;
//   çubuk `fixed` ve yatayda sayfa kutusunun ölçülen konumuna hizalanır.)
// - Boşaltılan alan null olarak gönderilir (sunucu NULL yazar); gönderilmeyen alan korunur.
// - Logo: seçilince yalnızca yerel önizleme; dosya "Kaydet"te yüklenir. "Kaldır" → logo_url: null.
// - Hesap sekmesindeki şifre değiştirme ayrı bir işlemdir (işletme formuna dahil değil).
// - Eski "Arkaplan Rengi" / "Koyu Mod" alanları arayüzde yok; bg_color / dark_mode olduğu gibi geri gönderilir.

import type { BusinessSettingsResponse } from '@menu/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ImageUploadField } from '../components/ImageUploadField';
import { ThemeColorPicker } from '../components/ThemeColorPicker';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { businessThemeVars } from '../lib/businessTheme';
import { copyText } from '../lib/clipboard';
import { isHexColor, normalizeHex, readableTextOn } from '../lib/color';
import { useTheme } from '../lib/theme';
import {
  AtSign, BookUser, Camera, Copy, ExternalLink, Eye, EyeOff, KeyRound, Link2, LoaderCircle, Mail, MapPin,
  MessageCircle, Palette, Phone, RotateCcw, Save, ShoppingBag, Store, SunMoon, TriangleAlert, UserRound, Wifi
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';
const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://www.atlasqrmenu.com';

/** Sunucudaki doğrulamayla aynı */
const PHONE = /^\+?[\d\s\-()]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = {
  name: string; description: string; logo_url: string;
  theme_color: string; bg_color: string; dark_mode: boolean; is_accepting_orders: boolean;
  contact_name: string; contact_phone: string; contact_whatsapp: string; contact_instagram: string;
  contact_email: string; address: string;
  wifi_name: string; wifi_password: string;
};

type TabKey = 'genel' | 'gorunum' | 'iletisim' | 'wifi' | 'hesap';

const TABS: { key: TabKey; label: string; icon: typeof Store; fields: (keyof FormState)[] }[] = [
  { key: 'genel', label: 'Genel', icon: Store, fields: ['name', 'description', 'logo_url'] },
  { key: 'gorunum', label: 'Görünüm', icon: Palette, fields: ['theme_color', 'is_accepting_orders'] },
  { key: 'iletisim', label: 'İletişim', icon: BookUser,
    fields: ['contact_name', 'contact_phone', 'contact_whatsapp', 'contact_instagram', 'contact_email', 'address'] },
  { key: 'wifi', label: 'Wi-Fi', icon: Wifi, fields: ['wifi_name', 'wifi_password'] },
  { key: 'hesap', label: 'Hesap', icon: KeyRound, fields: [] }
];

function toForm(d: BusinessSettingsResponse): FormState {
  return {
    name: d.name ?? '', description: d.description ?? '', logo_url: d.logo_url ?? '',
    theme_color: d.theme_color && isHexColor(d.theme_color) ? normalizeHex(d.theme_color) : '#073f46',
    bg_color: d.bg_color ?? '#F8FAFC', dark_mode: d.dark_mode ?? false,
    is_accepting_orders: d.is_accepting_orders ?? true,
    contact_name: d.contact_name ?? '', contact_phone: d.contact_phone ?? '', contact_whatsapp: d.contact_whatsapp ?? '',
    contact_instagram: d.contact_instagram ?? '', contact_email: d.contact_email ?? '', address: d.address ?? '',
    wifi_name: d.wifi_name ?? '', wifi_password: d.wifi_password ?? ''
  };
}

/** Boş metin → null (sunucu NULL yazar) */
function orNull(value: string): string | null {
  const t = value.trim();
  return t === '' ? null : t;
}

/** Numarada ülke kodu var mı? (+ ile ya da 90 ile başlıyorsa var sayılır) */
function lacksCountryCode(phone: string): boolean {
  const t = phone.trim();
  if (!t) return false;
  return !t.startsWith('+') && !t.replace(/[^\d]/g, '').startsWith('90');
}

export function SettingsPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const tab: TabKey = TABS.some(t => t.key === tabParam) ? (tabParam as TabKey) : 'genel';
  function setTab(next: TabKey) {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (next === 'genel') p.delete('tab'); else p.set('tab', next);
      return p;
    }, { replace: true });
  }

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  // Aynı karede gelen art arda tıklamalar için senkron kilit (state bir sonraki çizime kadar güncellenmez)
  const savingRef = useRef(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [slug, setSlug] = useState('');
  const [saved, setSaved] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  // Logo: seçilen dosya "Kaydet"e kadar yalnızca yerelde tutulur
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const previewRef = useRef('');
  // Sabit Kaydet çubuğunu sayfa kutusuyla aynı hizaya getirmek için
  const rootRef = useRef<HTMLDivElement>(null);
  const [barBox, setBarBox] = useState<{ left: number; width: number } | null>(null);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  function clearLogoDraft() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = '';
    setLogoPreview('');
    setLogoFile(null);
  }
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  function applyServer(data: BusinessSettingsResponse) {
    const next = toForm(data);
    setSlug(data.slug);
    setSaved(next);
    setForm(next);
    clearLogoDraft();
  }

  async function loadSettings() {
    try {
      setLoading(true);
      setLoadError('');
      applyServer(await apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Ayarlar alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  // Yalnızca ilk kez token hazır olunca yükle: token yenilenince (oturum yenileme / şifre değişikliği)
  // yeniden yüklemek kaydedilmemiş değişiklikleri silerdi.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!accessToken || loadedOnce.current) return;
    loadedOnce.current = true;
    loadSettings().catch(() => undefined);
  }, [accessToken]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBarBox(prev => (prev && prev.left === r.left && prev.width === r.width ? prev : { left: r.left, width: r.width }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [loading, loadError]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev));
  }

  const changed = useMemo(() => {
    const keys = new Set<keyof FormState>();
    if (form && saved) {
      (Object.keys(form) as (keyof FormState)[]).forEach(k => { if (form[k] !== saved[k]) keys.add(k); });
    }
    if (logoFile) keys.add('logo_url');
    return keys;
  }, [form, saved, logoFile]);
  const dirty = changed.size > 0;

  // ── Logo ──────────────────────────────────────────────────────────────────
  async function handleLogoSelect(file: File): Promise<string | null> {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setLogoPreview(url);
    setLogoFile(file);
    return url;
  }

  function handleLogoRemove() {
    clearLogoDraft();
    set('logo_url', '');
  }

  async function uploadLogo(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/admin/upload/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData
    });
    if (!response.ok) {
      const p = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(p.message ?? 'Logo yüklenemedi.');
    }
    return ((await response.json()) as { logo_url: string }).logo_url;
  }

  // ── Kaydet ────────────────────────────────────────────────────────────────
  function fail(message: string, where: TabKey) {
    setTab(where);
    showToast(message, 'error');
  }

  async function saveSettings() {
    if (!form || !dirty || savingRef.current || loadError) return;
    if (!form.name.trim()) return fail('İşletme adı boş olamaz.', 'genel');
    if (!isHexColor(form.theme_color)) return fail('Tema rengi geçerli bir hex kodu olmalı (örn. #c2410c).', 'gorunum');
    if (form.contact_phone.trim() && !PHONE.test(form.contact_phone.trim())) return fail('Telefon numarası geçersiz.', 'iletisim');
    if (form.contact_whatsapp.trim() && !PHONE.test(form.contact_whatsapp.trim())) return fail('WhatsApp numarası geçersiz.', 'iletisim');
    if (form.contact_email.trim() && !EMAIL.test(form.contact_email.trim())) return fail('E-posta adresi geçersiz.', 'iletisim');

    savingRef.current = true;
    setSaving(true);
    try {
      let logoUrl: string | null = orNull(form.logo_url);
      if (logoFile) logoUrl = await uploadLogo(logoFile);

      const data = await apiRequest<BusinessSettingsResponse>('/admin/business', {
        method: 'PUT', token: accessToken,
        body: {
          name: form.name.trim(),
          description: orNull(form.description),
          logo_url: logoUrl,
          theme_color: normalizeHex(form.theme_color),
          bg_color: form.bg_color,
          dark_mode: form.dark_mode,
          is_accepting_orders: form.is_accepting_orders,
          contact_name: orNull(form.contact_name),
          contact_phone: orNull(form.contact_phone),
          contact_whatsapp: orNull(form.contact_whatsapp),
          contact_instagram: orNull(form.contact_instagram),
          contact_email: orNull(form.contact_email),
          address: orNull(form.address),
          wifi_name: orNull(form.wifi_name),
          // Şifrede boşluklar anlamlı olabilir; yalnızca tamamen boşsa null
          wifi_password: form.wifi_password.trim() === '' ? null : form.wifi_password
        }
      });
      applyServer(data); // PUT güncel kaydı döndürür; ikinci GET yok
      showToast('Ayarlar kaydedildi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Kaydedilemedi.', 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function discardChanges() {
    if (!saved) return;
    setForm(saved);
    clearLogoDraft();
  }

  // ── Görünüm ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin"></div>
    </div>
  );

  if (loadError || !form) return (
    <div className="max-w-3xl text-ink">
      <div className="ui-card rounded-3xl p-6 flex items-start gap-4">
        <span className="w-11 h-11 rounded-2xl bg-state-danger-bg text-state-danger flex items-center justify-center shrink-0">
          <TriangleAlert size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="font-serif font-bold text-lg">Ayarlar yüklenemedi</h3>
          <p className="text-sm text-ink-muted mt-1">{loadError || 'Bilinmeyen hata.'} Kaydetme, veriler yüklenene kadar kapalı.</p>
          <button onClick={() => loadSettings()} className="btn-outline mt-4 px-4 py-2 rounded-full text-sm font-bold inline-flex items-center gap-2 spring-btn">
            <RotateCcw size={14} /> Tekrar dene
          </button>
        </div>
      </div>
    </div>
  );

  const logoShown = logoPreview || form.logo_url;
  const menuUrl = `${PUBLIC_BASE_URL}/m/${slug}`;

  return (
    <div ref={rootRef} className="max-w-3xl text-ink pb-24">
      <Toast state={toast} />

      {/* Sekmeler */}
      <div className="flex gap-1 p-1 mb-5 rounded-2xl bg-surface-2 border border-line overflow-x-auto scrollbar-none" role="tablist">
        {TABS.map(t => {
          const active = tab === t.key;
          const tabDirty = t.fields.some(f => changed.has(f));
          return (
            <button key={t.key} role="tab" aria-selected={active} onClick={() => setTab(t.key)}
              className={`relative flex-1 min-w-fit px-3.5 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap spring-btn ${
                active ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'}`}>
              <t.icon size={14} /> {t.label}
              {tabDirty && <span className="w-1.5 h-1.5 rounded-full bg-state-warn" aria-label="kaydedilmemiş değişiklik" />}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6">
        {tab === 'genel' && (
          <>
            <Preview form={form} logo={logoShown} />

            <Section icon={Store} title="Temel Bilgiler">
              <Field label="İşletme Adı">
                <input value={form.name} onChange={e => set('name', e.target.value)} maxLength={120}
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" placeholder="İşletme adınız..." />
              </Field>
              <Field label="Açıklama" hint='Menü başlığında 2 satır görünür; uzunsa müşteri "Devamını oku" ile tamamını açar.'
                counter={`${form.description.length}/2000`}>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} maxLength={2000}
                  className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm resize-none" rows={2}
                  placeholder="Örn. Ev yapımı kahvaltı & üçüncü dalga kahve" />
              </Field>
              <div>
                <ImageUploadField
                  value={logoShown}
                  onUpload={handleLogoSelect}
                  onRemove={handleLogoRemove}
                  label="İşletme Logosu"
                  hint="JPG, PNG, WebP, GIF · max 5MB · kare format"
                  themeColor={form.theme_color}
                  previewSize={72}
                  rounded={true}
                />
                {logoFile && <p className="text-xs text-state-warn font-semibold mt-2">Yeni logo "Kaydet"e basınca yüklenecek.</p>}
                {!logoShown && saved?.logo_url && <p className="text-xs text-state-warn font-semibold mt-2">Logo "Kaydet"e basınca kaldırılacak.</p>}
              </div>
            </Section>

            <Section icon={Link2} title="Menü Linki">
              <div className="text-sm text-ink-muted -mt-1 space-y-1.5">
                <p>
                  İşletmenizin <strong className="text-ink">masasız menü adresi</strong>. Instagram profilinize, Google Haritalar kaydınıza,
                  web sitenize ya da WhatsApp'tan müşterilere gönderebilirsiniz.
                </p>
                <p>
                  Bu linkten açılan menüde ürünler, fiyatlar ve iletişim bilgileri görünür; <strong className="text-ink">sipariş verilemez</strong>.
                  Sipariş için masadaki QR kod okutulur (QR Kod sayfasındaki masa kodları bu adrese masa bilgisini ekler).
                </p>
              </div>
              <div className="rounded-2xl bg-surface-2 border border-line px-4 py-3 font-mono text-sm break-all">{menuUrl}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={async () => {
                  const ok = await copyText(menuUrl);
                  showToast(ok ? 'Link kopyalandı.' : 'Kopyalanamadı.', ok ? 'success' : 'error');
                }}
                  className="btn-outline px-4 py-2 rounded-full text-sm font-bold inline-flex items-center gap-2 spring-btn">
                  <Copy size={14} /> Kopyala
                </button>
                <a href={menuUrl} target="_blank" rel="noopener noreferrer"
                  className="btn-outline px-4 py-2 rounded-full text-sm font-bold inline-flex items-center gap-2 spring-btn">
                  <ExternalLink size={14} /> Menüyü Aç
                </a>
              </div>
            </Section>
          </>
        )}

        {tab === 'gorunum' && (
          <>
            <Preview form={form} logo={logoShown} />

            <Section icon={Palette} title="Tema Rengi">
              <p className="text-xs text-ink-muted -mt-1">Müşteri menüsündeki butonlar ve vurgular bu renkte olur. Gündüz ve gece modunda okunurluk otomatik ayarlanır.</p>
              <ThemeColorPicker value={form.theme_color} onChange={hex => set('theme_color', hex)} />
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface-2 border border-line">
                <span className="w-9 h-9 rounded-xl bg-surface border border-line flex items-center justify-center shrink-0 text-accent">
                  <SunMoon size={16} />
                </span>
                <p className="text-sm text-ink-muted leading-relaxed">
                  <strong className="text-ink">Gece / gündüz modu</strong> — Tema ayarı tüm ekranların sağ üstündeki güneş/ay düğmesiyle değiştiriliyor.
                  Her cihaz kendi seçimini hatırlar; ilk açılışta cihazın sistem ayarı kullanılır.
                </p>
              </div>
            </Section>

            <Section icon={ShoppingBag} title="Sipariş Alımı">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-bold">{form.is_accepting_orders ? 'Sipariş alımı açık' : 'Sipariş alımı kapalı'}</div>
                  <p className="text-sm text-ink-muted mt-0.5">Kapatınca QR menüden yeni sipariş alınmaz; menü görüntülenmeye devam eder.</p>
                </div>
                <Switch checked={form.is_accepting_orders} onChange={v => set('is_accepting_orders', v)} label="Sipariş alımı" />
              </div>
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-state-warn-bg text-state-warn text-xs font-semibold">
                <TriangleAlert size={14} className="shrink-0 mt-px" />
                Önizleme: bu ayar şimdilik yalnızca kaydediliyor. Müşteri menüsünde sipariş düğmesinin kapanması bir sonraki adımda eklenecek.
              </div>
            </Section>
          </>
        )}

        {tab === 'iletisim' && (
          <Section icon={BookUser} title="İletişim Bilgileri">
            <p className="text-sm text-ink-muted -mt-1">Doldurulan alanlar müşteri menüsünün altındaki iletişim kartında görünür (yetkili adı hariç).</p>
            <Field label="Yetkili Adı" icon={UserRound} hint="Müşteriye gösterilmez; destek için kullanılır.">
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} maxLength={120}
                className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" placeholder="Ad Soyad" />
            </Field>
            <Field label="Telefon" icon={Phone}
              error={form.contact_phone.trim() && !PHONE.test(form.contact_phone.trim()) ? 'Geçersiz numara (7–20 rakam; + ( ) - kullanılabilir).' : ''}>
              <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} inputMode="tel" maxLength={20}
                className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" placeholder="+90 555 000 00 00" />
            </Field>
            <Field label="WhatsApp" icon={MessageCircle}
              error={form.contact_whatsapp.trim() && !PHONE.test(form.contact_whatsapp.trim()) ? 'Geçersiz numara (7–20 rakam; + ( ) - kullanılabilir).' : ''}
              warning={PHONE.test(form.contact_whatsapp.trim()) && lacksCountryCode(form.contact_whatsapp)
                ? 'Ülke kodu yok (ör. +90). Türkiye numarası varsayılacak; yurt dışı numarada bağlantı çalışmayabilir.' : ''}>
              <input value={form.contact_whatsapp} onChange={e => set('contact_whatsapp', e.target.value)} inputMode="tel" maxLength={20}
                className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" placeholder="+90 555 000 00 00" />
            </Field>
            <Field label="Instagram" icon={Camera}>
              <input value={form.contact_instagram} onChange={e => set('contact_instagram', e.target.value)} maxLength={120}
                className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" placeholder="@kullanici_adi" />
            </Field>
            <Field label="E-posta" icon={Mail}
              error={form.contact_email.trim() && !EMAIL.test(form.contact_email.trim()) ? 'Geçersiz e-posta adresi.' : ''}>
              <input value={form.contact_email} onChange={e => set('contact_email', e.target.value)} type="email" maxLength={160}
                className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" placeholder="iletisim@isletme.com" />
            </Field>
            <Field label="Adres" icon={MapPin} hint='Menüde "Yol tarifi" bağlantısı olarak görünür.'>
              <textarea value={form.address} onChange={e => set('address', e.target.value)} maxLength={500} rows={2}
                className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm resize-none" placeholder="Mahalle, cadde, no — ilçe / il" />
            </Field>
          </Section>
        )}

        {tab === 'wifi' && <WifiSection form={form} set={set} />}

        {tab === 'hesap' && <AccountSection />}
      </div>

      {/* Sabit Kaydet çubuğu — tüm sekmeleri kapsayan tek form */}
      <div className="fixed bottom-0 z-30 pb-3 pt-6 bg-gradient-to-t from-[var(--bg)] from-60% to-transparent"
        style={barBox ? { left: barBox.left, width: barBox.width } : { left: 0, right: 0 }}>
        <div className="ui-card rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dirty ? 'bg-state-warn' : 'bg-state-ok'}`} />
          <span className="text-sm font-semibold text-ink-muted min-w-0 truncate">
            {saving ? 'Kaydediliyor…' : dirty ? `${changed.size} alanda kaydedilmemiş değişiklik` : 'Tüm değişiklikler kaydedildi'}
          </span>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {dirty && !saving && (
              <button onClick={discardChanges} className="btn-outline px-3.5 py-2 rounded-full text-sm font-bold inline-flex items-center gap-1.5 spring-btn">
                <RotateCcw size={14} /> <span className="hidden sm:inline">Geri al</span>
              </button>
            )}
            <button onClick={saveSettings} disabled={!dirty || saving}
              className="btn-primary px-5 py-2 rounded-full text-sm font-bold inline-flex items-center gap-2 spring-btn">
              {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Kaydediliyor' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Parçalar ────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: typeof Store; title: string; children: React.ReactNode }) {
  return (
    <div className="ui-card rounded-3xl p-6">
      <h3 className="font-serif font-bold text-lg mb-4 flex items-center gap-2">
        <Icon size={16} className="text-accent" /> {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, icon: Icon, hint, counter, error, warning, children }: {
  label: string; icon?: typeof Store; hint?: string; counter?: string; error?: string; warning?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
        {Icon && <Icon size={12} />} {label}
        {counter && <span className="ml-auto normal-case tracking-normal font-semibold">{counter}</span>}
      </label>
      {children}
      {error ? <p className="text-xs font-semibold text-state-danger mt-1.5">{error}</p>
        : warning ? <p className="text-xs font-semibold text-state-warn mt-1.5">{warning}</p>
        : hint ? <p className="text-xs text-ink-muted mt-1.5">{hint}</p> : null}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative w-14 h-8 rounded-full shrink-0 transition-colors border ${checked ? 'bg-brand border-transparent' : 'bg-surface-2 border-line'}`}>
      <span className={`absolute top-1 w-6 h-6 rounded-full shadow transition-all ${checked ? 'left-7 bg-[var(--on-brand)]' : 'left-1 bg-[var(--ink-muted)]'}`} />
    </button>
  );
}

/** Müşteri menüsü başlığının önizlemesi (logo, ad, açıklama; açıklama rengi menüdeki gibi okunurluk ayarlı) */
function Preview({ form, logo }: { form: FormState; logo: string }) {
  const { theme } = useTheme();
  const hex = isHexColor(form.theme_color) ? normalizeHex(form.theme_color) : '#073f46';
  const vars = businessThemeVars(hex);
  const accent = theme === 'dark' ? vars['--biz-accent-dark'] : vars['--biz-accent-light'];
  return (
    <div className="ui-card rounded-3xl p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider mb-3 px-3 pt-2 text-ink-muted flex items-center gap-2">
        <Eye size={11} className="text-accent" /> Canlı Önizleme
      </p>
      <div className="rounded-2xl p-5 bg-page border border-line">
        <div className="flex items-center gap-4">
          {logo ? (
            <img src={logo} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-line" />
          ) : (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center font-bold text-xl"
              style={{ background: hex, color: readableTextOn(hex) }}>
              {form.name?.charAt(0) || 'A'}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-serif font-bold text-xl">{form.name || 'İşletme Adı'}</div>
            {form.description && <div className="text-xs font-semibold leading-snug mt-1 line-clamp-2 break-words" style={{ color: accent }}>{form.description}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function WifiSection({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  const [show, setShow] = useState(false);
  return (
    <Section icon={Wifi} title="Wi-Fi">
      <p className="text-sm text-ink-muted -mt-1">
        Doldurulursa müşteri menüsünde ağ adı ve şifreyi gösteren, şifreyi tek dokunuşla kopyalayan bir kart çıkar.
        Menü herkese açık olduğundan şifre de herkese görünür.
      </p>
      <Field label="Ağ Adı (SSID)" icon={Wifi}>
        <input value={form.wifi_name} onChange={e => set('wifi_name', e.target.value)} maxLength={64}
          className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" placeholder="Kafe_Misafir" />
      </Field>
      <Field label="Şifre" icon={KeyRound} hint="Şifresiz ağ için boş bırakın.">
        <div className="relative">
          <input value={form.wifi_password} onChange={e => set('wifi_password', e.target.value)} maxLength={128}
            type={show ? 'text' : 'password'} autoComplete="off"
            className="ui-input w-full pl-4 pr-11 py-2.5 rounded-2xl text-sm" placeholder="••••••••" />
          <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>
      {form.wifi_name.trim() && (
        <div>
          <p className="text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">Menüde görünümü</p>
          <div className="rounded-2xl bg-page border border-line p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-surface border border-line text-accent flex items-center justify-center shrink-0"><Wifi size={18} /></span>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{form.wifi_name}</div>
              <div className="text-xs text-ink-muted truncate">{form.wifi_password ? `Şifre: ${form.wifi_password}` : 'Şifresiz ağ'}</div>
            </div>
            {form.wifi_password && <span className="ui-chip px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5"><Copy size={12} /> Kopyala</span>}
          </div>
        </div>
      )}
    </Section>
  );
}

function AccountSection() {
  const { accessToken, email, setSessionTokens } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = repeat.length > 0 && next !== repeat;
  const canSubmit = current.length > 0 && next.length >= 8 && next === repeat && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    try {
      const tokens = await apiRequest<{ access_token: string; refresh_token: string }>('/auth/change-password', {
        method: 'POST', token: accessToken,
        body: { current_password: current, new_password: next }
      });
      setSessionTokens(tokens.access_token, tokens.refresh_token);
      setCurrent(''); setNext(''); setRepeat('');
      setResult({ ok: true, text: 'Şifreniz güncellendi. Diğer cihazlardaki oturumlar kapatıldı.' });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'Şifre güncellenemedi.' });
    } finally {
      setBusy(false);
    }
  }

  const inputType = show ? 'text' : 'password';
  return (
    <>
      <Section icon={AtSign} title="Hesap">
        <Field label="Giriş E-postası" hint="Değiştirmek için destekle iletişime geçin.">
          <div className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm bg-surface-2 text-ink-muted">{email ?? '—'}</div>
        </Field>
      </Section>

      <Section icon={KeyRound} title="Şifre Değiştir">
        <p className="text-sm text-ink-muted -mt-1">Bu işlem işletme ayarlarından bağımsızdır; alttaki "Kaydet" çubuğunu kullanmaz.</p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Mevcut Şifre">
            <input value={current} onChange={e => setCurrent(e.target.value)} type={inputType} autoComplete="current-password"
              className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" />
          </Field>
          <Field label="Yeni Şifre" error={tooShort ? 'En az 8 karakter olmalı.' : ''}>
            <input value={next} onChange={e => setNext(e.target.value)} type={inputType} autoComplete="new-password"
              className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" placeholder="En az 8 karakter" />
          </Field>
          <Field label="Yeni Şifre (Tekrar)" error={mismatch ? 'Şifreler eşleşmiyor.' : ''}>
            <input value={repeat} onChange={e => setRepeat(e.target.value)} type={inputType} autoComplete="new-password"
              className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-muted select-none cursor-pointer w-fit">
            <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} className="accent-[var(--brand)]" />
            Şifreleri göster
          </label>
          {result && (
            <div className={`px-4 py-3 rounded-2xl text-sm font-semibold ${result.ok ? 'bg-state-ok-bg text-state-ok' : 'bg-state-danger-bg text-state-danger'}`}>
              {result.text}
            </div>
          )}
          <button type="submit" disabled={!canSubmit}
            className="btn-primary px-5 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2 spring-btn">
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {busy ? 'Güncelleniyor' : 'Şifreyi Güncelle'}
          </button>
        </form>
      </Section>
    </>
  );
}
