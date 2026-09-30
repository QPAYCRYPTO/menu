// apps/web/src/pages/OrdersPage.tsx
// CHANGELOG v7: Ortak Toast komponentine geçti

import { useEffect, useState } from 'react';
import {
  AlertTriangle, Bell, CalendarDays, Check, ChevronDown, ChevronUp, ClipboardList, Clock, ConciergeBell,
  Flame, MapPin, NotebookPen, Plus, RefreshCw, Smartphone, Timer, User, UtensilsCrossed, X
} from 'lucide-react';
import { ORDER_STATUS, orderStatusStyle } from '../lib/orderStatus';
import { getCallType } from '../lib/callTypes';
import { CallTypeBadge } from '../components/CallTypeBadge';
import { useOrders, Order, OrderItem, OrderChange, OrderUpdate, CancelReasonCode } from '../context/OrderContext';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { useChangeRequests, type ChangeRequest } from '../lib/changeRequests';
import { ChangeRequestItem } from '../components/ChangeRequestItem';

const FILTER_STORAGE_KEY = 'atlasqr:orders:filter';

type FilterType = 'active' | 'delivered';

const CANCEL_REASONS: { code: CancelReasonCode; label: string; hint?: string }[] = [
  { code: 'customer_cancelled', label: 'Müşteri vazgeçti' },
  { code: 'customer_left', label: 'Müşteri gitti', hint: 'Sipariş bekliyor ama kişi yok' },
  { code: 'not_claimed', label: 'Hazır ama alıcı yok', hint: 'Yemek hazır, teslim alınmadı' },
  { code: 'no_payment', label: 'Ödemeden gitti', hint: 'Kasa açığı — teslim edildi ama ödeme alınamadı' },
  { code: 'wrong_order', label: 'Yanlış sipariş', hint: 'Mutfak veya sipariş hatası' },
  { code: 'out_of_stock', label: 'Stok yok', hint: 'Ürün bitti' },
  { code: 'other', label: 'Diğer', hint: 'Açıklama zorunludur' }
];

// Çağrı türü ikon/etiket/renk: lib/callTypes.ts (tek kaynak)

