// apps/web/src/components/CallTypeBadge.tsx
// Çağrı türü ikonu — türün kendi renginde yuvarlatılmış rozet (lib/callTypes tek kaynak)

import { getCallType } from '../lib/callTypes';
import { withAlpha } from '../lib/color';

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
        ...(filled ? {
          background: `linear-gradient(135deg, ${info.color}, ${withAlpha(info.color, 0.75)})`,
          borderColor: 'rgba(255,255,255,0.35)',
          color: '#fff',
          boxShadow: `0 4px 14px ${withAlpha(info.color, 0.5)}`
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
