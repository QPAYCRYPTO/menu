// apps/web/src/components/ImageUploadField.tsx
// Ortak görsel yükleme komponenti
//
// Özellikler:
// - Drag & drop alanı (kesik çizgili kenar, ortada icon)
// - Click → dosya seçici
// - Yükleme sırasında spinner + "Yükleniyor..."
// - Yüklenmişse preview + "Değiştir" / "Kaldır" butonları
// - Format ve boyut hint'i
//
// Kullanım:
// <ImageUploadField
//   value={form.image_url}
//   onUpload={async (file) => { ... döndür: image_url }}
//   onRemove={() => setForm(p => ({ ...p, image_url: '' }))}
//   label="Ürün Fotoğrafı"
//   hint="PNG/JPG · max 5MB"
// />

import { useRef, useState } from 'react';
import { CircleCheck, ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react';

type ImageUploadFieldProps = {
  /** Mevcut görsel URL'i (yoksa boş string) */
  value: string;
  /** Dosya seçilince çağrılır. Yükleme yapıp URL dönmeli, yoksa null. */
  onUpload: (file: File) => Promise<string | null>;
  /** Görseli kaldırmak için (Kaldır butonu) */
  onRemove?: () => void;
  /** Üst başlık (örn: "Ürün Fotoğrafı") */
  label?: string;
  /** Alt hint (örn: "PNG/JPG · max 5MB") */
  hint?: string;
  /** Renk teması (varsayılan turuncu vurgu) */
  themeColor?: string;
  /** Önizleme boyutu (varsayılan 96px = w-24) */
  previewSize?: number;
  /** Yuvarlak preview mı? (logo için true, ürün için false) */
  rounded?: boolean;
};

export function ImageUploadField({
  value,
  onUpload,
  onRemove,
  label,
  hint = 'PNG, JPG · max 5MB',
  themeColor = '#FF7A29',
  previewSize = 96,
  rounded = false
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  async function handleFile(file: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Lütfen bir resim dosyası seçin.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Dosya 5MB\'dan büyük olamaz.');
      return;
    }
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    onRemove?.();
  }

  const hasImage = !!value;

  return (
    <div>
      {label && (
        <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
          {label}
        </label>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Reset input so same file can be re-selected
          if (inputRef.current) inputRef.current.value = '';
        }}
        style={{ display: 'none' }}
      />

      {/* GÖRSELLİ DURUM — preview + butonlar */}
      {hasImage && !uploading && (
        <div className="glass-card flex items-center gap-4 p-3 rounded-2xl">
          <div className="flex-shrink-0 overflow-hidden bg-white/10"
            style={{
              width: previewSize,
              height: previewSize,
              borderRadius: rounded ? '50%' : 14,
              border: `2px solid ${themeColor}`
            }}>
            <img src={value} alt="Önizleme"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <div className="text-[13px] font-semibold text-white flex items-center gap-1.5">
              <CircleCheck size={13} style={{ color: 'var(--success)' }} /> Görsel yüklendi
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={openFilePicker}
                className="btn-accent px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 spring-btn">
                <RefreshCw size={10} /> Değiştir
              </button>
              {onRemove && (
                <button type="button" onClick={handleRemove}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 spring-btn"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                  <Trash2 size={10} /> Kaldır
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GÖRSELSİZ DURUM — drag & drop alanı */}
      {!hasImage && !uploading && (
        <div
          onClick={openFilePicker}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className="rounded-2xl text-center cursor-pointer"
          style={{
            padding: '28px 16px',
            background: dragActive ? 'var(--accent-soft)' : 'rgba(255,255,255,0.08)',
            border: `2px dashed ${dragActive ? 'var(--accent)' : 'rgba(255,255,255,0.35)'}`,
            transition: 'all 0.2s'
          }}>
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-lg text-white border border-white/40"
            style={{ background: 'var(--accent-soft)' }}>
            <ImageIcon size={18} />
          </div>
          <div className="text-sm font-semibold text-white mb-1 flex items-center justify-center gap-1.5">
            <Upload size={14} /> Görsel Yükle
          </div>
          <div className="text-xs text-white/70 mb-2">
            Tıkla veya sürükleyip bırak
          </div>
          <div className="text-[11px] text-white/50">
            {hint}
          </div>
        </div>
      )}

      {/* YÜKLENİYOR */}
      {uploading && (
        <div className="rounded-2xl text-center"
          style={{
            padding: '28px 16px',
            background: 'rgba(255,255,255,0.08)',
            border: '2px dashed rgba(255,255,255,0.35)'
          }}>
          <div className="w-8 h-8 mx-auto mb-3 rounded-full border-[3px] border-white/25 border-t-[var(--accent)] animate-spin" />
          <div className="text-[13px] font-semibold text-white/85">
            Yükleniyor...
          </div>
        </div>
      )}
    </div>
  );
}
