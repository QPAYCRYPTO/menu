// apps/web/src/context/OrderContext.tsx
// CHANGELOG v3:
// - Güncelleme uyarıları KALICI — admin "Gördüm" diyene kadar yanıp söner
// - Her güncelleme için detay tutuluyor: ne değişti, kim, ne zaman
// - acknowledgeUpdate(orderId) — admin onaylayınca kaldırır

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

export type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_int: number;
  note?: string | null;  
};

export type Order = {
  id: string;
  table_id: string;
  table_name: string;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  note: string | null;
  type: 'order' | 'call';
  call_type?: string | null;  
  created_at: string;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  waiter_id?: string | null;
  waiter_name?: string | null;
  items: OrderItem[];
};

export type CancelReasonCode =
  | 'customer_cancelled'
  | 'customer_left'
  | 'not_claimed'
  | 'no_payment'
  | 'wrong_order'
  | 'out_of_stock'
  | 'other';

// Tek bir değişiklik kaydı
export type OrderChange = {
  action: 'added' | 'quantity_changed' | 'removed';
  product_name: string;
  quantity?: number;
  old_quantity?: number;
  new_quantity?: number;
};

// Bir sipariş için biriken güncelleme bildirimi
export type OrderUpdate = {
  order_id: string;
  table_name: string;
  changes: OrderChange[];
  waiter_name: string | null;
  timestamp: number;
};

type OrderContextValue = {
  activeOrders: Order[];
  pendingCount: number;
  callCount: number;
  pendingUpdates: Map<string, OrderUpdate>; // YENİ: Onay bekleyen güncellemeler
  acknowledgeUpdate: (orderId: string) => void; // YENİ: Admin "Gördüm" der
  unlockAudio: () => void;
  refreshActive: () => Promise<void>;
  fetchDelivered: () => Promise<Order[]>;
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
  cancelOrder: (orderId: string, reasonCode: CancelReasonCode, reasonText?: string) => Promise<void>;
};

const OrderContext = createContext<OrderContextValue>({
  activeOrders: [],
  pendingCount: 0,
  callCount: 0,
  pendingUpdates: new Map(),
  acknowledgeUpdate: () => {},
  unlockAudio: () => {},
  refreshActive: async () => {},
  fetchDelivered: async () => [],
  updateOrderStatus: async () => {},
  cancelOrder: async () => {}
});

// ─────────────────────────────────────────────────────────────
// SES EFEKTLERI
// ─────────────────────────────────────────────────────────────

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

function playUpdateSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1568, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, OrderUpdate>>(new Map());
  const audioUnlocked = useRef(false);

  const tokenRef = useRef(accessToken);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  /**
   * Bir sipariş için yeni güncelleme kaydet.
   * Aynı sipariş için zaten kayıt varsa, yeni değişiklikleri MEVCUT'a ekle (birikme).
   */
  const addUpdate = useCallback((
    orderId: string,
    tableName: string,
    waiterName: string | null,
    newChanges: OrderChange[]
  ) => {
    setPendingUpdates(prev => {
      const next = new Map(prev);
      const existing = next.get(orderId);

      if (existing) {
        // Mevcut güncellemeye yeni değişiklikleri ekle
        next.set(orderId, {
          ...existing,
          changes: [...existing.changes, ...newChanges],
          timestamp: Date.now()
        });
      } else {
        // Yeni kayıt
        next.set(orderId, {
          order_id: orderId,
          table_name: tableName,
          waiter_name: waiterName,
          changes: newChanges,
          timestamp: Date.now()
        });
      }

      return next;
    });
  }, []);

  /**
   * Admin "Gördüm" der → güncelleme kaydı kaldırılır.
   * Kart normale döner.
   */
  const acknowledgeUpdate = useCallback((orderId: string) => {
    setPendingUpdates(prev => {
      const next = new Map(prev);
      next.delete(orderId);
      return next;
    });
  }, []);

  const unlockAudio = useCallback(() => {
    if (audioUnlocked.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume();
      audioUnlocked.current = true;
    } catch {}
  }, []);

  const refreshActive = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const data = await apiRequest<Order[]>('/admin/orders', { token });
      setActiveOrders(data);
    } catch {}
  }, []);

  const fetchDelivered = useCallback(async (): Promise<Order[]> => {
    const token = tokenRef.current;
    if (!token) return [];
    try {
      const [delivered, cancelled] = await Promise.all([
        apiRequest<Order[]>('/admin/orders?status=delivered', { token }),
        apiRequest<Order[]>('/admin/orders?status=cancelled', { token })
      ]);
      const all = [...delivered, ...cancelled].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return all;
    } catch {
      return [];
    }
  }, []);

  const updateOrderStatus = useCallback(async (orderId: string, status: Order['status']) => {
    const token = tokenRef.current;
    if (!token) return;

    if (status === 'delivered') {
      setActiveOrders(prev => prev.filter(o => o.id !== orderId));
      // Teslim edilince update bildirimi de kaldırılsın
      acknowledgeUpdate(orderId);
    } else {
      setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    }

    try {
      await apiRequest(`/admin/orders/${orderId}`, {
        method: 'PUT',
        token,
        body: { status }
      });
    } catch (e) {
      await refreshActive();
      throw e;
    }
  }, [refreshActive, acknowledgeUpdate]);

  const cancelOrder = useCallback(async (
    orderId: string,
    reasonCode: CancelReasonCode,
    reasonText?: string
  ) => {
    const token = tokenRef.current;
    if (!token) return;

    setActiveOrders(prev => prev.filter(o => o.id !== orderId));
    acknowledgeUpdate(orderId); // İptal edilince update kaydını sil

    try {
      await apiRequest(`/admin/orders/${orderId}/cancel`, {
        method: 'POST',
        token,
        body: { reason_code: reasonCode, reason_text: reasonText }
      });
    } catch (e) {
      await refreshActive();
      throw e;
    }
  }, [refreshActive, acknowledgeUpdate]);

  useEffect(() => {
    if (!accessToken) return;

    let mounted = true;
    apiRequest<Order[]>('/admin/orders', { token: accessToken })
      .then(data => { if (mounted) setActiveOrders(data); })
      .catch(() => {});

    let abortController: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function refetchOrders() {
      const token = tokenRef.current;
      if (!token) return;
      try {
        const fresh = await apiRequest<Order[]>('/admin/orders', { token });
        setActiveOrders(fresh);
      } catch {}
    }

    async function connectSSE() {
      if (cancelled) return;

      abortController = new AbortController();

      try {
        console.log('[SSE] Bağlanılıyor...');
        const response = await fetch(`${API_BASE_URL}/admin/orders/stream`, {
          headers: { Authorization: `Bearer ${accessToken!}` },
          signal: abortController.signal
        });

        if (!response.body || cancelled) return;
        console.log('[SSE] Bağlandı');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('[SSE] Stream kapandı');
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';

          for (const message of messages) {
            for (const line of message.split('\n')) {
              if (line.startsWith('data:')) {
                const dataStr = line.slice(5).trim();
                if (!dataStr) continue;

                try {
                  const data = JSON.parse(dataStr);
                  console.log('[SSE] Event alındı:', data.type, data);

                  // ─── YENİ SİPARİŞ / ÇAĞRI ─────────────────────
                  if (data.type === 'new_order' || data.type === 'call') {
                    if (data.type === 'call') playCallSound();
                    else playOrderSound();

                    if (data.order) {
                      setActiveOrders(prev => {
                        if (prev.find(o => o.id === data.order.id)) return prev;
                        return [data.order, ...prev];
                      });
                    } else {
                      const token = tokenRef.current;
                      if (token) {
                        try {
                          const fresh = await apiRequest<Order[]>('/admin/orders', { token });
                          setActiveOrders(fresh);
                        } catch {}
                      }
                    }
                  }
                  // ─── İPTAL ─────────────────────────────────────
                  else if (data.type === 'order_cancelled') {
                    if (data.order_id) {
                      setActiveOrders(prev => prev.filter(o => o.id !== data.order_id));
                      acknowledgeUpdate(data.order_id);
                    }
                  }
                  // ─── GARSON ÜRÜN EKLEDİ ────────────────────────
                  else if (data.type === 'order_items_added') {
                    playUpdateSound();

                    if (data.order_id && data.changes) {
                      addUpdate(
                        data.order_id,
                        data.table_name || '',
                        data.waiter_name || null,
                        data.changes as OrderChange[]
                      );
                    }
                    await refetchOrders();
                  }
                  // ─── GARSON ADET DEĞİŞTİRDİ ────────────────────
                  else if (data.type === 'order_items_updated') {
                    playUpdateSound();

                    if (data.order_id && data.changes) {
                      addUpdate(
                        data.order_id,
                        data.table_name || '',
                        data.waiter_name || null,
                        data.changes as OrderChange[]
                      );
                    }
                    await refetchOrders();
                  }
                } catch (err) {
                  console.error('[SSE] Parse hatası:', err, dataStr);
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          console.log('[SSE] Bağlantı iptal edildi');
          return;
        }
        console.error('[SSE] Bağlantı hatası:', err);
      }

      if (!cancelled) {
        console.log('[SSE] 3 saniye sonra yeniden bağlanılacak');
        reconnectTimer = setTimeout(connectSSE, 3000);
      }
    }

    connectSSE();

    const syncInterval = setInterval(() => {
      const token = tokenRef.current;
      if (!token) return;
      apiRequest<Order[]>('/admin/orders', { token })
        .then(data => setActiveOrders(data))
        .catch(() => {});
    }, 60000);

    return () => {
      console.log('[SSE] Cleanup');
      cancelled = true;
      mounted = false;
      if (abortController) {
        try { abortController.abort(); } catch {}
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(syncInterval);
    };
  }, [accessToken, addUpdate, acknowledgeUpdate]);

  const pendingCount = activeOrders.filter(o => o.status === 'pending').length;
  const callCount = activeOrders.filter(o => o.type === 'call' && o.status === 'pending').length;

  return (
    <OrderContext.Provider value={{
      activeOrders,
      pendingCount,
      callCount,
      pendingUpdates,
      acknowledgeUpdate,
      unlockAudio,
      refreshActive,
      fetchDelivered,
      updateOrderStatus,
      cancelOrder
    }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  return useContext(OrderContext);
}