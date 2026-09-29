// apps/web/src/components/ConfirmModal.tsx
// Ortak onay (silme/kritik aksiyon) modal komponenti
//
// Kullanım:
//   const [confirm, setConfirm] = useState<ConfirmState>(null);
//   ...
//   setConfirm({
//     title: 'Masayı Sil?',
//     message: <><strong>MASA 5</strong> kalıcı olarak pasif yapılacak.</>,
//     confirmText: 'Evet, Sil',
//     onConfirm: () => deleteTable(...)
//   });
//   ...
//   <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />
//
// Özellikler:
// - Sayfaya özel ikon ve renk (danger / warning / info)
// - Markayla uyumlu (Georgia serif başlık)
// - Slide-in animasyon
// - ESC tuşuyla kapanır
// - Overlay'e tıklayınca kapanır
// - Mobile sığar

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Info, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';

export type ConfirmTone = 'danger' | 'warning' | 'info';

export type ConfirmState = {
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  onConfirm: () => void | Promise<void>;
} | null;

// Gece/gündüz uyumlu: tehlikeli işlem kırmızı dolgu (yazı zemin rengiyle → iki temada okunur),
// diğerleri birincil petrol buton
const TONES: Record<ConfirmTone, {
  iconBg: string;
  iconColor: string;
  buttonBg: string;
  buttonColor: string;
  icon: LucideIcon;
}> = {
  danger: {
    iconBg: 'var(--state-danger-bg)',
    iconColor: 'var(--state-danger)',
    buttonBg: 'var(--state-danger)',
    buttonColor: 'var(--bg)',
    icon: Trash2
  },
  warning: {
    iconBg: 'var(--state-warn-bg)',
    iconColor: 'var(--state-warn)',
    buttonBg: 'var(--brand)',
    buttonColor: 'var(--on-brand)',
    icon: TriangleAlert
  },
  info: {
    iconBg: 'var(--state-info-bg)',
    iconColor: 'var(--state-info)',
    buttonBg: 'var(--brand)',
    buttonColor: 'var(--on-brand)',
    icon: Info
  }
};

type ConfirmModalProps = {
  state: ConfirmState;
  onClose: () => void;
};

export function ConfirmModal({ state, onClose }: ConfirmModalProps) {
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      setSubmitting(false);
    }
  }, [state]);

  // ESC ile kapat
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, submitting, onClose]);

  if (!state) return null;

  const tone = TONES[state.tone ?? 'danger'];
  const confirmText = state.confirmText ?? 'Onayla';
  const cancelText = state.cancelText ?? 'Vazgeç';

  async function handleConfirm() {
    if (submitting || !state) return;
    setSubmitting(true);
    try {
      await state.onConfirm();
      onClose();
    } catch (e) {
      // Hata yönetimi çağıran tarafta yapılmalı (toast vs)
      // Modal'ı kapatmıyoruz, kullanıcı tekrar deneyebilsin
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={() => !submitting && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: visible ? 'var(--scrim)' : 'transparent',
        backdropFilter: visible ? 'blur(4px)' : 'blur(0px)',
        WebkitBackdropFilter: visible ? 'blur(4px)' : 'blur(0px)',
        transition: 'background 0.2s ease-out, backdrop-filter 0.2s ease-out'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="ui-card rounded-3xl"
        style={{
          width: '100%',
          maxWidth: 380,
          overflow: 'hidden',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-10px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.2s ease-out, opacity 0.2s ease-out'
        }}
      >
        {/* İkon + Başlık + Mesaj */}
        <div style={{ padding: '28px 24px 16px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            width: 56,
            height: 56,
            background: tone.iconBg,
            borderRadius: '50%',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14
          }}>
            <tone.icon size={26} color={tone.iconColor} strokeWidth={2} />
          </div>
          <div className="font-serif" style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 8
          }}>
            {state.title}
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--ink-muted)',
            lineHeight: 1.5
          }}>
            {state.message}
          </div>
        </div>

        {/* Butonlar */}
        <div style={{
          padding: '16px 20px 20px',
          display: 'flex',
          gap: 10
        }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="btn-outline spring-btn"
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 14,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="spring-btn"
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 999,
              background: tone.buttonBg,
              color: tone.buttonColor,
              fontWeight: 700,
              fontSize: 14,
              border: '1px solid transparent',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1
            }}
          >
            {submitting ? 'İşleniyor...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}