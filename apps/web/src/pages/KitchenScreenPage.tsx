// apps/web/src/pages/KitchenScreenPage.tsx
// Mutfak ekranı — /mutfak?t=<token>. Şifre yok; link token'ı yetkidir.
// Bekleyen + hazırlanan siparişleri gösterir, "Hazırlandı" ile garsona canlı bildirim gider.
// Canlı akış (SSE) + yeni siparişte ses; bağlantı koparsa "Çevrimdışı" rozeti, dönünce yeniden yükler.
// Atölye tasarımı: gece/gündüz temasına uyar (bg-page / bg-surface / text-ink), başlıkta güneş/ay düğmesi.
// Durum rozetleri diğer ekranlarla aynı: Bekliyor amber (--state-warn), Hazırlanıyor mavi (--state-info).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCheck, ChefHat, Clock, TriangleAlert, UtensilsCrossed, Volume2, WifiOff } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useThemedPage } from '../lib/theme';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

/** SSE sessizce kopuk kalsa bile liste en geç bu sürede tazelenir */
const FALLBACK_POLL_MS = 30_000;
const LATE_MINUTES = 10;

type KitchenItem = { id: string; product_name: string; quantity: number; note: string | null };
type KitchenOrder = {
  id: string;
  order_no: number;
  table_name: string;
  status: 'pending' | 'preparing';
  note: string | null;
  created_at: string;
  items: KitchenItem[];
};

type LoadResult = 'ok' | 'invalid' | 'offline';

