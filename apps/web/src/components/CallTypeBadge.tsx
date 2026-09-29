// apps/web/src/components/CallTypeBadge.tsx
// Çağrı türü ikonu — türün kendi renginde yuvarlatılmış rozet (lib/callTypes tek kaynak). Gece/gündüz uyumlu.

import { getCallType } from '../lib/callTypes';
import { readableTextOn, withAlpha } from '../lib/color';

export function CallTypeBadge({ callType, size = 44, filled = false }: {
  callType: string | null | undefined;
  /** Rozetin kenar uzunluğu (px); ikon bunun ~%48'i */
  size?: number;
  /** true: türün renginde dolu rozet + beyaz ikon (seçili/vurgulu) */
  filled?: boolean;
}) {
  const info = getCallType(callType);
  const Icon = info.icon;
  return (
    <span
      aria-hidden
      className="flex items-center justify-center flex-shrink-0 border"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        // Düz renk + okunur ikon rengi: hem gece hem gündüz temasında (ve eski koyu ekranlarda) çalışır
        ...(filled ? {
          background: info.color,
          borderColor: 'transparent',
          color: readableTextOn(info.color)
        } : {
          background: withAlpha(info.color, 0.15),
          borderColor: withAlpha(info.color, 0.25),
          color: info.color
        })
      }}>
      <Icon size={Math.round(size * 0.48)} />
    </span>
  );
}
