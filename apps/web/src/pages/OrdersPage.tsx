// apps/web/src/pages/OrdersPage.tsx
// CHANGELOG v7: Ortak Toast komponentine geçti

import { useEffect, useState } from 'react';
import { useOrders, Order, OrderItem, OrderChange, OrderUpdate, CancelReasonCode } from '../context/OrderContext';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';

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

const CALL_TYPE_LABELS: Record<string, { emoji: string; label: string; critical: boolean }> = {
  waiter:          { emoji: '👤', label: 'Garson',           critical: false },
  water:           { emoji: '💧', label: 'Su',               critical: false },
  bill:            { emoji: '🧾', label: 'Hesap',            critical: false },
  package:         { emoji: '📦', label: 'Paket',            critical: false },
  baby_chair:      { emoji: '🪑', label: 'Mama Sandalyesi',  critical: false },
  charger:         { emoji: '🔌', label: 'Şarj',             critical: false },
  ashtray:         { emoji: '🚬', label: 'Küllük',           critical: false },
  lighter:         { emoji: '🔥', label: 'Çakmak',           critical: false },
  cigarette:       { emoji: '🚬', label: 'Sigara',           critical: false },
  clean_table:     { emoji: '🧽', label: 'Masa Silinsin',    critical: true  },
  missing_service: { emoji: '❌', label: 'Servis Eksik',     critical: true  },
  other:           { emoji: '✏️', label: 'Diğer',            critical: false }
};

function getCallTypeInfo(call_type: string | null | undefined) {
  if (!call_type) return { emoji: '🔔', label: 'Garson Çağrısı', critical: false };
  return CALL_TYPE_LABELS[call_type] || { emoji: '🔔', label: call_type, critical: false };
}

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

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: 'var(--accent-soft)', color: '#FDBA74' },
  preparing: { bg: 'var(--warning-bg)', color: 'var(--warning)' },
  ready: { bg: 'var(--info-bg)', color: 'var(--info)' },
  delivered: { bg: 'var(--success-bg)', color: 'var(--success)' },
  cancelled: { bg: 'var(--danger-bg)', color: 'var(--danger)' }
};

function priceIntToTl(value: number): string { return (value / 100).toFixed(2); }
function orderTotal(items: OrderItem[]): number { return items.reduce((sum, item) => sum + item.price_int * item.quantity, 0); }

function OrderSourceBadge({ order }: { order: Order }) {
  if (order.waiter_name) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
        style={{ background: 'var(--accent-soft)', color: '#FDBA74', border: '1px solid rgba(255,154,90,0.5)' }}
        title={`Garson: ${order.waiter_name}`}>
        👤 {order.waiter_name}
      </span>
    );
  }
  return (
    <span className="glass-pill px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ color: 'var(--text-muted)' }}
      title="Müşteri tarafından QR ile verilen sipariş">
      📱 Müşteri
    </span>
  );
}

function OrderTimeRow({ order }: { order: Order }) {
  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs" style={{ color: 'var(--text-muted)' }}>
      <span className="font-mono">📅 {formatDate(order.created_at)}</span>
      <span style={{ color: 'var(--text-faint)' }}>·</span>
      <span className="font-mono">🕐 {formatTime(order.created_at)}</span>
      <span style={{ color: 'var(--text-faint)' }}>·</span>
      <span>{timeAgo(order.created_at)}</span>
    </div>
  );
}

function LiveTimerBadge({ dateStr }: { dateStr: string }) {
  const elapsed = useLiveElapsed(dateStr);
  return (
    <span className="glass-pill font-mono text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ color: '#FCD34D' }}
      title="Sipariş verildikten beri geçen süre">
      ⏱ {elapsed}
    </span>
  );
}

function StaticTimerBadge({ duration, bg, color, title }: { duration: string; bg: string; color: string; title: string; }) {
  return (
    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: bg, color, border: '1px solid rgba(255,255,255,0.28)' }} title={title}>
      ⏱ {duration}
    </span>
  );
}

