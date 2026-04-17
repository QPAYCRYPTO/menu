// apps/web/src/context/OrderContext.tsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';

type OrderContextValue = {
  pendingCount: number;
  callCount: number;
  unlockAudio: () => void;
};

const OrderContext = createContext<OrderContextValue>({
  pendingCount: 0,
  callCount: 0,
  unlockAudio: () => {}
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
  const [pendingCount, setPendingCount] = useState(0);
  const [callCount, setCallCount] = useState(0);
  const prevIds = useRef<Set<string>>(new Set());
  const audioUnlocked = useRef(false);

  function unlockAudio() {
    if (audioUnlocked.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume();
      audioUnlocked.current = true;
    } catch {}
  }

  async function fetchCounts() {
    if (!accessToken) return;
    try {
      const orders = await apiRequest<any[]>('/admin/orders', { token: accessToken });
      const pending = orders.filter((o: any) => o.status === 'pending');
      const calls = pending.filter((o: any) => o.type === 'call');

      setPendingCount(pending.length);
      setCallCount(calls.length);

      const newIds = new Set(pending.map((o: any) => o.id as string));
      const hasNew = [...newIds].some(id => !prevIds.current.has(id));

      if (hasNew && prevIds.current.size > 0) {
        const newOrders = pending.filter((o: any) => !prevIds.current.has(o.id));
        if (newOrders.some((o: any) => o.type === 'call')) playCallSound();
        else playOrderSound();
      }

      prevIds.current = newIds;
    } catch {}
  }

  useEffect(() => {
    if (!accessToken) return;

    fetchCounts();

    // SSE bağlantısı
    async function connectSSE() {
      try {
        const response = await fetch(`${API_BASE_URL}/admin/orders/stream`, {
          headers: { Authorization: `Bearer ${accessToken!}` }
        });
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n')) {
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5).trim());
                if (data.type === 'new_order') { playOrderSound(); await fetchCounts(); }
                else if (data.type === 'call') { playCallSound(); await fetchCounts(); }
              } catch {}
            }
          }
        }
      } catch {
        setTimeout(connectSSE, 5000);
      }
    }

    connectSSE();

    // Fallback polling — 30 saniye
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  return (
    <OrderContext.Provider value={{ pendingCount, callCount, unlockAudio }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  return useContext(OrderContext);
}