function parseReasonLabel(reasonString: string | null | undefined): { code: string; label: string; text: string } {
  if (!reasonString) return { code: '', label: 'İptal edildi', text: '' };
  const [code, ...rest] = reasonString.split(':');
  const text = rest.join(':').trim();
  const found = CANCEL_REASONS.find(r => r.code === code.trim());
  const label = found ? found.label : 'İptal edildi';
  return { code: code.trim(), label, text };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}sn önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa önce`;
  return `${Math.floor(diff / 86400)}g önce`;
}
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useLiveElapsed(dateStr: string): string {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(dateStr).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dateStr]);
  return formatDuration(elapsed);
}

function staticDuration(from: string, to: string): string {
  const diff = Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 1000);
  return formatDuration(diff);
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor', preparing: 'Hazırlanıyor', ready: 'Hazır',
  delivered: 'Teslim Edildi', cancelled: 'İptal Edildi'
};

// Durum renkleri tüm ekranlarda aynı (lib/orderStatus.ts): Bekliyor amber, Hazırlanıyor mavi, Hazır yeşil,
// Teslim mor, İptal kırmızı. Kartın solundaki şerit durumu, eylem düğmesi geçilecek durumun rengini taşır.
const STATUS_COLORS: Record<string, { bg: string; color: string }> = Object.fromEntries(
  Object.entries(ORDER_STATUS).map(([k, s]) => [k, { bg: s.bg, color: s.fg }])
);

function priceIntToTl(value: number): string { return (value / 100).toFixed(2); }
function orderTotal(items: OrderItem[]): number { return items.reduce((sum, item) => sum + item.price_int * item.quantity, 0); }

function OrderSourceBadge({ order }: { order: Order }) {
  if (order.waiter_name) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
        style={{ background: 'var(--accent-soft)', color: 'var(--ink)' }}
        title={`Personel: ${order.waiter_name}`}>
        <User size={12} /> {order.waiter_name}
      </span>
    );
  }
  return (
    <span className="ui-chip inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ color: 'var(--ink-muted)' }}
      title="Müşteri tarafından QR ile verilen sipariş">
      <Smartphone size={12} /> Müşteri
    </span>
  );
}

function OrderTimeRow({ order }: { order: Order }) {
  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs" style={{ color: 'var(--ink-muted)' }}>
      <span className="font-mono inline-flex items-center gap-1"><CalendarDays size={12} /> {formatDate(order.created_at)}</span>
      <span style={{ color: 'var(--ink-muted)' }}>·</span>
      <span className="font-mono inline-flex items-center gap-1"><Clock size={12} /> {formatTime(order.created_at)}</span>
      <span style={{ color: 'var(--ink-muted)' }}>·</span>
      <span>{timeAgo(order.created_at)}</span>
    </div>
  );
}

function LiveTimerBadge({ dateStr }: { dateStr: string }) {
  const elapsed = useLiveElapsed(dateStr);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap bg-state-warn-bg text-state-warn"
      title="Sipariş verildikten beri geçen süre">
      <Timer size={12} /> {elapsed}
    </span>
  );
}

function StaticTimerBadge({ duration, bg, color, title }: { duration: string; bg: string; color: string; title: string; }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: bg, color }} title={title}>
      <Timer size={12} /> {duration}
    </span>
  );
}

function OrderTimerBadge({ order }: { order: Order }) {
  if (order.status === 'pending' || order.status === 'preparing' || order.status === 'ready') {
    return <LiveTimerBadge dateStr={order.created_at} />;
  }
  if (order.status === 'delivered' && order.delivered_at) {
    return <StaticTimerBadge duration={staticDuration(order.created_at, order.delivered_at)}
      bg="var(--state-ok-bg)" color="var(--state-ok)" title="Hazırlama süresi (sipariş → teslim)" />;
  }
  if (order.status === 'cancelled' && order.cancelled_at) {
    return <StaticTimerBadge duration={staticDuration(order.created_at, order.cancelled_at)}
      bg="var(--state-danger-bg)" color="var(--state-danger)" title="İptal olana kadar geçen süre" />;
  }
  return null;
}

function ChangeRow({ change }: { change: OrderChange }) {
  if (change.action === 'added') {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
        <span className="font-bold inline-flex items-center gap-1" style={{ color: 'var(--state-ok)' }}><Plus size={12} strokeWidth={3} /> EKLENDI</span>
        <span className="font-semibold">{change.product_name}</span>
        <span style={{ color: 'var(--ink-muted)' }}>×{change.quantity}</span>
      </div>
    );
  }
  if (change.action === 'quantity_changed') {
    const oldQ = change.old_quantity ?? 0;
    const newQ = change.new_quantity ?? 0;
    const DirectionIcon = newQ > oldQ ? ChevronUp : ChevronDown;
    const dirColor = newQ > oldQ ? 'var(--state-ok)' : 'var(--state-danger)';
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
        <span className="font-bold inline-flex items-center gap-1" style={{ color: dirColor }}><DirectionIcon size={12} strokeWidth={3} /> ADET</span>
        <span className="font-semibold">{change.product_name}</span>
        <span className="font-mono" style={{ color: 'var(--ink-muted)' }}>
          {oldQ} → <strong style={{ color: dirColor }}>{newQ}</strong>
        </span>
      </div>
    );
  }
  if (change.action === 'removed') {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--state-danger)' }}>
        <span className="font-bold inline-flex items-center gap-1"><X size={12} strokeWidth={3} /> KALDIRILDI</span>
        <span className="font-semibold">{change.product_name}</span>
      </div>
    );
  }
  return null;
}

function UpdatePanel({ update, onAcknowledge }: { update: OrderUpdate; onAcknowledge: () => void; }) {
  return (
    <div className="px-3 py-2.5 mb-2"
      style={{ background: 'var(--state-warn-bg)', borderTop: '1px solid var(--state-warn)', borderBottom: '1px solid var(--state-warn)' }}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base animate-pulse inline-flex text-state-warn"><Bell size={16} /></span>
          <span className="text-xs font-bold uppercase tracking-wider text-state-warn">Güncelleme</span>
          {update.waiter_name && (
            <span className="text-xs font-semibold inline-flex items-center gap-1 text-ink">· <User size={12} /> {update.waiter_name}</span>
          )}
        </div>
        <button onClick={onAcknowledge}
          className="btn-primary px-2.5 py-1 rounded-full text-xs font-bold spring-btn inline-flex items-center gap-1"
          title="Bu uyarıyı kapat"><Check size={12} strokeWidth={3} /> Gördüm</button>
      </div>
      <div className="space-y-1 pl-5">
        {update.changes.map((change, idx) => <ChangeRow key={idx} change={change} />)}
      </div>
    </div>
  );
}

type CancelModalProps = {
  order: Order;
  onClose: () => void;
  onConfirm: (reasonCode: CancelReasonCode, reasonText?: string) => Promise<void>;
};

function CancelModal({ order, onClose, onConfirm }: CancelModalProps) {
  const [selectedCode, setSelectedCode] = useState<CancelReasonCode | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOther = selectedCode === 'other';
  const needsReasonText = isOther && reasonText.trim().length < 3;
  const canSubmit = selectedCode !== null && !needsReasonText && !submitting;

  async function handleSubmit() {
    if (!selectedCode || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const text = reasonText.trim().length > 0 ? reasonText.trim() : undefined;
      await onConfirm(selectedCode, text);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İptal edilemedi.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 ui-scrim fade-enter"
      onClick={onClose}>
      <div className="bg-surface border border-line sheet-enter text-ink rounded-t-[32px] sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-line rounded-full mx-auto mt-3 sm:hidden" />
        <div className="px-5 py-4 border-b border-line">
          <h3 className="font-serif font-bold text-lg text-ink">Siparişi İptal Et</h3>
          <p className="text-xs mt-1 text-ink-muted">
            {order.table_name} · {formatDate(order.created_at)} {formatTime(order.created_at)}
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">İptal Sebebi</label>
          <div className="mt-3 space-y-2">
            {CANCEL_REASONS.map(reason => {
              const selected = selectedCode === reason.code;
              return (
                <button key={reason.code} type="button" onClick={() => setSelectedCode(reason.code)}
                  className="w-full text-left px-3 py-3 rounded-2xl transition-all spring-btn"
                  style={{ background: selected ? 'var(--state-danger-bg)' : 'var(--surface-2)',
                    border: `1px solid ${selected ? 'var(--state-danger)' : 'var(--line)'}` }}>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ background: selected ? 'var(--state-danger)' : 'transparent',
                        border: `2px solid ${selected ? 'var(--state-danger)' : 'var(--ink-muted)'}` }}>
                      {selected && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--bg)' }} />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-ink">{reason.label}</div>
                      {reason.hint && <div className="text-xs mt-0.5 text-ink-muted">{reason.hint}</div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedCode && (
            <div className="mt-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                {isOther ? 'Açıklama (zorunlu)' : 'Ek Açıklama (opsiyonel)'}
              </label>
              <textarea value={reasonText} onChange={e => setReasonText(e.target.value)}
                rows={3} maxLength={500}
                placeholder={isOther ? 'Lütfen iptal sebebini yazınız...' : 'İsteğe bağlı not...'}
                className={`ui-input w-full mt-2 px-3.5 py-2.5 rounded-2xl text-sm resize-none ${needsReasonText ? 'border-[var(--state-danger)]' : ''}`} />
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: needsReasonText ? 'var(--state-danger)' : 'var(--ink-muted)' }}>
                  {needsReasonText ? 'En az 3 karakter' : ''}
                </span>
                <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>{reasonText.length}/500</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}>{error}</div>
          )}
        </div>

        <div className="px-5 pt-3 pb-6 sm:pb-4 flex gap-2 border-t border-line">
          <button onClick={onClose} disabled={submitting}
            className="btn-outline flex-1 py-3 rounded-full text-sm font-semibold spring-btn disabled:opacity-60">Vazgeç</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="flex-1 py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-50"
            style={{ background: 'var(--state-danger)', color: 'var(--bg)' }}>
            {submitting ? 'İptal ediliyor...' : 'İptal Et'}
          </button>
        </div>
      </div>
    </div>
  );
}

type OrderCardProps = {
  order: Order;
  /** Bu siparişe ait, onay bekleyen personel talepleri */
  requests?: ChangeRequest[];
  busyRequestId?: string | null;
  onDecideRequest?: (id: string, decision: 'approve' | 'reject') => void;
  pendingUpdate?: OrderUpdate;
  onAcknowledge: () => void;
  onUpdate: (order: Order, status: Order['status']) => void;
  onCancel: (order: Order) => void;
};

function OrderCard({ order, requests = [], busyRequestId, onDecideRequest, pendingUpdate, onAcknowledge, onUpdate, onCancel }: OrderCardProps) {
  const isCancelled = order.status === 'cancelled';
  const reasonInfo = isCancelled ? parseReasonLabel(order.cancel_reason) : null;
  const hasUpdate = !!pendingUpdate;

  const baseBorder = isCancelled ? 'var(--state-danger)' : order.status === 'pending' ? 'var(--state-warn)' : 'var(--line)';
  const borderColor = hasUpdate ? 'var(--state-warn)' : baseBorder;
  const borderWidth = hasUpdate ? '2px' : '1px';

  return (
    <div className="ui-card rounded-3xl overflow-hidden text-ink"
      style={{ border: `${borderWidth} solid ${borderColor}`, borderLeft: `6px solid ${orderStatusStyle(order.status).fg}`,
        opacity: isCancelled ? 0.8 : 1,
        animation: hasUpdate ? 'pulse-update 1.5s ease-in-out infinite' : undefined }}>

      <style>{`
        @keyframes pulse-update {
          0%, 100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--state-warn) 40%, transparent); }
          50% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--state-warn) 0%, transparent); }
        }
      `}</style>

      {requests.length > 0 && onDecideRequest && (
        <div className="px-4 py-3 bg-state-danger-bg border-b border-line space-y-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-state-danger">Onay bekliyor</div>
          {requests.map(r => (
            <ChangeRequestItem key={r.id} request={r} compact busy={busyRequestId === r.id}
              onDecide={d => onDecideRequest(r.id, d)} />
          ))}
        </div>
      )}

      <div className="px-4 py-3"
        style={{ background: isCancelled ? 'var(--state-danger-bg)' : 'var(--surface-2)',
          borderBottom: '1px solid var(--line)' }}>
        <div className="flex items-start justify-between gap-2">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="font-serif font-bold text-base text-ink">{order.table_name}</div>
            <OrderTimeRow order={order} />
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
              style={{ background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].color }}>
              {STATUS_LABELS[order.status]}
            </span>
            <OrderSourceBadge order={order} />
            <OrderTimerBadge order={order} />
          </div>
        </div>
      </div>

      {pendingUpdate && <UpdatePanel update={pendingUpdate} onAcknowledge={onAcknowledge} />}

      <div className="px-4 py-3">
        {isCancelled && reasonInfo && (
          <div className="mb-3 px-3 py-2 rounded-xl" style={{ background: 'var(--state-danger-bg)' }}>
            <div className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--state-danger)' }}><X size={12} strokeWidth={3} /> {reasonInfo.label}</div>
            {reasonInfo.text && <div className="text-xs mt-1 text-ink">{reasonInfo.text}</div>}
          </div>
        )}

        {order.items.map(item => (
          <div key={item.id} className="py-1.5" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${isCancelled ? 'bg-surface-2 text-ink-muted' : 'btn-primary'}`}>{item.quantity}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)',
                  textDecoration: isCancelled ? 'line-through' : 'none' }}>{item.product_name}</span>
              </div>
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--ink-muted)' }}>
                {priceIntToTl(item.price_int * item.quantity)} TL
              </span>
            </div>

            {item.note && item.note.trim() && (
              <div className="mt-1 ml-8 px-2 py-1 rounded-lg text-xs bg-state-warn-bg text-state-warn font-semibold">
                <NotebookPen size={12} className="inline-block align-[-2px]" /> {item.note}
              </div>
            )}
          </div>
        ))}

        {order.note && (
          <div className="mt-2 px-3 py-2 rounded-xl text-xs bg-state-warn-bg text-state-warn font-semibold">
            <ClipboardList size={12} className="inline-block align-[-2px]" /> <strong>Genel:</strong> {order.note}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>Toplam</span>
          <span className="font-serif font-bold text-lg" style={{ color: isCancelled ? 'var(--ink-muted)' : 'var(--ink)',
            textDecoration: isCancelled ? 'line-through' : 'none' }}>
            {priceIntToTl(orderTotal(order.items))} TL
          </span>
        </div>
      </div>

      {!isCancelled && (
        <div className="px-4 pb-4 flex gap-2">
          {order.status === 'pending' && (
            <button onClick={() => onUpdate(order, 'preparing')}
              className={`${ORDER_STATUS.preparing.solid} hover:opacity-90 flex-1 py-2.5 rounded-full text-xs font-bold spring-btn flex items-center justify-center gap-1.5`}>
              <Flame size={12} /> Hazırlanıyor</button>
          )}
          {order.status === 'preparing' && (
            <button onClick={() => onUpdate(order, 'ready')}
              className={`${ORDER_STATUS.ready.solid} hover:opacity-90 flex-1 py-2.5 rounded-full text-xs font-bold spring-btn flex items-center justify-center gap-1.5`}>
              <ConciergeBell size={12} /> Hazır</button>
          )}
          {order.status === 'ready' && (
            <button onClick={() => onUpdate(order, 'delivered')}
              className={`${ORDER_STATUS.delivered.solid} hover:opacity-90 flex-1 py-2.5 rounded-full text-xs font-bold spring-btn flex items-center justify-center gap-1`}>Teslim Edildi <Check size={12} strokeWidth={3} /></button>
          )}
          {order.status === 'delivered' && (
            <div className={`${ORDER_STATUS.delivered.badge} flex-1 py-2.5 rounded-full text-xs font-bold text-center`}>Tamamlandı</div>
          )}

          <button onClick={() => onCancel(order)}
            className="px-3.5 py-2 rounded-full text-xs font-semibold spring-btn flex items-center justify-center"
            style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}
            title="Siparişi iptal et" aria-label="Siparişi iptal et"><X size={14} strokeWidth={3} /></button>
        </div>
      )}
    </div>
  );
}

