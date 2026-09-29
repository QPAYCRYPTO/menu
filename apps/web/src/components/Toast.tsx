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
// - Gece/gündüz uyumlu: yüzey --surface, kenar ve ikon durum rengi (--state-*)

import { useEffect, useState } from 'react';
import { Check, Info, X, type LucideIcon } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';
export type ToastState = { message: string; type: ToastType } | null;

const STYLES: Record<ToastType, { bg: string; color: string; icon: LucideIcon }> = {
  success: { bg: 'var(--state-ok-bg)', color: 'var(--state-ok)', icon: Check },
  error:   { bg: 'var(--state-danger-bg)', color: 'var(--state-danger)', icon: X },
  info:    { bg: 'var(--state-info-bg)', color: 'var(--state-info)', icon: Info }
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
  const Icon = style.icon;

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
        background: 'var(--surface)',
        backgroundImage: `linear-gradient(${style.bg}, ${style.bg})`,
        color: 'var(--ink)',
        border: `1px solid ${style.color}`,
        boxShadow: 'var(--shadow), 0 8px 24px rgba(0,0,0,0.12)',
        borderRadius: 16,
        fontSize: 14,
        fontWeight: 600,
        maxWidth: 'min(380px, calc(100vw - 48px))',
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
        color: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0
      }}>
        <Icon size={13} strokeWidth={3} />
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