// apps/web/src/pages/OrdersPage.tsx
import { useEffect, useState } from 'react';
import { useOrders, Order, OrderItem } from '../context/OrderContext';

const FILTER_STORAGE_KEY = 'atlasqr:orders:filter';

type FilterType = 'active' | 'delivered';
type ToastState = { message: string; type: 'error' | 'success' } | null;

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
  delivered: 'Teslim Edildi'
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#FEF3C7', color: '#B45309' },
  preparing: { bg: '#E0F2FE', color: '#0369A1' },
  ready: { bg: '#D1FAE5', color: '#065F46' },
  delivered: { bg: '#F1F5F9', color: '#64748B' }
};

function OrderCard({ order, onUpdate }: { order: Order; onUpdate: (order: Order, status: Order['status']) => void }) {
  const elapsed = useElapsed(order.created_at);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden"
      style={{border: `1px solid ${order.status === 'pending' ? '#FDE68A' : '#E2E8F0'}`}}>

      <div className="px-4 py-3 flex items-center justify-between"
        style={{background: order.status === 'pending' ? '#FFFBEB' : '#F8FAFC', borderBottom: '1px solid #E2E8F0'}}>
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
          {order.status !== 'delivered' && (
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
        {order.items.map(item => (
          <div key={item.id} className="flex items-center justify-between py-1.5"
            style={{borderBottom: '1px solid #F1F5F9'}}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{background: '#0D9488'}}>
                {item.quantity}
              </span>
              <span className="text-sm" style={{color: '#0F172A'}}>{item.product_name}</span>
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
          <span className="font-bold text-sm" style={{color: '#0D9488'}}>
            {priceIntToTl(orderTotal(order.items))} TL
          </span>
        </div>
      </div>

      {order.status !== 'delivered' && (
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
        </div>
      )}
    </div>
  );
}

function CallCard({ order, onUpdate }: { order: Order; onUpdate: (order: Order, status: Order['status']) => void }) {
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
      <button onClick={() => onUpdate(order, 'delivered')}
        className="w-full py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform"
        style={{background: '#DC2626'}}>
        Garson Gitti ✓
      </button>
    </div>
  );
}

export function OrdersPage() {
  const { activeOrders, refreshActive, fetchDelivered, updateOrderStatus } = useOrders();

  const [filter, setFilter] = useState<FilterType>(() => {
    const saved = localStorage.getItem(FILTER_STORAGE_KEY);
    return (saved === 'active' || saved === 'delivered') ? saved : 'active';
  });

  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  const [loadingDelivered, setLoadingDelivered] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, filter);
  }, [filter]);

  // Tamamlananlar sekmesine geçildiğinde fetch et
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
              <CallCard key={order.id} order={order} onUpdate={handleUpdateStatus} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))'}}>
        {foodOrders.map(order => (
          <OrderCard key={order.id} order={order} onUpdate={handleUpdateStatus} />
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