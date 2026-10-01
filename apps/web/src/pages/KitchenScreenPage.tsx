// apps/web/src/pages/KitchenScreenPage.tsx
// Mutfak ekranı — /mutfak?t=<token>. Şifre yok; link token'ı yetkidir.
// Akış: Bekliyor → "Hazırlanıyor" düğmesi → Hazırlanıyor → "Hazır" düğmesi (garsona canlı bildirim, kart ekrandan kalkar).
// Canlı akış (SSE) + yeni siparişte ses; bağlantı koparsa "Çevrimdışı" rozeti, dönünce yeniden yükler.
// Atölye tasarımı: gece/gündüz temasına uyar (bg-page / bg-surface / text-ink), başlıkta güneş/ay düğmesi.
// Durum rozetleri diğer ekranlarla aynı: Bekliyor amber (--state-warn), Hazırlanıyor mavi (--state-info).
// Değişiklik bildirimi (ekleme, adet, iptal, iptal talebi): kart yanıp söner, mutfak "Gördüm" deyince durur.
// İptal edilen sipariş de "Gördüm" denene kadar ekranda kalır (üstü çizili).
// Zil: tarayıcılar ekrana dokunulmadan ses çaldırmaz → zil kapalıyken ekranın üstünde büyük "dokun" şeridi;
// ses bağlamı askıya alınırsa (ekran arka plana geçti) çalmadan önce yeniden açılmaya çalışılır.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, BellOff, BellRing, Check, ChefHat, Clock, Eye, TriangleAlert, UtensilsCrossed, Volume2, WifiOff } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useThemedPage } from '../lib/theme';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

/** SSE sessizce kopuk kalsa bile liste en geç bu sürede tazelenir */
const FALLBACK_POLL_MS = 30_000;
const LATE_MINUTES = 10;

type KitchenItem = { id: string; product_name: string; quantity: number; note: string | null };
type NoticeTone = 'edit' | 'cancel' | 'request' | 'info';
type KitchenOrder = {
  id: string;
  order_no: number;
  table_name: string;
  status: 'pending' | 'preparing' | 'cancelled';
  note: string | null;
  created_at: string;
  items: KitchenItem[];
  /** Onay bekleyen personel talepleri (iptal / adet azaltma) */
  pending_changes?: Array<{
    kind: 'order_cancel' | 'item_decrease' | 'items_cancel';
    product_name: string | null;
    requested_quantity: number | null;
    items?: Array<{ product_name: string; quantity: number }> | null;
  }>;
  /** "Gördüm" denene kadar gösterilen değişiklikler */
  kitchen_notice?: Array<{ tone: NoticeTone; text: string; at: string }> | null;
};

// Bildirim tonu → renk: düzeltme amber, iptal kırmızı, talep turuncu-kırmızı, bilgi mavi
const NOTICE_COLOR: Record<NoticeTone, string> = {
  edit: 'var(--state-warn)',
  cancel: 'var(--state-danger)',
  request: 'var(--state-danger)',
  info: 'var(--state-info)'
};
function noticeColor(lines: Array<{ tone: NoticeTone }>): string {
  if (lines.some(l => l.tone === 'cancel')) return NOTICE_COLOR.cancel;
  if (lines.some(l => l.tone === 'request')) return NOTICE_COLOR.request;
  if (lines.some(l => l.tone === 'edit')) return NOTICE_COLOR.edit;
  return NOTICE_COLOR.info;
}

/** Siparişte değişiklik olduğunu bildiren olaylar (ayrı, alçak tonlu ses) */
const CHANGE_EVENTS = new Set(['order_items_added', 'order_items_updated', 'order_cancelled', 'change_request']);

type LoadResult = 'ok' | 'invalid' | 'offline';

// ── Ses (dosya gerektirmez; tarayıcı ilk dokunuştan sonra izin verir) ─────────
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}
/** Ses bağlamı askıdaysa (arka plan, kilit) yeniden açıp çalar; izin yoksa sessizce vazgeçer */
function withAudio(play: (ctx: AudioContext) => void) {
  const ctx = getAudio();
  if (!ctx) return;
  if (ctx.state === 'running') { play(ctx); return; }
  ctx.resume().then(() => { if (ctx.state === 'running') play(ctx); }).catch(() => {});
}

