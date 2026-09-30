// apps/web/src/components/ChangeRequestItem.tsx
// Onay bekleyen tek bir talep: kim, ne istedi, Onayla / Reddet. Panel ve Siparişler'de kullanılır.
import { Check, LoaderCircle, MinusCircle, X, XCircle } from 'lucide-react';
import { describeRequest, type ChangeRequest } from '../lib/changeRequests';

export function ChangeRequestItem({ request, busy, onDecide, compact = false }: {
  request: ChangeRequest;
  busy: boolean;
  onDecide: (decision: 'approve' | 'reject') => void;
  /** Sipariş kartı içinde: masa adı tekrar yazılmaz */
  compact?: boolean;
}) {
  const { title, detail } = describeRequest(request);
  const Icon = request.kind === 'order_cancel' ? XCircle : MinusCircle;
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-full bg-state-danger-bg text-state-danger flex items-center justify-center shrink-0">
        <Icon size={17} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <strong className="font-semibold">{request.waiter_name}</strong>{' '}
          <span className="text-ink-muted">{compact ? (request.kind === 'order_cancel' ? 'iptal istiyor' : 'adet azaltmak istiyor') : 'onay istiyor'}</span>
        </p>
        {!compact && <p className="font-serif font-semibold text-[15px] leading-tight mt-0.5">{title}</p>}
        {detail && <p className="text-xs text-ink-muted mt-0.5 break-words">{detail}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={() => onDecide('approve')} disabled={busy}
            className="px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 spring-btn bg-state-danger text-page disabled:opacity-60">
            {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2.5} />} Onayla
          </button>
          <button onClick={() => onDecide('reject')} disabled={busy}
            className="btn-outline px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 spring-btn disabled:opacity-60">
            <X size={13} strokeWidth={2.5} /> Reddet
          </button>
        </div>
      </div>
    </div>
  );
}
