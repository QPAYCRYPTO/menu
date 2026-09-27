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
    iconBg: 'var(--danger-bg)',
    iconColor: 'var(--danger)',
    buttonBg: 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)',
    buttonHover: '#BE123C',
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
    iconBg: 'var(--warning-bg)',
    iconColor: 'var(--warning)',
    buttonBg: 'var(--accent-gradient)',
    buttonHover: '#FF5A1F',
    iconPath: (
      <>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </>
    )
  },
  info: {
    iconBg: 'var(--info-bg)',
    iconColor: 'var(--info)',
    buttonBg: 'linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)',
    buttonHover: '#0369A1',
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
        background: visible ? 'var(--overlay)' : 'rgba(10, 7, 5, 0)',
        backdropFilter: visible ? 'blur(12px)' : 'blur(0px)',
        WebkitBackdropFilter: visible ? 'blur(12px)' : 'blur(0px)',
        transition: 'background 0.2s ease-out, backdrop-filter 0.2s ease-out'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-dark rounded-3xl"
        style={{
          width: '100%',
          maxWidth: 380,
          overflow: 'hidden',
          color: 'var(--text)',
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
            border: '1px solid rgba(255,255,255,0.22)',
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
          <div className="font-serif" style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: 8
          }}>
            {state.title}
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--text-muted)',
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
            className="glass-pill spring-btn"
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
              color: 'white',
              fontWeight: 700,
              fontSize: 14,
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.6)',
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