// apps/web/src/components/KitchenReadyToasts.tsx
// Garson ekranı: "Mutfaktan Hazır" bildirimleri (yeşil, zil ikonlu). Dokununca kapanır.
// Gece/gündüz uyumlu: dolgu --state-ok, yazı zemin rengi (--bg) → iki temada da okunur.
import { Bell, X } from 'lucide-react';

export type KitchenReadyToast = { id: string; text: string };

export function KitchenReadyToasts({ toasts, onDismiss }: {
  toasts: KitchenReadyToast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-3 inset-x-3 z-[100] flex flex-col items-center gap-2 pointer-events-none" aria-live="assertive">
      {toasts.map(t => (
        <button key={t.id} type="button" onClick={() => onDismiss(t.id)}
          className="pointer-events-auto w-full max-w-md flex items-start gap-3 rounded-2xl px-4 py-3 text-left fade-enter shadow-lg"
          style={{ background: 'var(--state-ok)', color: 'var(--bg)' }}
          aria-label={`${t.text}. Kapat`}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--bg) 22%, transparent)' }}>
            <Bell size={18} strokeWidth={2.5} />
          </span>
          <span className="flex-1 text-sm font-bold leading-snug pt-0.5">
            <span className="block text-[10px] font-extrabold tracking-widest opacity-80">MUTFAKTAN HAZIR</span>
            {t.text}
          </span>
          <X size={16} className="shrink-0 mt-1 opacity-80" aria-hidden />
        </button>
      ))}
    </div>
  );
}
