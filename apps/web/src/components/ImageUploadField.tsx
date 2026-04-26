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
  /** Renk teması (varsayılan turkuaz) */
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
  themeColor = '#0D9488',
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
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: '#64748B' }}>
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: 12,
          background: '#F8FAFC',
          border: '1.5px solid #E2E8F0',
          borderRadius: 12
        }}>
          <div style={{
            width: previewSize,
            height: previewSize,
            borderRadius: rounded ? '50%' : 12,
            overflow: 'hidden',
            border: `2px solid ${themeColor}`,
            flexShrink: 0,
            background: 'white'
          }}>
            <img src={value} alt="Önizleme"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
              ✓ Görsel yüklendi
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={openFilePicker}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: themeColor,
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                🔄 Değiştir
              </button>
              {onRemove && (
                <button type="button" onClick={handleRemove}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #FECACA',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}>
                  🗑️ Kaldır
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
          style={{
            cursor: 'pointer',
            padding: '32px 16px',
            background: dragActive ? `${themeColor}15` : '#F8FAFC',
            border: `2px dashed ${dragActive ? themeColor : '#CBD5E1'}`,
            borderRadius: 12,
            textAlign: 'center',
            transition: 'all 0.2s'
          }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: `${themeColor}20`,
            margin: '0 auto 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke={themeColor} strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>
            📷 Görsel Yükle
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
            Tıkla veya sürükleyip bırak
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>
            {hint}
          </div>
        </div>
      )}

      {/* YÜKLENİYOR */}
      {uploading && (
        <div style={{
          padding: '32px 16px',
          background: '#F8FAFC',
          border: '2px dashed #CBD5E1',
          borderRadius: 12,
          textAlign: 'center'
        }}>
          <div style={{
            width: 32,
            height: 32,
            margin: '0 auto 12px',
            borderRadius: '50%',
            border: `3px solid ${themeColor}`,
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite'
          }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: themeColor }}>
            Yükleniyor...
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}