function OrderTimerBadge({ order }: { order: Order }) {
  if (order.status === 'pending' || order.status === 'preparing' || order.status === 'ready') {
    return <LiveTimerBadge dateStr={order.created_at} />;
  }
  if (order.status === 'delivered' && order.delivered_at) {
    return <StaticTimerBadge duration={staticDuration(order.created_at, order.delivered_at)}
      bg="var(--success-bg)" color="var(--success)" title="Hazırlama süresi (sipariş → teslim)" />;
  }
  if (order.status === 'cancelled' && order.cancelled_at) {
    return <StaticTimerBadge duration={staticDuration(order.created_at, order.cancelled_at)}
      bg="var(--danger-bg)" color="var(--danger)" title="İptal olana kadar geçen süre" />;
  }
  return null;
}

function ChangeRow({ change }: { change: OrderChange }) {
  if (change.action === 'added') {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text)' }}>
        <span className="font-bold" style={{ color: 'var(--success)' }}>➕ EKLENDI</span>
        <span className="font-semibold">{change.product_name}</span>
        <span style={{ color: 'var(--text-muted)' }}>×{change.quantity}</span>
      </div>
    );
  }
  if (change.action === 'quantity_changed') {
    const oldQ = change.old_quantity ?? 0;
    const newQ = change.new_quantity ?? 0;
    const direction = newQ > oldQ ? '🔼' : '🔽';
    const dirColor = newQ > oldQ ? 'var(--success)' : 'var(--danger)';
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text)' }}>
        <span className="font-bold" style={{ color: dirColor }}>{direction} ADET</span>
        <span className="font-semibold">{change.product_name}</span>
        <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
          {oldQ} → <strong style={{ color: dirColor }}>{newQ}</strong>
        </span>
      </div>
    );
  }
  if (change.action === 'removed') {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--danger)' }}>
        <span className="font-bold">❌ KALDIRILDI</span>
        <span className="font-semibold">{change.product_name}</span>
      </div>
    );
  }
  return null;
}

function UpdatePanel({ update, onAcknowledge }: { update: OrderUpdate; onAcknowledge: () => void; }) {
  return (
    <div className="px-3 py-2.5 mb-2"
      style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.32), rgba(245,158,11,0.18))',
        borderTop: '1px solid rgba(251,191,36,0.6)', borderBottom: '1px solid rgba(251,191,36,0.6)' }}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base animate-pulse">🔔</span>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#FCD34D' }}>Güncelleme</span>
          {update.waiter_name && (
            <span className="text-xs font-semibold" style={{ color: '#FDE68A' }}>· 👤 {update.waiter_name}</span>
          )}
        </div>
        <button onClick={onAcknowledge}
          className="px-2.5 py-1 rounded-full text-xs font-bold text-white spring-btn"
          style={{ background: 'linear-gradient(135deg, #34D399 0%, #059669 100%)', border: '1px solid rgba(255,255,255,0.5)' }}
          title="Bu uyarıyı kapat">✓ Gördüm</button>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-md fade-enter"
      onClick={onClose}>
      <div className="glass-dark sheet-enter text-white rounded-t-[32px] sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col border-t border-white/60"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/40 rounded-full mx-auto mt-3 sm:hidden" />
        <div className="px-5 py-4 border-b border-white/20">
          <h3 className="font-serif font-bold text-lg text-white">Siparişi İptal Et</h3>
          <p className="text-xs mt-1 text-white/65">
            {order.table_name} · {formatDate(order.created_at)} {formatTime(order.created_at)}
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-white/70">İptal Sebebi</label>
          <div className="mt-3 space-y-2">
            {CANCEL_REASONS.map(reason => {
              const selected = selectedCode === reason.code;
              return (
                <button key={reason.code} type="button" onClick={() => setSelectedCode(reason.code)}
                  className="w-full text-left px-3 py-3 rounded-2xl transition-all spring-btn"
                  style={{ background: selected ? 'var(--danger-bg)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${selected ? 'rgba(251,113,133,0.8)' : 'rgba(255,255,255,0.22)'}` }}>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ background: selected ? 'var(--danger)' : 'transparent',
                        border: `2px solid ${selected ? 'var(--danger)' : 'rgba(255,255,255,0.45)'}` }}>
                      {selected && <div className="w-2 h-2 rounded-full" style={{ background: 'white' }} />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-white">{reason.label}</div>
                      {reason.hint && <div className="text-xs mt-0.5 text-white/60">{reason.hint}</div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedCode && (
            <div className="mt-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                {isOther ? 'Açıklama (zorunlu)' : 'Ek Açıklama (opsiyonel)'}
              </label>
              <textarea value={reasonText} onChange={e => setReasonText(e.target.value)}
                rows={3} maxLength={500}
                placeholder={isOther ? 'Lütfen iptal sebebini yazınız...' : 'İsteğe bağlı not...'}
                className={`glass-input w-full mt-2 px-3.5 py-2.5 rounded-2xl text-sm resize-none ${needsReasonText ? 'border-rose-300' : ''}`} />
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: needsReasonText ? 'var(--danger)' : 'var(--text-faint)' }}>
                  {needsReasonText ? 'En az 3 karakter' : ''}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{reasonText.length}/500</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'var(--danger-bg)', color: '#FECDD3', border: '1px solid rgba(251,113,133,0.45)' }}>{error}</div>
          )}
        </div>

        <div className="px-5 pt-3 pb-6 sm:pb-4 flex gap-2 border-t border-white/20">
          <button onClick={onClose} disabled={submitting}
            className="glass-pill flex-1 py-3 rounded-full text-sm font-semibold spring-btn disabled:opacity-60">Vazgeç</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="flex-1 py-3 rounded-full text-sm font-bold text-white spring-btn disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)', border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 8px 20px rgba(225,29,72,0.35), inset 0 1px 1px rgba(255,255,255,0.6)' }}>
            {submitting ? 'İptal ediliyor...' : 'İptal Et'}
          </button>
        </div>
      </div>
    </div>
  );
}