/** Yeni sipariş zili: iki kez çalan, belirgin üç notalı "ding-dong" */
function playNewOrderSound() {
  withAudio(ctx => {
    const notes = [988, 1319, 1568];
    for (let r = 0; r < 2; r++) {
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + r * 0.9 + i * 0.18;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    }
  });
}

function playChangeSound() {
  withAudio(ctx => [660, 520, 660].forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.16;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }));
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
        else if (CHANGE_EVENTS.has(data.type)) playChangeSound();
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
    if (!ctx) return;
    ctx.resume().then(() => {
      const on = ctx.state === 'running';
      setSoundOn(on);
      // Dokunuşla açıldığını duyur (kısa ses) — mutfak zilin çalıştığını bilsin
      if (on) playChangeSound();
    }).catch(() => {});
  }

  // Ses bağlamı durumunu izle: arka planda askıya alınırsa şerit yeniden görünür
  useEffect(() => {
    const ctx = getAudio();
    if (!ctx) return;
    const sync = () => setSoundOn(ctx.state === 'running');
    ctx.addEventListener('statechange', sync);
    const onVisible = () => { if (document.visibilityState === 'visible') ctx.resume().catch(() => {}); };
    document.addEventListener('visibilitychange', onVisible);
    sync();
    return () => {
      ctx.removeEventListener('statechange', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  /** Bekliyor → Hazırlanıyor (start) ya da Hazırlanıyor → Hazır (ready) */
  async function advance(order: KitchenOrder) {
    const action = order.status === 'pending' ? 'start' : 'ready';
    setBusyIds(prev => new Set(prev).add(order.id));
    // İyimser: "başla"da kart hemen maviye döner, "hazır"da kart hemen kalkar
    if (action === 'start') {
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'preparing' } : o)));
    } else {
      setOrders(prev => prev.filter(o => o.id !== order.id));
    }
    try {
      const res = await fetch(`${API_BASE_URL}/kitchen/orders/${order.id}/${action}?t=${encodeURIComponent(token)}`, { method: 'PATCH' });
      if (res.status === 401) {
        setState('invalid');
      } else if (!res.ok && res.status !== 409) {
        throw new Error(String(res.status));
      }
      // 409: başka ekrandan zaten ilerletilmiş → listeyi tazele
      if (res.status === 409) load();
    } catch {
      // Geri al: kartı eski haliyle geri koy
      setOrders(prev => [...prev.filter(o => o.id !== order.id), order].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ));
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

  /** "Gördüm": bildirimi kapat (iptal edilmiş kart ekrandan kalkar) */
  async function acknowledge(order: KitchenOrder) {
    setBusyIds(prev => new Set(prev).add(order.id));
    setOrders(prev => order.status === 'cancelled'
      ? prev.filter(o => o.id !== order.id)
      : prev.map(o => (o.id === order.id ? { ...o, kitchen_notice: null } : o)));
    try {
      const res = await fetch(`${API_BASE_URL}/kitchen/orders/${order.id}/ack?t=${encodeURIComponent(token)}`, { method: 'POST' });
      if (res.status === 401) setState('invalid');
      else if (!res.ok) throw new Error(String(res.status));
    } catch {
      setOrders(prev => [...prev.filter(o => o.id !== order.id), order].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ));
      setOffline(true);
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  }

  const activeCount = orders.filter(o => o.status !== 'cancelled').length;

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
          <span className="tabular-nums">{activeCount}</span>
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
                <span className="text-sm font-semibold opacity-80">
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

      {!soundOn && (
        <button onClick={enableSound}
          className="w-full px-4 py-4 bg-state-warn text-page text-xl font-black flex items-center justify-center gap-3 animate-pulse">
          <BellOff size={26} /> Zil kapalı — yeni siparişte ses için ekrana bir kez dokunun
        </button>
      )}

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
              const cancelled = order.status === 'cancelled';
              const late = !cancelled && mins >= LATE_MINUTES;
              const preparing = order.status === 'preparing';
              const notice = order.kitchen_notice ?? [];
              const blink = notice.length > 0 ? noticeColor(notice) : null;
              return (
                <article key={order.id}
                  className={`rounded-3xl border-2 bg-surface flex flex-col overflow-hidden shadow-[var(--shadow)] ${blink ? 'kitchen-blink' : ''}`}
                  // Sol şerit durumu gösterir (Bekliyor amber, Hazırlanıyor mavi, İptal kırmızı); geciken kartın çerçevesi kırmızı
                  style={{
                    borderColor: blink ?? (late ? 'var(--state-danger)' : 'var(--line)'),
                    borderLeft: `10px solid ${cancelled ? 'var(--state-danger)' : preparing ? 'var(--state-info)' : 'var(--state-warn)'}`,
                    ['--blink-color' as string]: blink ? `color-mix(in srgb, ${blink} 55%, transparent)` : undefined
                  }}>
                  <div className={`px-4 py-3 flex items-start justify-between gap-3 border-b border-line ${late ? 'bg-state-danger-bg' : 'bg-surface-2'}`}>
                    <div className="min-w-0">
                      <div className="font-serif text-4xl font-bold leading-none truncate">{order.table_name}</div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-ink-muted">#{order.order_no || '—'}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
                          cancelled ? 'bg-state-danger-bg text-state-danger'
                            : order.status === 'preparing' ? 'bg-state-info-bg text-state-info' : 'bg-state-warn-bg text-state-warn'}`}>
                          <span className="w-2 h-2 rounded-full bg-current" />
                          {cancelled ? 'İptal edildi' : order.status === 'preparing' ? 'Hazırlanıyor' : 'Bekliyor'}
                        </span>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xl font-black shrink-0 tabular-nums ${late ? 'text-state-danger' : ''}`}>
                      <Clock size={20} /> {mins === 0 ? 'şimdi' : `${mins} dk`}
                    </div>
                  </div>

                  {notice.length > 0 && (
                    <div className="mx-4 mt-4 rounded-2xl px-4 py-3" role="alert"
                      style={{ background: `color-mix(in srgb, ${blink} 14%, var(--surface))`, borderLeft: `6px solid ${blink}` }}>
                      <div className="text-xs font-black tracking-widest flex items-center gap-1.5" style={{ color: blink! }}>
                        <BellRing size={14} /> DEĞİŞİKLİK
                      </div>
                      {notice.map((n, i) => (
                        <div key={i} className="text-xl font-black leading-snug mt-0.5" style={{ color: NOTICE_COLOR[n.tone] }}>{n.text}</div>
                      ))}
                      <button onClick={() => acknowledge(order)} disabled={busyIds.has(order.id)}
                        className="mt-3 w-full h-14 rounded-2xl text-xl font-black flex items-center justify-center gap-2 disabled:opacity-50 spring-btn"
                        style={{ background: blink!, color: 'var(--bg)' }}>
                        <Eye size={24} /> Gördüm
                      </button>
                    </div>
                  )}

                  {order.pending_changes && order.pending_changes.length > 0 && (
                    <div className="mx-4 mt-4 rounded-2xl px-4 py-3 bg-state-danger-bg text-state-danger" style={{ borderLeft: '6px solid var(--state-danger)' }} role="alert">
                      <div className="text-xs font-black tracking-widest flex items-center gap-1.5"><TriangleAlert size={14} /> ONAY BEKLİYOR</div>
                      {order.pending_changes.map((c, i) => (
                        <div key={i} className="text-xl font-black leading-snug">
                          {c.kind === 'order_cancel' ? 'İade talebi var — bekletin'
                            : c.kind === 'items_cancel' ? `İptal talebi: ${(c.items ?? []).map(i => `${i.quantity}× ${i.product_name}`).join(', ')} — bekletin`
                            : `${c.product_name ?? 'Ürün'} → ${c.requested_quantity} adet talebi`}
                        </div>
                      ))}
                    </div>
                  )}

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
                          <span className={`text-3xl font-black tabular-nums min-w-[3rem] ${cancelled ? 'text-ink-muted line-through' : 'text-accent'}`}>{item.quantity}×</span>
                          <span className={`text-2xl font-bold leading-tight break-words ${cancelled ? 'text-ink-muted line-through' : ''}`}>{item.product_name}</span>
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
                    {cancelled ? null : preparing ? (
                      <button onClick={() => advance(order)} disabled={busyIds.has(order.id)}
                        className="w-full h-16 rounded-2xl bg-state-ok text-page hover:opacity-90 active:opacity-80 text-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50 spring-btn">
                        Hazır <Check size={30} strokeWidth={3} />
                      </button>
                    ) : (
                      <button onClick={() => advance(order)} disabled={busyIds.has(order.id)}
                        className="w-full h-16 rounded-2xl bg-state-warn text-page hover:opacity-90 active:opacity-80 text-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50 spring-btn">
                        Hazırlanıyor <ArrowRight size={30} strokeWidth={3} />
                      </button>
                    )}
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
