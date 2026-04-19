// apps/web/src/pages/OrdersPage.tsx
import { useEffect, useState } from 'react';
import { useOrders, Order, OrderItem, CancelReasonCode } from '../context/OrderContext';

const FILTER_STORAGE_KEY = 'atlasqr:orders:filter';

type FilterType = 'active' | 'delivered';
type ToastState = { message: string; type: 'error' | 'success' } | null;

// İptal sebepleri
const CANCEL_REASONS: { code: CancelReasonCode; label: string; hint?: string }[] = [
  { code: 'customer_cancelled', label: 'Müşteri vazgeçti' },
  { code: 'customer_left', label: 'Müşteri gitti', hint: 'Sipariş bekliyor ama kişi yok' },
  { code: 'not_claimed', label: 'Hazır ama alıcı yok', hint: 'Yemek hazır, teslim alınmadı' },
  { code: 'no_payment', label: 'Ödemeden gitti', hint: 'Kasa açığı — teslim edildi ama ödeme alınamadı' },
  { code: 'wrong_order', label: 'Yanlış sipariş', hint: 'Mutfak veya sipariş hatası' },
  { code: 'out_of_stock', label: 'Stok yok', hint: 'Ürün bitti' },
  { code: 'other', label: 'Diğer', hint: 'Açıklama zorunludur' }
];

// Kod → Kısa label (cancel_reason'dan çıkan etiket için)
function parseReasonLabel(reasonString: string | null | undefined): { code: string; label: string; text: string } {
  if (!reasonString) return { code: '', label: 'İptal edildi', text: '' };
  const [code, ...rest] = reasonString.split(':');
  const text = rest.join(':').trim();
  const found = CANCEL_REASONS.find(r => r.code === code.trim());
  const label = found ? found.label : 'İptal edildi';
  return { code: code.trim(), label, text };
}

function priceIntToTl(value: number): string {
  return (value / 100).toFixed(2);
}

function orderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price_int * item.quantity, 0);
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}sn önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
  return `${Math.floor(diff / 3600)}sa önce`;
}

function useElapsed(dateStr: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(dateStr).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dateStr]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