type OrderCardProps = {
  order: Order;
  pendingUpdate?: OrderUpdate;
  onAcknowledge: () => void;
  onUpdate: (order: Order, status: Order['status']) => void;
  onCancel: (order: Order) => void;
};

function OrderCard({ order, pendingUpdate, onAcknowledge, onUpdate, onCancel }: OrderCardProps) {
  const isCancelled = order.status === 'cancelled';
  const reasonInfo = isCancelled ? parseReasonLabel(order.cancel_reason) : null;
  const hasUpdate = !!pendingUpdate;

  const baseBorder = isCancelled ? 'rgba(251,113,133,0.55)' : order.status === 'pending' ? 'rgba(255,154,90,0.75)' : 'rgba(255,255,255,0.42)';
  const borderColor = hasUpdate ? '#FBBF24' : baseBorder;
  const borderWidth = hasUpdate ? '2px' : '1px';

  return (
    <div className="glass-card rounded-3xl overflow-hidden text-white"
      style={{ border: `${borderWidth} solid ${borderColor}`, opacity: isCancelled ? 0.8 : 1,
        animation: hasUpdate ? 'pulse-update 1.5s ease-in-out infinite' : undefined }}>

      <style>{`
        @keyframes pulse-update {
          0%, 100% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.45), 0 12px 32px rgba(0,0,0,0.22); }
          50% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0.0), 0 12px 32px rgba(0,0,0,0.22); }
        }
      `}</style>

      <div className="px-4 py-3"
        style={{ background: isCancelled ? 'var(--danger-bg)' : order.status === 'pending' ? 'var(--accent-soft)' : 'rgba(0,0,0,0.18)',
          borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
        <div className="flex items-start justify-between gap-2">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="font-serif font-bold text-base text-white">{order.table_name}</div>
            <OrderTimeRow order={order} />
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
              style={{ background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].color,
                border: '1px solid rgba(255,255,255,0.28)' }}>
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
          <div className="mb-3 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(251,113,133,0.45)' }}>
            <div className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>❌ {reasonInfo.label}</div>
            {reasonInfo.text && <div className="text-xs mt-1" style={{ color: '#FECDD3' }}>{reasonInfo.text}</div>}
          </div>
        )}

        {order.items.map(item => (
          <div key={item.id} className="py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold text-white flex-shrink-0 ${isCancelled ? 'bg-white/20' : 'btn-accent'}`}>{item.quantity}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text)',
                  textDecoration: isCancelled ? 'line-through' : 'none' }}>{item.product_name}</span>
              </div>
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {priceIntToTl(item.price_int * item.quantity)} TL
              </span>
            </div>

            {item.note && item.note.trim() && (
              <div className="mt-1 ml-8 px-2 py-1 rounded-lg text-xs"
                style={{ background: 'rgba(245,158,11,0.2)', color: '#FEF3C7', border: '1px solid rgba(252,211,77,0.35)' }}>
                📝 {item.note}
              </div>
            )}
          </div>
        ))}

        {order.note && (
          <div className="mt-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: 'rgba(245,158,11,0.2)', color: '#FEF3C7', border: '1px solid rgba(252,211,77,0.35)' }}>
            📋 <strong>Genel:</strong> {order.note}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Toplam</span>
          <span className="font-extrabold text-base" style={{ color: isCancelled ? 'var(--text-faint)' : '#FCD34D',
            textDecoration: isCancelled ? 'line-through' : 'none' }}>
            {priceIntToTl(orderTotal(order.items))} TL
          </span>
        </div>
      </div>

      {!isCancelled && (
        <div className="px-4 pb-4 flex gap-2">
          {order.status === 'pending' && (
            <button onClick={() => onUpdate(order, 'preparing')}
              className="flex-1 py-2.5 rounded-full text-xs font-bold text-white spring-btn flex items-center justify-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #FBBF24 0%, #D97706 100%)', border: '1px solid rgba(255,255,255,0.55)',
                boxShadow: '0 8px 18px rgba(217,119,6,0.35), inset 0 1px 1px rgba(255,255,255,0.6)' }}>
              <i className="fa-solid fa-fire-burner" /> Hazırlanıyor</button>
          )}
          {order.status === 'preparing' && (
            <button onClick={() => onUpdate(order, 'ready')}
              className="flex-1 py-2.5 rounded-full text-xs font-bold text-white spring-btn flex items-center justify-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)', border: '1px solid rgba(255,255,255,0.55)',
                boxShadow: '0 8px 18px rgba(2,132,199,0.35), inset 0 1px 1px rgba(255,255,255,0.6)' }}>
              <i className="fa-solid fa-bell-concierge" /> Hazır</button>
          )}
          {order.status === 'ready' && (
            <button onClick={() => onUpdate(order, 'delivered')}
              className="flex-1 py-2.5 rounded-full text-xs font-bold text-white spring-btn"
              style={{ background: 'linear-gradient(135deg, #34D399 0%, #059669 100%)', border: '1px solid rgba(255,255,255,0.55)',
                boxShadow: '0 8px 18px rgba(5,150,105,0.35), inset 0 1px 1px rgba(255,255,255,0.6)' }}>Teslim Edildi ✓</button>
          )}
          {order.status === 'delivered' && (
            <div className="flex-1 py-2.5 rounded-full text-xs font-bold text-center"
              style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid rgba(52,211,153,0.45)' }}>Tamamlandı</div>
          )}

          <button onClick={() => onCancel(order)}
            className="px-3.5 py-2 rounded-full text-xs font-semibold spring-btn"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.5)' }}
            title="Siparişi iptal et">❌</button>
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
  const callInfo = getCallTypeInfo(order.call_type);

  const cardBg = callInfo.critical ? 'rgba(244,63,94,0.16)' : 'rgba(245,158,11,0.14)';
  const cardBorder = callInfo.critical ? 'rgba(251,113,133,0.6)' : 'rgba(252,211,77,0.55)';
  const accentColor = callInfo.critical ? 'var(--danger)' : 'var(--warning)';
  const titleColor = callInfo.critical ? '#FECDD3' : '#FEF3C7';

  return (
    <div className="glass-card rounded-3xl overflow-hidden text-white"
      style={{ backgroundImage: `linear-gradient(${cardBg}, ${cardBg})`, border: `1px solid ${cardBorder}` }}>
      <div style={{ padding: '16px',
        background: callInfo.critical ? 'linear-gradient(135deg, rgba(244,63,94,0.32), rgba(244,63,94,0.14))' : 'linear-gradient(135deg, rgba(245,158,11,0.32), rgba(245,158,11,0.12))',
        borderBottom: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 40, lineHeight: 1, flexShrink: 0 }}>{callInfo.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            color: accentColor, marginBottom: 2 }}>
            {callInfo.critical ? '⚠️ Acil İstek' : 'Çağrı'}
          </div>
          <div className="font-serif" style={{ fontSize: 18, fontWeight: 800, color: titleColor, lineHeight: 1.2 }}>
            {callInfo.label}
          </div>
          <div className="font-bold text-sm mt-0.5 text-white">📍 {order.table_name}</div>
        </div>
        <div style={{ flexShrink: 0 }}><OrderTimerBadge order={order} /></div>
      </div>

      {order.call_type === 'other' && order.note && (
        <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.22)', borderBottom: `1px solid ${cardBorder}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            📝 Müşteri Açıklaması
          </div>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>{order.note}</div>
        </div>
      )}

      {order.call_type !== 'other' && order.note && order.note.trim() && (
        <div style={{ padding: '8px 16px' }}>
          <div className="text-xs px-2 py-1 rounded-lg"
            style={{ background: 'rgba(0,0,0,0.22)', color: '#FEF3C7', border: '1px solid rgba(252,211,77,0.35)' }}>
            📝 {order.note}
          </div>
        </div>
      )}

      <div style={{ padding: '8px 16px', borderTop: `1px solid ${cardBorder}` }}>
        <div className="flex items-center gap-1.5 flex-wrap text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="font-mono">📅 {formatDate(order.created_at)}</span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span className="font-mono">🕐 {formatTime(order.created_at)}</span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span>{timeAgo(order.created_at)}</span>
        </div>
      </div>

      <div style={{ padding: '8px 16px 16px', display: 'flex', gap: 8 }}>
        <button onClick={() => onUpdate(order, 'delivered')}
          className="flex-1 py-2.5 rounded-full text-xs font-bold text-white spring-btn"
          style={{ background: callInfo.critical ? 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)' : 'linear-gradient(135deg, #34D399 0%, #059669 100%)',
            border: '1px solid rgba(255,255,255,0.55)', boxShadow: '0 8px 18px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.6)' }}>✓ İlgilendim</button>
        <button onClick={() => onCancel(order)}
          className="px-3.5 py-2.5 rounded-full text-xs font-semibold spring-btn"
          style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.5)' }}
          title="Çağrıyı iptal et">❌</button>
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
    const info = getCallTypeInfo(o.call_type);
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

      <div className="glass-panel rounded-3xl px-4 py-3 flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-serif font-bold text-xl text-white">Siparişler</h2>
          {pendingCount > 0 && filter === 'active' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.5)' }}>
              {pendingCount} yeni
            </span>
          )}
          {updateCount > 0 && filter === 'active' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold animate-pulse"
              style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.5)' }}>🔔 {updateCount} güncelleme</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold spring-btn ${filter === 'active' ? 'btn-accent' : 'glass-pill'}`}>
            Aktif
          </button>
          <button onClick={() => setFilter('delivered')}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold spring-btn ${filter === 'delivered' ? 'btn-accent' : 'glass-pill'}`}>
            Tamamlanan
          </button>
          <button onClick={handleRefresh} disabled={refreshing}
            className="glass-pill px-4 py-2 rounded-2xl text-sm font-semibold spring-btn disabled:opacity-60">
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>🔄</span>
          </button>
        </div>
      </div>

      {filter === 'active' && callOrders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold mb-3 uppercase tracking-wider flex items-center gap-2 px-1" style={{ color: '#FDA4AF' }}>
            🔔 Müşteri Çağrıları ({callOrders.length})
            {criticalCallCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white animate-pulse"
                style={{ background: 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)', border: '1px solid rgba(255,255,255,0.5)' }}>⚠️ {criticalCallCount} acil</span>
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
            pendingUpdate={pendingUpdates.get(order.id)}
            onAcknowledge={() => acknowledgeUpdate(order.id)}
            onUpdate={handleUpdateStatus} onCancel={setCancelTarget} />
        ))}

        {foodOrders.length === 0 && callOrders.length === 0 && !loadingDelivered && (
          <div className="glass-card col-span-full text-center py-16 rounded-3xl"
            style={{ borderStyle: 'dashed' }}>
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {filter === 'active' ? 'Aktif sipariş yok' : 'Tamamlanan sipariş yok'}
            </p>
          </div>
        )}

        {loadingDelivered && (
          <div className="col-span-full text-center py-16">
            <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Yükleniyor...</p>
          </div>
        )}
      </div>
    </div>
  );
}