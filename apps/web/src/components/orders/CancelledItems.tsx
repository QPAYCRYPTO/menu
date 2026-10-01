// apps/web/src/components/orders/CancelledItems.tsx
// Mutfak başladıktan sonra iptal edilen kalemler: ürün, adet, tutar, sebep, kim (onaylayan), ne zaman.
// Siparişler (aktif kart) ve Geçmiş (detay) aynı bloğu kullanır.
import { Ban } from 'lucide-react';
import { CANCEL_REASON_LABELS } from '../../lib/changeRequests';

export type CancellationEntry = {
  product_name: string;
  quantity: number;
  price_int: number;
  reason_code: string;
  reason_text: string | null;
  order_status: string;
  whole_order: boolean;
  actor_name: string;
  approved_by_email: string | null;
  created_at: string;
};

const STAGE_LABEL: Record<string, string> = {
  preparing: 'hazırlanırken',
  ready: 'hazırken',
  delivered: 'teslimden sonra'
};

function money(int: number) {
  return `${(int / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

export function CancelledItems({ entries, title = 'İptal edilen ürünler', compact = false }: {
  entries: CancellationEntry[];
  title?: string;
  compact?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className={`rounded-xl ${compact ? 'mt-2 px-2.5 py-2' : 'mt-3 px-3 py-2.5'}`}
      style={{ background: 'var(--state-danger-bg)', border: '1px solid color-mix(in srgb, var(--state-danger) 35%, transparent)' }}>
      <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1" style={{ color: 'var(--state-danger)' }}>
        <Ban size={12} aria-hidden /> {title}
      </div>
      <ul className="space-y-1.5">
        {entries.map((c, i) => {
          const reason = [CANCEL_REASON_LABELS[c.reason_code] ?? c.reason_code, c.reason_text].filter(Boolean).join(' — ');
          const time = new Date(c.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
          return (
            <li key={i} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-ink line-through decoration-[var(--state-danger)]">{c.quantity}× {c.product_name}</span>
                <span className="text-ink-muted tabular-nums flex-shrink-0">{money(c.price_int * c.quantity)}</span>
              </div>
              <div className="text-ink-muted leading-snug">
                {reason}
                {' · '}<span className="font-semibold text-ink">{c.actor_name}</span>
                {c.approved_by_email && <> (onay: {c.approved_by_email})</>}
                {' · '}{time}
                {STAGE_LABEL[c.order_status] && <> · {STAGE_LABEL[c.order_status]}</>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
