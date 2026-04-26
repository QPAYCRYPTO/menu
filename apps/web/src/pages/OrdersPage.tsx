// apps/web/src/pages/OrdersPage.tsx
// CHANGELOG v6:
// - CallCard'a çağrı türü gösterimi: büyük emoji + label
// - Kritik türler kırmızı vurgulu (servis_eksik, masa_silinsin)
// - "Diğer" türü için note serbest text gösteriliyor

import { useEffect, useState } from 'react';
import { useOrders, Order, OrderItem, OrderChange, OrderUpdate, CancelReasonCode } from '../context/OrderContext';

const FILTER_STORAGE_KEY = 'atlasqr:orders:filter';

type FilterType = 'active' | 'delivered';
type ToastState = { message: string; type: 'error' | 'success' } | null;

const CANCEL_REASONS: { code: CancelReasonCode; label: string; hint?: string }[] = [
  { code: 'customer_cancelled', label: 'Müşteri vazgeçti' },
  { code: 'customer_left', label: 'Müşteri gitti', hint: 'Sipariş bekliyor ama kişi yok' },
  { code: 'not_claimed', label: 'Hazır ama alıcı yok', hint: 'Yemek hazır, teslim alınmadı' },
  { code: 'no_payment', label: 'Ödemeden gitti', hint: 'Kasa açığı — teslim edildi ama ödeme alınamadı' },
  { code: 'wrong_order', label: 'Yanlış sipariş', hint: 'Mutfak veya sipariş hatası' },
  { code: 'out_of_stock', label: 'Stok yok', hint: 'Ürün bitti' },
  { code: 'other', label: 'Diğer', hint: 'Açıklama zorunludur' }
];

// YENİ: Çağrı türü etiketleri
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
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('tr-TR', {
    hour: '2-digit', minute: '2-digit'
  });
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
  pending: 'Bekliyor',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
  delivered: 'Teslim Edildi',
  cancelled: 'İptal Edildi'
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#FEF3C7', color: '#B45309' },
  preparing: { bg: '#E0F2FE', color: '#0369A1' },
  ready: { bg: '#D1FAE5', color: '#065F46' },
  delivered: { bg: '#F1F5F9', color: '#64748B' },
  cancelled: { bg: '#FEE2E2', color: '#991B1B' }
};

function priceIntToTl(value: number): string {
  return (value / 100).toFixed(2);
}

function orderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price_int * item.quantity, 0);
}

function OrderSourceBadge({ order }: { order: Order }) {
  if (order.waiter_name) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
        style={{ background: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4' }}
        title={`Garson: ${order.waiter_name}`}>
        👤 {order.waiter_name}
      </span>
    );
  }
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: '#F1F5F9', color: '#94A3B8' }}
      title="Müşteri tarafından QR ile verilen sipariş">
      📱 Müşteri
    </span>
  );
}

function OrderTimeRow({ order }: { order: Order }) {
  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs" style={{ color: '#64748B' }}>
      <span className="font-mono">📅 {formatDate(order.created_at)}</span>
      <span style={{ color: '#CBD5E1' }}>·</span>
      <span className="font-mono">🕐 {formatTime(order.created_at)}</span>
      <span style={{ color: '#CBD5E1' }}>·</span>
      <span>{timeAgo(order.created_at)}</span>
    </div>
  );
}

function LiveTimerBadge({ dateStr }: { dateStr: string }) {
  const elapsed = useLiveElapsed(dateStr);
  return (
    <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg"
      style={{ background: '#FEF3C7', color: '#B45309' }}
      title="Sipariş verildikten beri geçen süre">
      ⏱ {elapsed}
    </span>
  );
}

function StaticTimerBadge({ duration, bg, color, title }: {
  duration: string; bg: string; color: string; title: string;
}) {
  return (
    <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg"
      style={{ background: bg, color }} title={title}>
      ⏱ {duration}
    </span>
  );
}

