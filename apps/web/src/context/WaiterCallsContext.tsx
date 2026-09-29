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
// - 'kitchen_order_ready' (mutfak "Hazırlandı" dedi) → yeşil "Masa X hazır" bildirimi + kısa ses

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWaiterAuth } from './WaiterAuthContext';
import { listActiveCalls, takeCall as takeCallApi, type WaiterActiveCall } from '../api/waiterPublicApi';
import { KitchenReadyToasts, type KitchenReadyToast } from '../components/KitchenReadyToasts';

/** Mutfaktan hazır bildirimi ekranda bu kadar kalır (dokununca hemen kapanır) */
const KITCHEN_READY_TOAST_MS = 10_000;

/** "2× Izgara Köfte, 1× Ayran" — uzun siparişlerde ilk 4 ürün + kalan sayısı */
function summarizeItems(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  const parts = items
    .filter((i): i is { product_name: string; quantity: number } => typeof i?.product_name === 'string')
    .map(i => `${i.quantity}× ${i.product_name}`);
  return parts.length > 4 ? `${parts.slice(0, 4).join(', ')} +${parts.length - 4} ürün` : parts.join(', ');
}

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
  const [readyToasts, setReadyToasts] = useState<KitchenReadyToast[]>([]);
  const dismissReadyToast = useCallback((id: string) => {
    setReadyToasts(prev => prev.filter(t => t.id !== id));
  }, []);
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

    // Mutfaktan hazır: çağrıdan ayırt edilsin diye tek, yumuşak ve tiz bir ton
    function playReadySound() {
      try {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.5);
      } catch {}
    }

    audioRef.current = { play: playCallSound, playReady: playReadySound } as any;
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

        // Mutfak "Hazırlandı" dedi → bildirim + ses
        if (data.type === 'kitchen_order_ready' && data.order_id) {
          const summary = summarizeItems(data.items);
          const toast: KitchenReadyToast = {
            id: `${data.order_id}-${Date.now()}`,
            text: `🍽️ ${data.table_name || 'Masa'} hazır${summary ? ` — ${summary}` : ''}`
          };
          setReadyToasts(prev => [...prev.slice(-2), toast]);
          window.setTimeout(() => dismissReadyToast(toast.id), KITCHEN_READY_TOAST_MS);
          try { (audioRef.current as any)?.playReady?.(); } catch {}
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
  }, [token, tabId, isAuthenticated, refresh, bumpLive, dismissReadyToast]);

  return (
    <WaiterCallsContext.Provider value={{ calls, refresh, takeCall, loading, liveVersion }}>
      {children}
      {isAuthenticated && <KitchenReadyToasts toasts={readyToasts} onDismiss={dismissReadyToast} />}
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