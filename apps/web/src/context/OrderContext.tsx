// apps/web/src/context/OrderContext.tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';

export type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_int: number;
};

export type Order = {
  id: string;
  table_id: string;
  table_name: string;
  status: 'pending' | 'preparing' | 'ready' | 'delivered';
  note: string | null;
  type: 'order' | 'call';
  created_at: string;
  items: OrderItem[];
};

type OrderContextValue = {
  // Aktif siparişler (pending/preparing/ready)
  activeOrders: Order[];
  // Badge sayıları
  pendingCount: number;
  callCount: number;
  // Ses kilidi
  unlockAudio: () => void;
  // Manuel refresh (yenile butonu için)
  refreshActive: () => Promise<void>;
  // Tamamlananlar için ayrı fetch — sadece Tamamlananlar sekmesi tıklayınca kullanılır
  fetchDelivered: () => Promise<Order[]>;
  // Sipariş durumu güncelleme — optimistic update + backend çağrısı
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
};

const OrderContext = createContext<OrderContextValue>({
  activeOrders: [],
  pendingCount: 0,
  callCount: 0,
  unlockAudio: () => {},
  refreshActive: async () => {},
  fetchDelivered: async () => [],
  updateOrderStatus: async () => {}
});

function playOrderSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1); gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987, ctx.currentTime);
    gain1.gain.setValueAtTime(0.7, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 1.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783, ctx.currentTime + 0.6);
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.6);
    gain2.gain.setValueAtTime(0.7, ctx.currentTime + 0.65);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
    osc2.start(ctx.currentTime + 0.6); osc2.stop(ctx.currentTime + 1.8);
  } catch {}
}

function playCallSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.45, 0.9].forEach(time => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1318, ctx.currentTime + time);
      gain.gain.setValueAtTime(0.7, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.35);
      osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + 0.35);
    });
  } catch {}
}

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const audioUnlocked = useRef(false);

  const unlockAudio = useCallback(() => {
    if (audioUnlocked.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume();
      audioUnlocked.current = true;
    } catch {}
  }, []);

  // Aktif siparişleri backend'den çek — sadece ilk yükleme ve manuel yenile için
  const refreshActive = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiRequest<Order[]>('/admin/orders', { token: accessToken });
      setActiveOrders(data);
    } catch {}
  }, [accessToken]);

  // Tamamlananları çek — OrdersPage "Tamamlanan" sekmesine tıklayınca kullanır
  const fetchDelivered = useCallback(async (): Promise<Order[]> => {
    if (!accessToken) return [];
    try {
      const data = await apiRequest<Order[]>('/admin/orders?status=delivered', { token: accessToken });
      return data;
    } catch {
      return [];
    }
  }, [accessToken]);

  // Sipariş durumu güncelle — optimistic update
  const updateOrderStatus = useCallback(async (orderId: string, status: Order['status']) => {
    if (!accessToken) return;

    // Optimistic: UI'yi hemen güncelle
    if (status === 'delivered') {
      // delivered olan aktif listeden çıkar
      setActiveOrders(prev => prev.filter(o => o.id !== orderId));
    } else {
      setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    }

    try {
      await apiRequest(`/admin/orders/${orderId}`, {
        method: 'PUT',
        token: accessToken,
        body: { status }
      });
    } catch (e) {
      // Hata olursa tekrar yükle
      await refreshActive();
      throw e;
    }
  }, [accessToken, refreshActive]);

  useEffect(() => {
    if (!accessToken) return;

    // İlk yüklemede aktif siparişleri çek
    refreshActive();

    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    async function connectSSE() {
      if (cancelled) return;
      try {
        const response = await fetch(`${API_BASE_URL}/admin/orders/stream`, {
          headers: { Authorization: `Bearer ${accessToken!}` }
        });
        if (!response.body || cancelled) return;
        reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n')) {
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5).trim());

                // Yeni sipariş veya garson çağrısı geldi
                if (data.type === 'new_order' || data.type === 'call') {
                  // Ses çal
                  if (data.type === 'call') playCallSound();
                  else playOrderSound();

                  // Backend yeni payload gönderiyorsa (order alanı varsa) direkt state'e ekle — API ÇAĞRISI YOK
                  if (data.order) {
                    setActiveOrders(prev => {
                      // Duplicate kontrolü (aynı ID iki kez gelirse)
                      if (prev.find(o => o.id === data.order.id)) return prev;
                      return [data.order, ...prev];
                    });
                  } else {
                    // Fallback: eski payload formatı — API'den çek
                    await refreshActive();
                  }
                }
              } catch {}
            }
          }
        }

        // Stream kapandıysa yeniden bağlan
        if (!cancelled) setTimeout(connectSSE, 3000);
      } catch {
        if (!cancelled) setTimeout(connectSSE, 5000);
      }
    }

    connectSSE();

    // Güvenlik ağı: 60 saniyede bir sync — SSE kaçırırsa tutarsızlık olmasın
    const syncInterval = setInterval(() => {
      refreshActive();
    }, 60000);

    return () => {
      cancelled = true;
      if (reader) {
        try { reader.cancel(); } catch {}
      }
      clearInterval(syncInterval);
    };
  }, [accessToken, refreshActive]);

  const pendingCount = activeOrders.filter(o => o.status === 'pending').length;
  const callCount = activeOrders.filter(o => o.type === 'call' && o.status === 'pending').length;

  return (
    <OrderContext.Provider value={{
      activeOrders,
      pendingCount,
      callCount,
      unlockAudio,
      refreshActive,
      fetchDelivered,
      updateOrderStatus
    }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  return useContext(OrderContext);
}