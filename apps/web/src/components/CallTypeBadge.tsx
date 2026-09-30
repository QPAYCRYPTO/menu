// apps/web/src/components/CallTypeBadge.tsx
// Çağrı türü ikonu — sade yuvarlak rozet, ince çizgili tek renk ikon (Atölye ikon dili).
// Acil türler (masa silinsin, servis eksik) kırmızı. lib/callTypes tek kaynak. Gece/gündüz uyumlu.

import { getCallType } from '../lib/callTypes';

export function CallTypeBadge({ callType, size = 44, filled = false }: {
  callType: string | null | undefined;
  /** Rozetin kenar uzunluğu (px); ikon bunun ~%48'i */
  size?: number;
  /** true: renkli başlık zemini üzerinde (kart başlığı) — yüzey renginde dolu rozet */
  filled?: boolean;
}) {
  const info = getCallType(callType);
  const Icon = info.icon;
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center flex-shrink-0 rounded-full border border-line ${
        filled ? 'bg-surface' : 'bg-surface-2'} ${info.critical ? 'text-state-danger' : 'text-ink'}`}
      style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.5} />
    </span>
  );
}