function OrderTimerBadge({ order }: { order: Order }) {
  if (order.status === 'pending' || order.status === 'preparing' || order.status === 'ready') {
    return <LiveTimerBadge dateStr={order.created_at} />;
  }
  if (order.status === 'delivered' && order.delivered_at) {
    return <StaticTimerBadge
      duration={staticDuration(order.created_at, order.delivered_at)}
      bg="#F0FDF4" color="#16A34A"
      title="Hazırlama süresi (sipariş → teslim)" />;
  }
  if (order.status === 'cancelled' && order.cancelled_at) {
    return <StaticTimerBadge
      duration={staticDuration(order.created_at, order.cancelled_at)}
      bg="#FEE2E2" color="#991B1B"
      title="İptal olana kadar geçen süre" />;
  }
  return null;
}

function ChangeRow({ change }: { change: OrderChange }) {
  if (change.action === 'added') {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: '#0F172A' }}>
        <span className="font-bold" style={{ color: '#16A34A' }}>➕ EKLENDI</span>
        <span className="font-semibold">{change.product_name}</span>
        <span style={{ color: '#64748B' }}>×{change.quantity}</span>
      </div>
    );
  }
  if (change.action === 'quantity_changed') {
    const oldQ = change.old_quantity ?? 0;
    const newQ = change.new_quantity ?? 0;
    const direction = newQ > oldQ ? '🔼' : '🔽';
    const dirColor = newQ > oldQ ? '#16A34A' : '#DC2626';
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: '#0F172A' }}>
        <span className="font-bold" style={{ color: dirColor }}>{direction} ADET</span>
        <span className="font-semibold">{change.product_name}</span>
        <span className="font-mono" style={{ color: '#64748B' }}>
          {oldQ} → <strong style={{ color: dirColor }}>{newQ}</strong>
        </span>
      </div>
    );
  }
  if (change.action === 'removed') {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: '#991B1B' }}>
        <span className="font-bold">❌ KALDIRILDI</span>
        <span className="font-semibold">{change.product_name}</span>
      </div>
    );
  }
  return null;
}