type CallCardProps = {
  order: Order;
  onUpdate: (order: Order, status: Order['status']) => void;
  onCancel: (order: Order) => void;
};

function CallCard({ order, onUpdate, onCancel }: CallCardProps) {
  const callInfo = getCallType(order.call_type);

  // Gece/gündüz uyumlu: acil istek kırmızı, diğerleri amber (sol şerit + başlık zemini)
  const accentColor = callInfo.critical ? 'var(--state-danger)' : 'var(--state-warn)';
  const headBg = callInfo.critical ? 'var(--state-danger-bg)' : 'var(--state-warn-bg)';

  return (
    <div className="ui-card rounded-3xl overflow-hidden text-ink"
      style={{ borderLeft: `5px solid ${accentColor}` }}>
      <div style={{ padding: '16px', background: headBg,
        borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <CallTypeBadge callType={order.call_type} size={56} filled />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            color: accentColor, marginBottom: 2 }}>
            {callInfo.critical ? <span className="inline-flex items-center gap-1"><AlertTriangle size={12} /> Acil İstek</span> : 'Çağrı'}
          </div>
          <div className="font-serif" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
            {callInfo.label}
          </div>
          <div className="font-bold text-sm mt-0.5 text-ink-muted flex items-center gap-1"><MapPin size={14} /> {order.table_name}</div>
        </div>
        <div style={{ flexShrink: 0 }}><OrderTimerBadge order={order} /></div>
      </div>

      {order.call_type === 'other' && order.note && (
        <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <NotebookPen size={12} /> Müşteri Açıklaması
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.4 }}>{order.note}</div>
        </div>
      )}

      {order.call_type !== 'other' && order.note && order.note.trim() && (
        <div style={{ padding: '8px 16px' }}>
          <div className="text-xs px-2 py-1 rounded-lg bg-state-warn-bg text-state-warn font-semibold">
            <NotebookPen size={12} className="inline-block align-[-2px]" /> {order.note}
          </div>
        </div>
      )}

      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--line)' }}>
        <div className="flex items-center gap-1.5 flex-wrap text-xs" style={{ color: 'var(--ink-muted)' }}>
          <span className="font-mono inline-flex items-center gap-1"><CalendarDays size={12} /> {formatDate(order.created_at)}</span>
          <span style={{ color: 'var(--ink-muted)' }}>·</span>
          <span className="font-mono inline-flex items-center gap-1"><Clock size={12} /> {formatTime(order.created_at)}</span>
          <span style={{ color: 'var(--ink-muted)' }}>·</span>
          <span>{timeAgo(order.created_at)}</span>
        </div>
      </div>

      <div style={{ padding: '8px 16px 16px', display: 'flex', gap: 8 }}>
        <button onClick={() => onUpdate(order, 'delivered')}
          className={`flex-1 py-2.5 rounded-full text-xs font-bold spring-btn flex items-center justify-center gap-1 ${callInfo.critical ? '' : 'btn-primary'}`}
          style={callInfo.critical ? { background: 'var(--state-danger)', color: 'var(--bg)' } : undefined}><Check size={12} strokeWidth={3} /> İlgilendim</button>
        <button onClick={() => onCancel(order)}
          className="px-3.5 py-2.5 rounded-full text-xs font-semibold spring-btn flex items-center justify-center"
          style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}
          title="Çağrıyı iptal et" aria-label="Çağrıyı iptal et"><X size={14} strokeWidth={3} /></button>
      </div>
    </div>
  );
}