// ── Ses (dosya gerektirmez; tarayıcı ilk dokunuştan sonra izin verir) ─────────
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}
function playNewOrderSound() {
  const ctx = getAudio();
  if (!ctx || ctx.state !== 'running') return;
  [880, 1320].forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.2;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function KitchenScreenPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('t') ?? '').trim();

  const [state, setState] = useState<'loading' | 'invalid' | 'ready'>(token ? 'loading' : 'invalid');
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [offline, setOffline] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [streamKey, setStreamKey] = useState(0);
  const reloadTimer = useRef<number | null>(null);
  useThemedPage();

  const load = useCallback(async (): Promise<LoadResult> => {
    if (!token) return 'invalid';
    try {
      const res = await fetch(`${API_BASE_URL}/kitchen/orders?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (res.status === 401) {
        setState('invalid');
        return 'invalid';
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { business_name: string; orders: KitchenOrder[] };
      setOrders(data.orders);
      setBusinessName(data.business_name);
      setState('ready');
      setOffline(false);
      setLastSync(Date.now());
      return 'ok';
    } catch {
      // Son durum ekranda kalır
      setOffline(true);
      return 'offline';
    }
  }, [token]);

  /** Arka arkaya gelen olayları tek yüklemeye topla */
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => { load(); }, 300);
  }, [load]);

  // İlk yükleme + yedek yenileme + saat
  useEffect(() => {
    load();
    const poll = window.setInterval(() => load(), FALLBACK_POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [load]);

  // Canlı akış (SSE)
  const invalid = state === 'invalid';
  useEffect(() => {
    if (!token || invalid) return;
    const es = new EventSource(`${API_BASE_URL}/kitchen/stream?t=${encodeURIComponent(token)}`);
    let hadError = false;

    es.onopen = () => {
      setOffline(false);
      if (hadError) {
        hadError = false;
        load(); // kopukken kaçanları telafi et
      }
    };
    es.onerror = () => {
      hadError = true;
      setOffline(true);
      // Sunucu reddettiyse (ör. link sıfırlandı) EventSource kapanır → linki yeniden kontrol et
      if (es.readyState === EventSource.CLOSED) load();
    };
    es.addEventListener('kitchen', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { type: string };
        if (data.type === 'new_order') playNewOrderSound();
      } catch {
        // yoksay
      }
      scheduleReload();
    });
    es.addEventListener('revoked', () => {
      es.close();
      setState('invalid');
    });

    return () => es.close();
  }, [token, invalid, streamKey, load, scheduleReload]);

  // Ağ geri gelince / ekran öne gelince yeniden bağlan ve yükle
  useEffect(() => {
    const goOnline = () => {
      load();
      setStreamKey(k => k + 1);
    };
    const goOffline = () => setOffline(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Ekran kararmasın (destekleyen cihazlarda)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = () => {
      if (document.visibilityState !== 'visible' || !nav.wakeLock) return;
      nav.wakeLock.request('screen').then(l => { lock = l; }).catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      lock?.release().catch(() => {});
    };
  }, []);

  function enableSound() {
    const ctx = getAudio();
    ctx?.resume().then(() => setSoundOn(ctx.state === 'running')).catch(() => {});
  }

  async function markReady(order: KitchenOrder) {
    setBusyIds(prev => new Set(prev).add(order.id));
    // İyimser: kart hemen kalkar
    setOrders(prev => prev.filter(o => o.id !== order.id));
    try {
      const res = await fetch(`${API_BASE_URL}/kitchen/orders/${order.id}/ready?t=${encodeURIComponent(token)}`, { method: 'PATCH' });
      if (res.status === 401) {
        setState('invalid');
      } else if (!res.ok && res.status !== 409) {
        throw new Error(String(res.status));
      }
      // 409: başka ekrandan zaten hazır yapılmış → listeyi tazele
      if (res.status === 409) load();
    } catch {
      setOrders(prev => (prev.some(o => o.id === order.id) ? prev : [...prev, order].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )));
      setOffline(true);
      setNotice(`${order.table_name} işaretlenemedi — bağlantı yok. Tekrar deneyin.`);
      window.setTimeout(() => setNotice(''), 5000);
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  }

  // ── Geçersiz link ─────────────────────────────────────────────────────────
  if (invalid) {
    return (
      <div className="fixed inset-0 bg-page text-ink flex items-center justify-center px-6">
        <div className="absolute top-4 right-4"><ThemeToggle large size={20} /></div>
        <div className="ui-card rounded-3xl max-w-md w-full text-center px-8 py-10">
          <div className="w-20 h-20 rounded-3xl bg-state-danger-bg flex items-center justify-center mx-auto mb-5">
            <TriangleAlert size={38} className="text-state-danger" />
          </div>
          <h1 className="font-serif text-3xl font-bold mb-3">Geçersiz link</h1>
          <p className="text-xl text-ink-muted">Geçersiz link, yöneticinizle iletişime geçin.</p>
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="fixed inset-0 bg-page text-ink flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-line border-t-[var(--accent)] animate-spin" />
      </div>
    );
  }

  // ── Mutfak görünümü ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 overflow-y-auto bg-page text-ink" onPointerDown={soundOn ? undefined : enableSound}>
      <header className="sticky top-0 z-20 bg-surface border-b border-line px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="w-12 h-12 rounded-2xl bg-brand text-on-brand flex items-center justify-center shrink-0">
          <ChefHat size={26} />
        </div>
        <div className="min-w-0">
          <div className="font-serif text-2xl font-bold leading-tight">Mutfak</div>
          <div className="ui-eyebrow truncate">{businessName}</div>
        </div>
        <div className="px-4 h-12 rounded-2xl bg-surface-2 border border-line flex items-center gap-2 text-xl font-black">
          <span className="tabular-nums">{orders.length}</span>
          <span className="text-base font-bold text-ink-muted">sipariş</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {!soundOn && (
            <button onClick={enableSound}
              className="btn-outline h-12 px-4 rounded-2xl text-base font-bold flex items-center gap-2">
              <Volume2 size={20} /> Sesi aç
            </button>
          )}
          {offline ? (
            <span className="h-12 px-4 rounded-2xl bg-state-danger text-page text-lg font-black flex items-center gap-2" role="status">
              <WifiOff size={22} /> Çevrimdışı
              {lastSync && (
                <span className="text-sm font-semibold text-red-100">
                  · son {new Date(lastSync).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </span>
          ) : (
            <span className="h-12 px-4 rounded-2xl bg-state-ok-bg text-state-ok text-base font-bold flex items-center gap-2" role="status">
              <span className="w-2.5 h-2.5 rounded-full bg-current" /> Canlı
            </span>
          )}
          <ThemeToggle large size={20} />
        </div>
      </header>

      {notice && (
        <div className="mx-4 mt-3 rounded-2xl bg-state-danger text-page px-4 py-3 text-lg font-bold" role="alert">{notice}</div>
      )}

      <main className="p-4">
        {orders.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-ink-muted">
            <UtensilsCrossed size={64} className="text-accent" />
            <p className="font-serif text-3xl font-bold mt-4 text-ink">Bekleyen sipariş yok</p>
            <p className="text-lg mt-1">Yeni sipariş gelince burada anında görünür.</p>
          </div>
        ) : (
          <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {orders.map(order => {
              const mins = minutesSince(order.created_at, now);
              const late = mins >= LATE_MINUTES;
              return (
                <article key={order.id}
                  className="rounded-3xl border-2 bg-surface flex flex-col overflow-hidden shadow-[var(--shadow)]"
                  style={{ borderColor: late ? 'var(--state-danger)' : order.status === 'preparing' ? 'var(--state-info)' : 'var(--line)' }}>
                  <div className={`px-4 py-3 flex items-start justify-between gap-3 border-b border-line ${late ? 'bg-state-danger-bg' : 'bg-surface-2'}`}>
                    <div className="min-w-0">
                      <div className="font-serif text-4xl font-bold leading-none truncate">{order.table_name}</div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-ink-muted">#{order.order_no || '—'}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
                          order.status === 'preparing' ? 'bg-state-info-bg text-state-info' : 'bg-state-warn-bg text-state-warn'}`}>
                          <span className="w-2 h-2 rounded-full bg-current" />
                          {order.status === 'preparing' ? 'Hazırlanıyor' : 'Bekliyor'}
                        </span>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xl font-black shrink-0 tabular-nums ${late ? 'text-state-danger' : ''}`}>
                      <Clock size={20} /> {mins === 0 ? 'şimdi' : `${mins} dk`}
                    </div>
                  </div>

                  {order.note && order.note.trim() && (
                    <div className="mx-4 mt-4 rounded-2xl text-ink px-4 py-3" style={{ background: 'var(--note-bg)', borderLeft: '6px solid var(--state-warn)' }}>
                      <div className="text-xs font-black tracking-widest text-ink opacity-70">NOT</div>
                      <div className="text-2xl font-black leading-snug break-words">{order.note}</div>
                    </div>
                  )}

                  <ul className="px-4 py-4 flex flex-col gap-3 flex-1">
                    {order.items.map(item => (
                      <li key={item.id}>
                        <div className="flex items-baseline gap-3">
                          <span className="text-3xl font-black text-accent tabular-nums min-w-[3rem]">{item.quantity}×</span>
                          <span className="text-2xl font-bold leading-tight break-words">{item.product_name}</span>
                        </div>
                        {item.note && item.note.trim() && (
                          <div className="mt-1.5 ml-[3.75rem] rounded-xl text-ink px-3 py-2 text-xl font-black break-words" style={{ background: 'var(--note-bg)', borderLeft: '5px solid var(--state-warn)' }}>
                            {item.note}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="p-3 pt-0">
                    <button onClick={() => markReady(order)} disabled={busyIds.has(order.id)}
                      className="w-full h-16 rounded-2xl bg-brand text-on-brand hover:opacity-90 active:opacity-80 text-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50 spring-btn">
                      <CheckCheck size={30} /> Hazırlandı
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
