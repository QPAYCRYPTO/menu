// apps/web/src/context/WaiterCallsContext.tsx
// CHANGELOG v2 — Tab-bound session:
// - tabId useWaiterAuth'tan alınıyor
// - listActiveCalls(token, tabId)
// - takeCallApi(token, tabId, callId)
// - SSE URL'ine ?tab_id=X eklendi
//
// Garson çağrı yönetimi: SSE bağlantısı + ses + state
//
// Davranış:
// - Mount edilince /api/public/waiter/calls'tan aktif çağrıları çek
// - SSE'ye bağlan, yeni çağrı geldiğinde:
//   - State'e ekle
//   - Ses çal
// - 'call_taken' event geldiğinde state'ten sil (başka garson aldı)
// - takeCall(id) → POST /api/public/waiter/calls/:id/take

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWaiterAuth } from './WaiterAuthContext';
import { listActiveCalls, takeCall as takeCallApi, type WaiterActiveCall } from '../api/waiterPublicApi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

type WaiterCallsContextValue = {
  calls: WaiterActiveCall[];
  refresh: () => Promise<void>;
  takeCall: (callId: string) => Promise<{ ok: boolean; error?: string }>;
  loading: boolean;
};

const WaiterCallsContext = createContext<WaiterCallsContextValue | null>(null);

export function WaiterCallsProvider({ children }: { children: ReactNode }) {
  const { token, tabId, isAuthenticated } = useWaiterAuth();
  const [calls, setCalls] = useState<WaiterActiveCall[]>([]);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Ses oluştur (3 ton, çağrı için belirgin)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Basit beep — Web Audio API ile
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    function playCallSound() {
      try {
        const now = ctx.currentTime;
        // 3 ton ardarda
        [0, 0.15, 0.30].forEach((delay, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(idx === 1 ? 880 : 660, now + delay);
          gain.gain.setValueAtTime(0, now + delay);
          gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.01);
          gain.gain.linearRampToValueAtTime(0, now + delay + 0.12);
          osc.start(now + delay);
          osc.stop(now + delay + 0.13);
        });
      } catch {}
    }

    audioRef.current = { play: playCallSound } as any;
  }, []);

  // İlk yükleme
  const refresh = useCallback(async () => {
    if (!token || !tabId || !isAuthenticated) return;
    setLoading(true);
    try {
      const data = await listActiveCalls(token, tabId);
      setCalls(data);
    } catch (err) {
      console.error('listActiveCalls failed:', err);
    } finally {
      setLoading(false);
    }
  }, [token, tabId, isAuthenticated]);

  // Çağrıyı al
  const takeCall = useCallback(async (callId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!token || !tabId) return { ok: false, error: 'Token yok' };
    try {
      await takeCallApi(token, tabId, callId);
      // Optimistic: state'ten sil (SSE de gelecek ama bekleme)
      setCalls(prev => prev.filter(c => c.id !== callId));
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Çağrı alınamadı.';
      // Eğer 409 ise (başka garson almış) çağrıyı listeden sil
      if (msg.includes('başka bir garson')) {
        setCalls(prev => prev.filter(c => c.id !== callId));
      }
      return { ok: false, error: msg };
    }
  }, [token, tabId]);

  // SSE bağlantısı
  useEffect(() => {
    if (!token || !tabId || !isAuthenticated) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setCalls([]);
      return;
    }

    // İlk veriyi çek
    refresh();

    // SSE bağlan — token + tab_id query param ile
    const url = `${API_BASE_URL}/public/waiter/stream?token=${encodeURIComponent(token)}&tab_id=${encodeURIComponent(tabId)}`;
    const es = new EventSource(url, { withCredentials: false });
    eventSourceRef.current = es;

    es.addEventListener('order', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Yeni çağrı geldi
        if (data.type === 'call' && data.order) {
          const newCall: WaiterActiveCall = {
            id: data.order.id,
            table_id: data.order.table_id,
            table_name: data.order.table_name,
            note: data.order.note,
            call_type: data.order.call_type,
            created_at: data.order.created_at,
            status: 'pending'
          };
          setCalls(prev => {
            // Duplicate check
            if (prev.some(c => c.id === newCall.id)) return prev;
            return [...prev, newCall];
          });
          // Ses çal
          try { (audioRef.current as any)?.play?.(); } catch {}
        }

        // Çağrı alındı (kim aldıysa fark etmez, listeden sil)
        if (data.type === 'call_taken' && data.order_id) {
          setCalls(prev => prev.filter(c => c.id !== data.order_id));
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    });

    es.onerror = (err) => {
      console.warn('SSE bağlantı hatası, otomatik yeniden denenecek:', err);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [token, tabId, isAuthenticated, refresh]);

  return (
    <WaiterCallsContext.Provider value={{ calls, refresh, takeCall, loading }}>
      {children}
    </WaiterCallsContext.Provider>
  );
}

export function useWaiterCalls() {
  const ctx = useContext(WaiterCallsContext);
  if (!ctx) throw new Error('useWaiterCalls must be used within WaiterCallsProvider');
  return ctx;
}

// Helper: çağrı türü etiketleri
export const CALL_TYPE_INFO: Record<string, { emoji: string; label: string; critical: boolean }> = {
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

export function getCallInfo(call_type: string | null | undefined) {
  if (!call_type) return { emoji: '🔔', label: 'Garson Çağrısı', critical: false };
  return CALL_TYPE_INFO[call_type] || { emoji: '🔔', label: call_type, critical: false };
}