export function OrdersPage() {
  const {
    activeOrders, refreshActive, fetchDelivered, updateOrderStatus, cancelOrder,
    pendingUpdates, acknowledgeUpdate
  } = useOrders();

  const [filter, setFilter] = useState<FilterType>(() => {
    const saved = localStorage.getItem(FILTER_STORAGE_KEY);
    return (saved === 'active' || saved === 'delivered') ? saved : 'active';
  });

  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  const [loadingDelivered, setLoadingDelivered] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  // Personelin onay bekleyen iptal / adet azaltma talepleri
  const { requests: changeRequests, decide: decideRequest, busyId: busyRequestId } = useChangeRequests();
  async function handleDecideRequest(id: string, decision: 'approve' | 'reject') {
    try {
      showToast(await decideRequest(id, decision), 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'İşlem başarısız.', 'error');
    }
  }

  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, filter);
  }, [filter]);

  useEffect(() => {
    if (filter !== 'delivered') return;
    let cancelled = false;
    setLoadingDelivered(true);
    fetchDelivered().then(data => {
      if (!cancelled) setDeliveredOrders(data);
    }).finally(() => {
      if (!cancelled) setLoadingDelivered(false);
    });
    return () => { cancelled = true; };
  }, [filter, fetchDelivered]);

  async function handleUpdateStatus(order: Order, status: Order['status']) {
    try {
      await updateOrderStatus(order.id, status);
      showToast('Durum güncellendi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi.', 'error');
    }
  }

  async function handleCancelConfirm(reasonCode: CancelReasonCode, reasonText?: string) {
    if (!cancelTarget) return;
    await cancelOrder(cancelTarget.id, reasonCode, reasonText);
    showToast('Sipariş iptal edildi.', 'success');
    if (filter === 'delivered') {
      const data = await fetchDelivered();
      setDeliveredOrders(data);
    }
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (filter === 'active') {
        await refreshActive();
      } else {
        const data = await fetchDelivered();
        setDeliveredOrders(data);
      }
      showToast('Liste güncellendi.', 'success');
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  }

  const displayedOrders = filter === 'active' ? activeOrders : deliveredOrders;
  const pendingCount = activeOrders.filter(o => o.status === 'pending').length;
  const callOrders = activeOrders.filter(o => o.type === 'call' && o.status === 'pending');
  const foodOrders = displayedOrders.filter(o => o.type === 'order');
  const updateCount = pendingUpdates.size;

  const criticalCallCount = callOrders.filter(o => {
    const info = getCallType(o.call_type);
    return info.critical;
  }).length;

  return (
    <div>
      <Toast state={toast} />

      {cancelTarget && (
        <CancelModal order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelConfirm} />
      )}

      <div className="ui-card rounded-3xl px-4 py-3 flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-serif font-bold text-xl text-ink">Siparişler</h2>
          {pendingCount > 0 && filter === 'active' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}>
              {pendingCount} yeni
            </span>
          )}
          {updateCount > 0 && filter === 'active' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold animate-pulse inline-flex items-center gap-1"
              style={{ background: 'var(--state-warn-bg)', color: 'var(--state-warn)' }}><Bell size={12} /> {updateCount} güncelleme</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold spring-btn ${filter === 'active' ? 'ui-chip-active' : 'ui-chip'}`}>
            Aktif
          </button>
          <button onClick={() => setFilter('delivered')}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold spring-btn ${filter === 'delivered' ? 'ui-chip-active' : 'ui-chip'}`}>
            Tamamlanan
          </button>
          <button onClick={handleRefresh} disabled={refreshing} aria-label="Yenile" title="Yenile"
            className="ui-chip px-4 py-2 rounded-2xl text-sm font-semibold spring-btn disabled:opacity-60">
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}><RefreshCw size={14} className="block" /></span>
          </button>
        </div>
      </div>

      {filter === 'active' && callOrders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold mb-3 uppercase tracking-wider flex items-center gap-2 px-1 text-state-danger">
            <Bell size={14} /> Müşteri Çağrıları ({callOrders.length})
            {criticalCallCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold animate-pulse inline-flex items-center gap-1"
                style={{ background: 'var(--state-danger)', color: 'var(--bg)' }}><AlertTriangle size={12} /> {criticalCallCount} acil</span>
            )}
          </h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {callOrders.map(order => (
              <CallCard key={order.id} order={order} onUpdate={handleUpdateStatus} onCancel={setCancelTarget} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {foodOrders.map(order => (
          <OrderCard key={order.id} order={order}
            requests={changeRequests.filter(r => r.order_id === order.id)}
            busyRequestId={busyRequestId}
            onDecideRequest={handleDecideRequest}
            pendingUpdate={pendingUpdates.get(order.id)}
            onAcknowledge={() => acknowledgeUpdate(order.id)}
            onUpdate={handleUpdateStatus} onCancel={setCancelTarget} />
        ))}

        {foodOrders.length === 0 && callOrders.length === 0 && !loadingDelivered && (
          <div className="ui-card col-span-full text-center py-16 rounded-3xl"
            style={{ borderStyle: 'dashed' }}>
            <div className="mb-3 flex justify-center text-accent"><UtensilsCrossed size={36} strokeWidth={1.5} /></div>
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
              {filter === 'active' ? 'Aktif sipariş yok' : 'Tamamlanan sipariş yok'}
            </p>
          </div>
        )}

        {loadingDelivered && (
          <div className="col-span-full text-center py-16">
            <div className="w-10 h-10 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-3" />
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Yükleniyor...</p>
          </div>
        )}
      </div>
    </div>
  );
}