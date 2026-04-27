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

export type ConfirmTone = 'danger' | 'warning' | 'info';

export type ConfirmState = {
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  onConfirm: () => void | Promise<void>;
} | null;

const TONES: Record<ConfirmTone, {
  iconBg: string;
  iconColor: string;
  buttonBg: string;
  buttonHover: string;
  iconPath: ReactNode;
}> = {
  danger: {
    iconBg: '#FEF2F2',
    iconColor: '#DC2626',
    buttonBg: '#DC2626',
    buttonHover: '#B91C1C',
    iconPath: (
      <>
        <path d="M3 6h18"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        <line x1="10" y1="11" x2="10" y2="17"/>
        <line x1="14" y1="11" x2="14" y2="17"/>
      </>
    )
  },
  warning: {
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    buttonBg: '#D97706',
    buttonHover: '#B45309',
    iconPath: (
      <>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </>
    )
  },
  info: {
    iconBg: '#EFF6FF',
    iconColor: '#2563EB',
    buttonBg: '#2563EB',
    buttonHover: '#1D4ED8',
    iconPath: (
      <>
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </>
    )
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
        background: visible ? 'rgba(15, 23, 42, 0.6)' : 'rgba(15, 23, 42, 0)',
        transition: 'background 0.2s ease-out'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 380,
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
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
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"
              viewBox="0 0 24 24" fill="none" stroke={tone.iconColor}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {tone.iconPath}
            </svg>
          </div>
          <div style={{
            fontSize: 17,
            fontWeight: 700,
            color: '#0F172A',
            fontFamily: 'Georgia, serif',
            marginBottom: 8
          }}>
            {state.title}
          </div>
          <div style={{
            fontSize: 13,
            color: '#64748B',
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
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 12,
              background: '#F1F5F9',
              color: '#0F172A',
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 12,
              background: tone.buttonBg,
              color: 'white',
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
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