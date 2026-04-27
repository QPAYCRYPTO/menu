// apps/web/src/components/Toast.tsx
// Ortak toast (bildirim) komponenti
//
// Kullanım:
//   const [toast, setToast] = useState<ToastState>(null);
//   ...
//   showToast('Kaydedildi.', 'success', setToast);
//   ...
//   <Toast state={toast} />
//
// Özellikler:
// - Tüm sayfalarda aynı yerde belirir (sağ üst)
// - Aynı animasyon (slide-in, slide-out)
// - Success (yeşil) / Error (kırmızı) / Info (mavi)
// - 2.4 saniye sonra otomatik kapanır

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';
export type ToastState = { message: string; type: ToastType } | null;

const STYLES: Record<ToastType, { bg: string; color: string; border: string; icon: string }> = {
  success: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', icon: '✓' },
  error:   { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', icon: '✕' },
  info:    { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE', icon: 'ℹ' }
};

/**
 * Toast komponenti — sağ üstte sabit konumda belirir.
 * Sadece state varken render edilir, yoksa hiç DOM'da olmaz.
 */
export function Toast({ state }: { state: ToastState }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state) {
      // İçerik geldiği anda görünür yap (slide-in animasyonu için)
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [state]);

  if (!state) return null;

  const style = STYLES[state.type];

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 500,
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)',
        maxWidth: 380,
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.25s ease-out, opacity 0.25s ease-out',
        pointerEvents: 'auto'
      }}
      role="alert"
    >
      <div style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: style.color,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0
      }}>
        {style.icon}
      </div>
      <span>{state.message}</span>
    </div>
  );
}

/**
 * Toast göstermek için yardımcı fonksiyon.
 * Sayfada showToast tanımlamak yerine bunu kullanabilirsin.
 *
 * Örnek:
 *   showToast('Kaydedildi.', 'success', setToast);
 */
export function showToast(
  message: string,
  type: ToastType,
  setter: (state: ToastState) => void,
  durationMs = 2400
) {
  setter({ message, type });
  window.setTimeout(() => setter(null), durationMs);
}