function UpdatePanel({ update, onAcknowledge }: {
  update: OrderUpdate;
  onAcknowledge: () => void;
}) {
  return (
    <div className="px-3 py-2.5 mb-2"
      style={{
        background: 'linear-gradient(90deg, #FEF3C7, #FDE68A)',
        borderTop: '2px solid #F59E0B',
        borderBottom: '2px solid #F59E0B'
      }}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base animate-pulse">🔔</span>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#92400E' }}>
            Güncelleme
          </span>
          {update.waiter_name && (
            <span className="text-xs font-semibold" style={{ color: '#92400E' }}>
              · 👤 {update.waiter_name}
            </span>
          )}
        </div>
        <button onClick={onAcknowledge}
          className="px-2 py-1 rounded-lg text-xs font-bold text-white active:scale-95 transition-transform"
          style={{ background: '#16A34A' }}
          title="Bu uyarıyı kapat">
          ✓ Gördüm
        </button>
      </div>
      <div className="space-y-1 pl-5">
        {update.changes.map((change, idx) => (
          <ChangeRow key={idx} change={change} />
        ))}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.6)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <h3 className="font-bold text-base" style={{ color: '#0F172A' }}>Siparişi İptal Et</h3>
          <p className="text-xs mt-1" style={{ color: '#64748B' }}>
            {order.table_name} · {formatDate(order.created_at)} {formatTime(order.created_at)}
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
            İptal Sebebi
          </label>
          <div className="mt-3 space-y-2">
            {CANCEL_REASONS.map(reason => {
              const selected = selectedCode === reason.code;
              return (
                <button key={reason.code} type="button"
                  onClick={() => setSelectedCode(reason.code)}
                  className="w-full text-left px-3 py-3 rounded-xl transition-all"
                  style={{
                    background: selected ? '#FEF2F2' : '#F8FAFC',
                    border: `2px solid ${selected ? '#DC2626' : '#E2E8F0'}`
                  }}>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{
                        background: selected ? '#DC2626' : 'white',
                        border: `2px solid ${selected ? '#DC2626' : '#CBD5E1'}`
                      }}>
                      {selected && <div className="w-2 h-2 rounded-full" style={{ background: 'white' }} />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm" style={{ color: '#0F172A' }}>{reason.label}</div>
                      {reason.hint && (
                        <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>{reason.hint}</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedCode && (
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
                {isOther ? 'Açıklama (zorunlu)' : 'Ek Açıklama (opsiyonel)'}
              </label>
              <textarea value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                rows={3} maxLength={500}
                placeholder={isOther ? 'Lütfen iptal sebebini yazınız...' : 'İsteğe bağlı not...'}
                className="w-full mt-2 px-3 py-2 rounded-xl text-sm resize-none outline-none"
                style={{
                  border: `1px solid ${needsReasonText ? '#FECACA' : '#E2E8F0'}`,
                  background: '#F8FAFC', color: '#0F172A'
                }} />
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: needsReasonText ? '#DC2626' : '#94A3B8' }}>
                  {needsReasonText ? 'En az 3 karakter' : ''}
                </span>
                <span className="text-xs" style={{ color: '#94A3B8' }}>{reasonText.length}/500</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 px-3 py-2 rounded-xl text-xs"
              style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex gap-2" style={{ borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
          <button onClick={onClose} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: '#F1F5F9', color: '#0F172A' }}>
            Vazgeç
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: '#DC2626' }}>
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

  const baseBorder = isCancelled ? '#FECACA' :
    order.status === 'pending' ? '#FDE68A' : '#E2E8F0';
  const borderColor = hasUpdate ? '#F59E0B' : baseBorder;
  const borderWidth = hasUpdate ? '3px' : '1px';

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden"
      style={{
        border: `${borderWidth} solid ${borderColor}`,
        opacity: isCancelled ? 0.8 : 1,
        animation: hasUpdate ? 'pulse-update 1.5s ease-in-out infinite' : undefined
      }}>

      <style>{`
        @keyframes pulse-update {
          0%, 100% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.35), 0 4px 6px -1px rgba(0,0,0,0.1); }
          50% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0.0), 0 4px 6px -1px rgba(0,0,0,0.1); }
        }
      `}</style>

      <div className="px-4 py-3"
        style={{
          background: isCancelled ? '#FEF2F2' :
            order.status === 'pending' ? '#FFFBEB' : '#F8FAFC',
          borderBottom: '1px solid #E2E8F0'
        }}>
        <div className="flex items-start justify-between gap-2">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="font-bold text-sm" style={{ color: '#0F172A' }}>{order.table_name}</div>
            <OrderTimeRow order={order} />
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
              style={{ background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].color }}>
              {STATUS_LABELS[order.status]}
            </span>
            <OrderSourceBadge order={order} />
            <OrderTimerBadge order={order} />
          </div>
        </div>
      </div>

      {pendingUpdate && (
        <UpdatePanel update={pendingUpdate} onAcknowledge={onAcknowledge} />
      )}

      <div className="px-4 py-3">
        {isCancelled && reasonInfo && (
          <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <div className="text-xs font-semibold" style={{ color: '#991B1B' }}>
              ❌ {reasonInfo.label}
            </div>
            {reasonInfo.text && (
              <div className="text-xs mt-1" style={{ color: '#7F1D1D' }}>{reasonInfo.text}</div>
            )}
          </div>
        )}

        {order.items.map(item => (
          <div key={item.id} className="py-1.5"
            style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: isCancelled ? '#94A3B8' : '#0D9488' }}>
                  {item.quantity}
                </span>
                <span className="text-sm" style={{
                  color: '#0F172A',
                  textDecoration: isCancelled ? 'line-through' : 'none'
                }}>
                  {item.product_name}
                </span>
              </div>
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#64748B' }}>
                {priceIntToTl(item.price_int * item.quantity)} TL
              </span>
            </div>

            {item.note && item.note.trim() && (
              <div className="mt-1 ml-8 px-2 py-1 rounded-lg text-xs"
                style={{
                  background: '#FFFBEB',
                  color: '#92400E',
                  border: '1px solid #FDE68A'
                }}>
                📝 {item.note}
              </div>
            )}
          </div>
        ))}

        {order.note && (
          <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>
            📋 <strong>Genel:</strong> {order.note}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid #E2E8F0' }}>
          <span className="text-xs font-semibold" style={{ color: '#64748B' }}>Toplam</span>
          <span className="font-bold text-sm" style={{
            color: isCancelled ? '#94A3B8' : '#0D9488',
            textDecoration: isCancelled ? 'line-through' : 'none'
          }}>
            {priceIntToTl(orderTotal(order.items))} TL
          </span>
        </div>
      </div>

      {!isCancelled && (
        <div className="px-4 pb-4 flex gap-2">
          {order.status === 'pending' && (
            <button onClick={() => onUpdate(order, 'preparing')}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform"
              style={{ background: '#0369A1' }}>
              Hazırlanıyor
            </button>
          )}
          {order.status === 'preparing' && (
            <button onClick={() => onUpdate(order, 'ready')}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform"
              style={{ background: '#059669' }}>
              Hazır
            </button>
          )}
          {order.status === 'ready' && (
            <button onClick={() => onUpdate(order, 'delivered')}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform"
              style={{ background: '#64748B' }}>
              Teslim Edildi ✓
            </button>
          )}
          {order.status === 'delivered' && (
            <div className="flex-1 py-2 rounded-xl text-xs font-semibold text-center"
              style={{ background: '#F1F5F9', color: '#64748B' }}>
              Tamamlandı
            </div>
          )}

          <button onClick={() => onCancel(order)}
            className="px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
            style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
            title="Siparişi iptal et">
            ❌
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ÇAĞRI KARTI — call_type ile büyük emoji + label gösteriyor
// ─────────────────────────────────────────────────────────────

type CallCardProps = {
  order: Order;
  onUpdate: (order: Order, status: Order['status']) => void;
  onCancel: (order: Order) => void;
};

function CallCard({ order, onUpdate, onCancel }: CallCardProps) {
  const callInfo = getCallTypeInfo(order.call_type);

  // Kritik çağrı türleri için kırmızı vurgu, diğerleri için sarı
  const cardBg = callInfo.critical ? '#FEF2F2' : '#FFFBEB';
  const cardBorder = callInfo.critical ? '#FECACA' : '#FDE68A';
  const accentColor = callInfo.critical ? '#DC2626' : '#B45309';
  const titleColor = callInfo.critical ? '#991B1B' : '#92400E';

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: cardBg, border: `2px solid ${cardBorder}` }}>

      {/* Üst — büyük emoji + label */}
      <div style={{
        padding: '16px',
        background: callInfo.critical
          ? 'linear-gradient(135deg, #FEE2E2, #FECACA)'
          : 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
        borderBottom: `1px solid ${cardBorder}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14
      }}>
        <div style={{
          fontSize: 40,
          lineHeight: 1,
          flexShrink: 0
        }}>
          {callInfo.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: accentColor,
            marginBottom: 2
          }}>
            {callInfo.critical ? '⚠️ Acil İstek' : 'Çağrı'}
          </div>
          <div style={{
            fontSize: 17,
            fontWeight: 800,
            color: titleColor,
            fontFamily: 'Georgia, serif',
            lineHeight: 1.2
          }}>
            {callInfo.label}
          </div>
          <div className="font-bold text-sm mt-0.5" style={{ color: '#0F172A' }}>
            📍 {order.table_name}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <OrderTimerBadge order={order} />
        </div>
      </div>

      {/* "Diğer" türü için serbest not */}
      {order.call_type === 'other' && order.note && (
        <div style={{
          padding: '10px 16px',
          background: 'white',
          borderBottom: `1px solid ${cardBorder}`
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#64748B',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            marginBottom: 4
          }}>
            📝 Müşteri Açıklaması
          </div>
          <div style={{ fontSize: 14, color: '#0F172A', lineHeight: 1.4 }}>
            {order.note}
          </div>
        </div>
      )}

      {/* Diğer türlerde note varsa (örn: serbest not eklemiş) */}
      {order.call_type !== 'other' && order.note && order.note.trim() && (
        <div style={{ padding: '8px 16px' }}>
          <div className="text-xs px-2 py-1 rounded-lg" style={{ background: 'white', color: '#92400E', border: '1px solid #FDE68A' }}>
            📝 {order.note}
          </div>
        </div>
      )}

      {/* Tarih/saat */}
      <div style={{ padding: '8px 16px', borderTop: `1px solid ${cardBorder}` }}>
        <div className="flex items-center gap-1.5 flex-wrap text-xs" style={{ color: '#64748B' }}>
          <span className="font-mono">📅 {formatDate(order.created_at)}</span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span className="font-mono">🕐 {formatTime(order.created_at)}</span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span>{timeAgo(order.created_at)}</span>
        </div>
      </div>

      {/* Aksiyon butonları */}
      <div style={{ padding: '8px 16px 16px', display: 'flex', gap: 8 }}>
        <button onClick={() => onUpdate(order, 'delivered')}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 transition-transform"
          style={{ background: callInfo.critical ? '#DC2626' : '#16A34A' }}>
          ✓ İlgilendim
        </button>
        <button onClick={() => onCancel(order)}
          className="px-3 py-2.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
          style={{ background: 'white', color: '#DC2626', border: '1px solid #FECACA' }}
          title="Çağrıyı iptal et">
          ❌
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────

export function OrdersPage() {
  const {
    activeOrders,
    refreshActive,
    fetchDelivered,
    updateOrderStatus,
    cancelOrder,
    pendingUpdates,
    acknowledgeUpdate
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

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

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

  // Kritik çağrı sayısı (servis_eksik, masa_silinsin)
  const criticalCallCount = callOrders.filter(o => {
    const info = getCallTypeInfo(o.call_type);
    return info.critical;
  }).length;

  return (
    <div>
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4',
            color: toast.type === 'error' ? '#DC2626' : '#16A34A',
            border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`
          }}>
          {toast.message}
        </div>
      )}

      {cancelTarget && (
        <CancelModal order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelConfirm} />
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-bold text-lg" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>Siparişler</h2>
          {pendingCount > 0 && filter === 'active' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: '#DC2626' }}>
              {pendingCount} yeni
            </span>
          )}
          {updateCount > 0 && filter === 'active' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white animate-pulse"
              style={{ background: '#F59E0B' }}>
              🔔 {updateCount} güncelleme
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('active')}
            className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
            style={{ background: filter === 'active' ? '#0F172A' : '#F1F5F9', color: filter === 'active' ? 'white' : '#0F172A' }}>
            Aktif
          </button>
          <button onClick={() => setFilter('delivered')}
            className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
            style={{ background: filter === 'delivered' ? '#0F172A' : '#F1F5F9', color: filter === 'delivered' ? 'white' : '#0F172A' }}>
            Tamamlanan
          </button>
          <button onClick={handleRefresh} disabled={refreshing}
            className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: '#F1F5F9', color: '#0F172A' }}>
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>🔄</span>
          </button>
        </div>
      </div>

      {filter === 'active' && callOrders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider flex items-center gap-2" style={{ color: '#DC2626' }}>
            🔔 Müşteri Çağrıları ({callOrders.length})
            {criticalCallCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white animate-pulse"
                style={{ background: '#DC2626' }}>
                ⚠️ {criticalCallCount} acil
              </span>
            )}
          </h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {callOrders.map(order => (
              <CallCard key={order.id} order={order}
                onUpdate={handleUpdateStatus} onCancel={setCancelTarget} />
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
          <div className="col-span-full text-center py-16 rounded-2xl"
            style={{ background: 'white', border: '1px dashed #E2E8F0' }}>
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-sm" style={{ color: '#94A3B8' }}>
              {filter === 'active' ? 'Aktif sipariş yok' : 'Tamamlanan sipariş yok'}
            </p>
          </div>
        )}

        {loadingDelivered && (
          <div className="col-span-full text-center py-16">
            <p className="text-sm" style={{ color: '#94A3B8' }}>Yükleniyor...</p>
          </div>
        )}
      </div>
    </div>
  );
}