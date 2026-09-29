// apps/web/src/components/KitchenReadyToasts.tsx
// Garson ekranı: "Mutfaktan Hazır" bildirimleri (yeşil, zil ikonlu). Dokununca kapanır.
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
          className="pointer-events-auto w-full max-w-md flex items-start gap-3 rounded-2xl px-4 py-3 text-left text-white fade-enter"
          style={{
            background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
            border: '1px solid rgba(255,255,255,0.55)',
            boxShadow: '0 10px 28px rgba(4,120,87,0.45)'
          }}
          aria-label={`${t.text}. Kapat`}>
          <span className="w-9 h-9 rounded-xl bg-white/25 flex items-center justify-center shrink-0">
            <Bell size={18} strokeWidth={2.5} />
          </span>
          <span className="flex-1 text-sm font-bold leading-snug pt-0.5">
            <span className="block text-[10px] font-extrabold tracking-widest text-white/80">MUTFAKTAN HAZIR</span>
            {t.text}
          </span>
          <X size={16} className="shrink-0 mt-1 text-white/80" aria-hidden />
        </button>
      ))}
    </div>
  );
}