// ─────────────────────────────────────────────────────────────
// İPTAL MODAL
// ─────────────────────────────────────────────────────────────

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <h3 className="font-bold text-base" style={{ color: '#0F172A' }}>
            Siparişi İptal Et
          </h3>
          <p className="text-xs mt-1" style={{ color: '#64748B' }}>
            {order.table_name} · {new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
            İptal Sebebi
          </label>

          <div className="mt-3 space-y-2">
            {CANCEL_REASONS.map(reason => {
              const selected = selectedCode === reason.code;
              return (
                <button
                  key={reason.code}
                  type="button"
                  onClick={() => setSelectedCode(reason.code)}
                  className="w-full text-left px-3 py-3 rounded-xl transition-all"
                  style={{
                    background: selected ? '#FEF2F2' : '#F8FAFC',
                    border: `2px solid ${selected ? '#DC2626' : '#E2E8F0'}`
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{
                        background: selected ? '#DC2626' : 'white',
                        border: `2px solid ${selected ? '#DC2626' : '#CBD5E1'}`
                      }}
                    >
                      {selected && (
                        <div className="w-2 h-2 rounded-full" style={{ background: 'white' }} />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                        {reason.label}
                      </div>
                      {reason.hint && (
                        <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                          {reason.hint}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Açıklama alanı */}
          {selectedCode && (
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
                {isOther ? 'Açıklama (zorunlu)' : 'Ek Açıklama (opsiyonel)'}
              </label>
              <textarea
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={isOther ? 'Lütfen iptal sebebini yazınız...' : 'İsteğe bağlı not...'}
                className="w-full mt-2 px-3 py-2 rounded-xl text-sm resize-none outline-none"
                style={{
                  border: `1px solid ${needsReasonText ? '#FECACA' : '#E2E8F0'}`,
                  background: '#F8FAFC',
                  color: '#0F172A'
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: needsReasonText ? '#DC2626' : '#94A3B8' }}>
                  {needsReasonText ? 'En az 3 karakter' : ''}
                </span>
                <span className="text-xs" style={{ color: '#94A3B8' }}>
                  {reasonText.length}/500
                </span>
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

        {/* Footer */}
        <div className="px-5 py-4 flex gap-2" style={{ borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: '#F1F5F9', color: '#0F172A' }}
          >
            Vazgeç
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: '#DC2626' }}
          >
            {submitting ? 'İptal ediliyor...' : 'İptal Et'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SİPARİŞ KARTI
// ─────────────────────────────────────────────────────────────

type OrderCardProps = {
  order: Order;
  onUpdate: (order: Order, status: Order['status']) => void;
  onCancel: (order: Order) => void;
};

function OrderCard({ order, onUpdate, onCancel }: OrderCardProps) {
  const elapsed = useElapsed(order.created_at);
  const isCancelled = order.status === 'cancelled';
  const reasonInfo = isCancelled ? parseReasonLabel(order.cancel_reason) : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden"
      style={{
        border: `1px solid ${
          isCancelled ? '#FECACA' :
          order.status === 'pending' ? '#FDE68A' : '#E2E8F0'
        }`,
        opacity: isCancelled ? 0.8 : 1
      }}>

      <div className="px-4 py-3 flex items-center justify-between"
        style={{
          background: isCancelled ? '#FEF2F2' :
            order.status === 'pending' ? '#FFFBEB' : '#F8FAFC',
          borderBottom: '1px solid #E2E8F0'
        }}>
        <div>
          <div className="font-bold text-sm" style={{color: '#0F172A'}}>{order.table_name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{color: '#94A3B8'}}>
              {new Date(order.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}
            </span>
            <span className="text-xs" style={{color: '#94A3B8'}}>·</span>
            <span className="text-xs" style={{color: '#94A3B8'}}>{timeAgo(order.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isCancelled && order.status !== 'delivered' && (
            <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg"
              style={{background: '#FEF3C7', color: '#B45309'}}>
              ⏱ {elapsed}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].color}}>
            {STATUS_LABELS[order.status]}
          </span>
        </div>
      </div>

      <div className="px-4 py-3">
        {/* İptal sebebi (varsa) */}
        {isCancelled && reasonInfo && (
          <div className="mb-3 px-3 py-2 rounded-lg" style={{background: '#FEF2F2', border: '1px solid #FECACA'}}>
            <div className="text-xs font-semibold" style={{color: '#991B1B'}}>
              ❌ {reasonInfo.label}
            </div>
            {reasonInfo.text && (
              <div className="text-xs mt-1" style={{color: '#7F1D1D'}}>
                {reasonInfo.text}
              </div>
            )}
          </div>
        )}

        {order.items.map(item => (
          <div key={item.id} className="flex items-center justify-between py-1.5"
            style={{borderBottom: '1px solid #F1F5F9'}}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{background: isCancelled ? '#94A3B8' : '#0D9488'}}>
                {item.quantity}
              </span>
              <span className="text-sm" style={{
                color: '#0F172A',
                textDecoration: isCancelled ? 'line-through' : 'none'
              }}>
                {item.product_name}
              </span>
            </div>
            <span className="text-xs font-semibold" style={{color: '#64748B'}}>
              {priceIntToTl(item.price_int * item.quantity)} TL
            </span>
          </div>
        ))}

        {order.note && (
          <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{background: '#FEF3C7', color: '#92400E'}}>
            📝 {order.note}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2" style={{borderTop: '1px solid #E2E8F0'}}>
          <span className="text-xs font-semibold" style={{color: '#64748B'}}>Toplam</span>
          <span className="font-bold text-sm" style={{
            color: isCancelled ? '#94A3B8' : '#0D9488',
            textDecoration: isCancelled ? 'line-through' : 'none'
          }}>
            {priceIntToTl(orderTotal(order.items))} TL
          </span>
        </div>
      </div>

      {/* Butonlar — sadece cancelled olmayanlarda */}
      {!isCancelled && (
        <div className="px-4 pb-4 flex gap-2">
          {order.status === 'pending' && (
            <button onClick={() => onUpdate(order, 'preparing')}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform"
              style={{background: '#0369A1'}}>
              Hazırlanıyor
            </button>
          )}
          {order.status === 'preparing' && (
            <button onClick={() => onUpdate(order, 'ready')}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform"
              style={{background: '#059669'}}>
              Hazır
            </button>
          )}
          {order.status === 'ready' && (
            <button onClick={() => onUpdate(order, 'delivered')}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform"
              style={{background: '#64748B'}}>
              Teslim Edildi ✓
            </button>
          )}
          {order.status === 'delivered' && (
            <div className="flex-1 py-2 rounded-xl text-xs font-semibold text-center"
              style={{background: '#F1F5F9', color: '#64748B'}}>
              Tamamlandı
            </div>
          )}

          {/* İptal butonu — her statüde */}
          <button
            onClick={() => onCancel(order)}
            className="px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
            style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
            title="Siparişi iptal et"
          >
            ❌
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ÇAĞRI KARTI
// ─────────────────────────────────────────────────────────────

type CallCardProps = {
  order: Order;
  onUpdate: (order: Order, status: Order['status']) => void;
  onCancel: (order: Order) => void;
};

function CallCard({ order, onUpdate, onCancel }: CallCardProps) {
  const elapsed = useElapsed(order.created_at);

  return (
    <div className="rounded-2xl p-4" style={{background: '#FEF2F2', border: '2px solid #FECACA'}}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔔</span>
          <span className="font-bold text-sm" style={{color: '#0F172A'}}>{order.table_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg" style={{background: '#FEE2E2', color: '#DC2626'}}>
            ⏱ {elapsed}
          </span>
          <span className="text-xs" style={{color: '#94A3B8'}}>
            {new Date(order.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}
          </span>
        </div>
      </div>
      <div className="text-xs mb-1" style={{color: '#94A3B8'}}>{timeAgo(order.created_at)}</div>
      {order.note && <p className="text-xs mb-3" style={{color: '#64748B'}}>{order.note}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => onUpdate(order, 'delivered')}
          className="flex-1 py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform"
          style={{background: '#DC2626'}}>
          Garson Gitti ✓
        </button>
        <button
          onClick={() => onCancel(order)}
          className="px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
          style={{ background: 'white', color: '#DC2626', border: '1px solid #FECACA' }}
          title="Çağrıyı iptal et"
        >
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
  const { activeOrders, refreshActive, fetchDelivered, updateOrderStatus, cancelOrder } = useOrders();

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
    // Tamamlananlar sekmesi açıksa yenile
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

  return (
    <div>
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: toast.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`}}>
          {toast.message}
        </div>
      )}

      {cancelTarget && (
        <CancelModal
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelConfirm}
        />
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-lg" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Siparişler</h2>
          {pendingCount > 0 && filter === 'active' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{background: '#DC2626'}}>
              {pendingCount} yeni
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('active')}
            className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
            style={{background: filter === 'active' ? '#0F172A' : '#F1F5F9', color: filter === 'active' ? 'white' : '#0F172A'}}>
            Aktif
          </button>
          <button onClick={() => setFilter('delivered')}
            className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
            style={{background: filter === 'delivered' ? '#0F172A' : '#F1F5F9', color: filter === 'delivered' ? 'white' : '#0F172A'}}>
            Tamamlanan
          </button>
          <button onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-transform disabled:opacity-60"
            style={{background: '#F1F5F9', color: '#0F172A'}}>
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>🔄</span>
          </button>
        </div>
      </div>

      {filter === 'active' && callOrders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{color: '#DC2626'}}>
            🔔 Garson Çağrıları ({callOrders.length})
          </h3>
          <div className="grid gap-3" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'}}>
            {callOrders.map(order => (
              <CallCard
                key={order.id}
                order={order}
                onUpdate={handleUpdateStatus}
                onCancel={setCancelTarget}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))'}}>
        {foodOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onUpdate={handleUpdateStatus}
            onCancel={setCancelTarget}
          />
        ))}

        {foodOrders.length === 0 && callOrders.length === 0 && !loadingDelivered && (
          <div className="col-span-full text-center py-16 rounded-2xl"
            style={{background: 'white', border: '1px dashed #E2E8F0'}}>
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-sm" style={{color: '#94A3B8'}}>
              {filter === 'active' ? 'Aktif sipariş yok' : 'Tamamlanan sipariş yok'}
            </p>
          </div>
        )}

        {loadingDelivered && (
          <div className="col-span-full text-center py-16">
            <p className="text-sm" style={{color: '#94A3B8'}}>Yükleniyor...</p>
          </div>
        )}
      </div>
    </div>
  );
}