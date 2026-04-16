// apps/web/src/pages/OrdersPage.tsx
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';

type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_int: number;
};

type Order = {
  id: string;
  table_id: string;
  table_name: string;
  status: 'pending' | 'preparing' | 'ready' | 'delivered';
  note: string | null;
  type: 'order' | 'call';
  created_at: string;
  items: OrderItem[];
};

type ToastState = { message: string; type: 'error' | 'success' } | null;

function priceIntToTl(value: number): string {
  return (value / 100).toFixed(2);
}

function orderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price_int * item.quantity, 0);
}

function playOrderSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987, ctx.currentTime);
    gain1.gain.setValueAtTime(0.7, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 1.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783, ctx.currentTime + 0.6);
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.6);
    gain2.gain.setValueAtTime(0.7, ctx.currentTime + 0.65);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
    osc2.start(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 1.8);
  } catch {}
}

function playCallSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.45, 0.9].forEach(time => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1318, ctx.currentTime + time);
      gain.gain.setValueAtTime(0.7, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.35);
      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + 0.35);
    });
  } catch {}
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

export function OrdersPage() {
  const { accessToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [filter, setFilter] = useState<string>('active');
  const prevOrderIds = useRef<Set<string>>(new Set());
  const audioUnlocked = useRef(false);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  function unlockAudio() {
    if (audioUnlocked.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume();
      audioUnlocked.current = true;
    } catch {}
  }

  async function loadOrders() {
    try {
      const url = filter === 'active'
        ? '/admin/orders'
        : '/admin/orders?status=delivered';
      const data = await apiRequest<Order[]>(url, { token: accessToken });

      if (filter === 'active') {
        // Yeni sipariş var mı kontrol et — ses çal
        const newIds = new Set(data.map((o: Order) => o.id));
        const hasNew = [...newIds].some(id => !prevOrderIds.current.has(id));

        if (hasNew && prevOrderIds.current.size > 0) {
          const newOrders = data.filter((o: Order) => !prevOrderIds.current.has(o.id));
          const hasCall = newOrders.some(o => o.type === 'call');
          if (hasCall) playCallSound();
          else playOrderSound();
        }

        prevOrderIds.current = newIds;

        // Delivered olanları koru
        setOrders(prev => {
          const deliveredPrev = prev.filter(o => o.status === 'delivered');
          return [...data, ...deliveredPrev.filter(d => !data.find(n => n.id === d.id))];
        });
      } else {
        setOrders(data);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Siparişler alınamadı.', 'error');
    }
  }

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [accessToken, filter]);

  async function updateStatus(order: Order, status: string) {
    try {
      await apiRequest(`/admin/orders/${order.id}`, {
        method: 'PUT',
        token: accessToken,
        body: { status }
      });
      await loadOrders();
      showToast('Durum güncellendi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi.', 'error');
    }
  }

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const callOrders = orders.filter(o => o.type === 'call' && o.status === 'pending');
  const foodOrders = orders.filter(o => o.type === 'order');

  return (
    <div onClick={unlockAudio}>
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: toast.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`}}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-lg" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Siparişler</h2>
          {pendingCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{background: '#DC2626'}}>
              {pendingCount} yeni
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('active')}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{background: filter === 'active' ? '#0F172A' : '#F1F5F9', color: filter === 'active' ? 'white' : '#0F172A'}}>
            Aktif
          </button>
          <button onClick={() => setFilter('delivered')}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{background: filter === 'delivered' ? '#0F172A' : '#F1F5F9', color: filter === 'delivered' ? 'white' : '#0F172A'}}>
            Tamamlanan
          </button>
          <button onClick={loadOrders}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{background: '#F1F5F9', color: '#0F172A'}}>
            🔄
          </button>
        </div>
      </div>

      {/* Garson Çağrıları */}
      {callOrders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{color: '#DC2626'}}>
            🔔 Garson Çağrıları ({callOrders.length})
          </h3>
          <div className="grid gap-3" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'}}>
            {callOrders.map(order => (
              <div key={order.id} className="rounded-2xl p-4"
                style={{background: '#FEF2F2', border: '2px solid #FECACA'}}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔔</span>
                    <span className="font-bold text-sm" style={{color: '#0F172A'}}>{order.table_name}</span>
                  </div>
                  <span className="text-xs" style={{color: '#94A3B8'}}>
                    {new Date(order.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}
                  </span>
                </div>
                {order.note && <p className="text-xs mb-3" style={{color: '#64748B'}}>{order.note}</p>}
                <button onClick={() => updateStatus(order, 'delivered')}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-white"
                  style={{background: '#DC2626'}}>
                  Garson Gitti ✓
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Siparişler */}
      <div className="grid gap-4" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))'}}>
        {foodOrders.map(order => (
          <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden"
            style={{border: `1px solid ${order.status === 'pending' ? '#FDE68A' : '#E2E8F0'}`}}>

            <div className="px-4 py-3 flex items-center justify-between"
              style={{background: order.status === 'pending' ? '#FFFBEB' : '#F8FAFC', borderBottom: '1px solid #E2E8F0'}}>
              <div>
                <div className="font-bold text-sm" style={{color: '#0F172A'}}>{order.table_name}</div>
                <div className="text-xs" style={{color: '#94A3B8'}}>
                  {new Date(order.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].color}}>
                {STATUS_LABELS[order.status]}
              </span>
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
                  <button onClick={() => updateStatus(order, 'preparing')}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{background: '#0369A1'}}>
                    Hazırlanıyor
                  </button>
                )}
                {order.status === 'preparing' && (
                  <button onClick={() => updateStatus(order, 'ready')}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{background: '#059669'}}>
                    Hazır
                  </button>
                )}
                {order.status === 'ready' && (
                  <button onClick={() => updateStatus(order, 'delivered')}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{background: '#64748B'}}>
                    Teslim Edildi ✓
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {foodOrders.length === 0 && callOrders.length === 0 && (
          <div className="col-span-full text-center py-16 rounded-2xl"
            style={{background: 'white', border: '1px dashed #E2E8F0'}}>
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-sm" style={{color: '#94A3B8'}}>
              {filter === 'active' ? 'Aktif sipariş yok' : 'Tamamlanan sipariş yok'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}