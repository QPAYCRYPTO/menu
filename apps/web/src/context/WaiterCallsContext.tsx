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
// - 'call_taken' event geldiğinde state'ten sil (başka garson ya da admin aldı)
// - Her canlı olayda liveVersion artar → açık garson ekranları (masalar, masa detayı) kendini yeniler
// - SSE koptuktan sonra yeniden bağlanınca, sekme/telefon öne gelince ve ağ geri gelince
//   çağrılar yeniden çekilir (kopukken kaçan olaylar telafi edilir); ayrıca 30 sn'de bir yedek yenileme
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
  /** Her canlı olayda / yeniden senkronda artar — ekranlar useLiveRefresh ile dinler */
  liveVersion: number;
};

const CALLS_FALLBACK_POLL_MS = 30_000;

const WaiterCallsContext = createContext<WaiterCallsContextValue | null>(null);

export function WaiterCallsProvider({ children }: { children: ReactNode }) {
  const { token, tabId, isAuthenticated } = useWaiterAuth();
  const [calls, setCalls] = useState<WaiterActiveCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveVersion, setLiveVersion] = useState(0);
  const bumpLive = useCallback(() => setLiveVersion(v => v + 1), []);
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

    // İlk açılış dışında her (yeniden) bağlanışta kopukken kaçan olayları telafi et
    let opened = false;
    es.onopen = () => {
      if (opened) {
        refresh();
        bumpLive();
      }
      opened = true;
    };

    es.addEventListener('order', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Her olay: açık ekranlar (masalar / masa detayı) yenilensin
        bumpLive();

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

        // Çağrı admin tarafından kapatıldı/iptal edildi
        if ((data.type === 'order_status' || data.type === 'order_cancelled') && data.order_id
            && data.order_type === 'call' && data.status !== 'pending') {
          setCalls(prev => prev.filter(c => c.id !== data.order_id));
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    });

    es.onerror = (err) => {
      console.warn('SSE bağlantı hatası, otomatik yeniden denenecek:', err);
    };

    // Telefon/sekme öne gelince veya ağ geri gelince senkronla
    let lastSync = 0;
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSync < 2000) return;
      lastSync = Date.now();
      refresh();
      bumpLive();
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);

    // Yedek: SSE sessizce kopuk kalırsa bile çağrı listesi en geç 30 sn'de güncellensin
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, CALLS_FALLBACK_POLL_MS);

    return () => {
      es.close();
      eventSourceRef.current = null;
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
      clearInterval(poll);
    };
  }, [token, tabId, isAuthenticated, refresh, bumpLive]);

  return (
    <WaiterCallsContext.Provider value={{ calls, refresh, takeCall, loading, liveVersion }}>
      {children}
    </WaiterCallsContext.Provider>
  );
}

export function useWaiterCalls() {
  const ctx = useContext(WaiterCallsContext);
  if (!ctx) throw new Error('useWaiterCalls must be used within WaiterCallsProvider');
  return ctx;
}

/**
 * Canlı olay geldiğinde (başka garson/admin bir şey değiştirdiğinde) ekranı yeniler.
 * Arka arkaya gelen olaylar tek yenilemeye birleştirilir (debounce).
 */
export function useLiveRefresh(onChange: () => void, debounceMs = 400) {
  const { liveVersion } = useWaiterCalls();
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const t = setTimeout(() => callbackRef.current(), debounceMs);
    return () => clearTimeout(t);
  }, [liveVersion, debounceMs]);
}

// Çağrı türü ikon/etiket/renk bilgisi: lib/callTypes.ts (getCallType) — tek kaynak