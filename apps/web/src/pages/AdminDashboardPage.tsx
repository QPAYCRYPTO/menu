// apps/web/src/pages/AdminDashboardPage.tsx
// Panel — "Bugünkü servis" (Atölye referans tasarımı)
// - Üstte ölçüm kartları: Açık masa · Aktif sipariş · Geciken · Bekleyen çağrı
// - Aktif siparişler listesi: Masa · Durum · Süre (verildiği andan beri, canlı) · Detay
//   Süre, Ayarlar → Servis → "Ortalama teslim süresi"ni aşarsa satır "Gecikiyor" olur (kırmızımsı ton).
// - Sağda "Dikkat gerektirenler" (geciken, çağrı, başlatılmayan, mola süresi aşan, vardiyası biten…)
//   ve "Hareketler" (personel mola çıkış/dönüşleri, canlı)
// - Altta sabit kısayol çubuğu: serviste/molada personel sayısı + Ürün/Masa/Personel ekle, Menüyü aç
// Veri: siparişler OrderContext'ten canlı (SSE); açık masalar /admin/sessions'tan (sipariş değişince + 30 sn'de bir);
// personel /admin/waiters/overview'dan (mola olayı gelince + 30 sn'de bir; personel modülü açıksa).
// Alt çubuk `fixed`: admin düzeninde sayfa belgeyle kaydığı için sticky çalışmaz; yatayda sayfa kutusuna hizalanır.

import type { BusinessSettingsResponse } from '@menu/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Armchair, ArrowRight, Bell, ChevronRight, CircleAlert, ClipboardList, Clock, Coffee, ExternalLink, Hourglass, LogIn, LogOut,
  PackageX, Play, Plus, TriangleAlert, UserPlus, UtensilsCrossed, X
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrders, type Order } from '../context/OrderContext';
import { orderStatusStyle } from '../lib/orderStatus';
import { useChangeRequests } from '../lib/changeRequests';
import { ChangeRequestItem } from '../components/ChangeRequestItem';

const DEFAULT_LATE_MINUTES = 15;
const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://www.atlasqrmenu.com';
/** Vardiyası bu kadar dakikadan az kalan personel dikkat listesine düşer */
const SHIFT_ENDING_MINUTES = 15;
/** Bu kadar dakikadır "Bekliyor"da duran (mutfağın başlamadığı) sipariş dikkat listesine düşer */
const UNSTARTED_MINUTES = 5;

type SessionRow = { id: string; table_id: string; status: 'open' | 'merged' };
type ProductRow = { id: string; is_active: boolean };
type StaffMember = {
  id: string; name: string; title: string | null;
  on_break: boolean; break_started_at: string | null; break_ends_at: string | null;
  shift_ends_at: string | null;
};
type StaffActivity = {
  id: string; waiter_name: string; action: 'break_start' | 'break_end' | 'shift_start' | 'shift_end';
  metadata: { minutes?: number; duration_min?: number; overdue_min?: number };
  created_at: string;
};

function ago(iso: string, now: number): string {
  const m = minutesSince(iso, now);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

function formatElapsed(mins: number): string {
  if (mins < 1) return '<1 dk';
  if (mins < 60) return `${mins} dk`;
  return `${Math.floor(mins / 60)} sa ${mins % 60} dk`;
}

function priceText(int: number): string {
  return `${(int / 100).toFixed(2)} TL`;
}

/** Siparişin panelde görünen durumu: süre eşiği aşıldıysa "Gecikiyor", değilse normal durum */
function displayStatus(order: Order, late: boolean): { label: string; badge: string } {
  if (late) return { label: 'Gecikiyor', badge: 'bg-state-danger-bg text-state-danger' };
  if (order.status === 'ready') return { label: 'Servise hazır', badge: orderStatusStyle('ready').badge };
  const s = orderStatusStyle(order.status);
  return { label: s.label, badge: s.badge };
}

export function AdminDashboardPage() {
  const { accessToken } = useAuth();
  const { activeOrders, callCount } = useOrders();
  const [lateAfter, setLateAfter] = useState(DEFAULT_LATE_MINUTES);
  const [openTables, setOpenTables] = useState<number | null>(null);
  const [inactiveProducts, setInactiveProducts] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [detail, setDetail] = useState<Order | null>(null);
  const [slug, setSlug] = useState('');
  const [staffEnabled, setStaffEnabled] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [activity, setActivity] = useState<StaffActivity[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [barBox, setBarBox] = useState<{ left: number; width: number } | null>(null);
  // Yetkisiz personelin iptal / adet azaltma talepleri — Panel'den onaylanır
  const { requests, decide, busyId } = useChangeRequests();
  const [decisionNote, setDecisionNote] = useState('');
  async function decideFromPanel(id: string, d: 'approve' | 'reject') {
    try { setDecisionNote(await decide(id, d)); }
    catch (e) { setDecisionNote(e instanceof Error ? e.message : 'İşlem başarısız.'); }
    window.setTimeout(() => setDecisionNote(''), 4000);
  }

  // Süreler canlı akar
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // İşletme eşiği + satışa kapalı ürünler (bir kez)
  useEffect(() => {
    if (!accessToken) return;
    apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken })
      .then(b => {
        setLateAfter(b.late_after_minutes ?? DEFAULT_LATE_MINUTES);
        setSlug(b.slug);
        setStaffEnabled(b.waiter_module_enabled === true);
      })
      .catch(() => {});
    apiRequest<ProductRow[]>('/admin/products?page=1&page_size=100', { token: accessToken })
      .then(list => setInactiveProducts(list.filter(p => p.is_active === false).length))
      .catch(() => {});
  }, [accessToken]);

  const orders = useMemo(
    () => activeOrders
      .filter(o => o.type === 'order' && (o.status === 'pending' || o.status === 'preparing' || o.status === 'ready'))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [activeOrders]
  );
  const orderKey = orders.map(o => `${o.id}:${o.status}`).join(',');

  // Açık masalar: sipariş listesi değişince ve 30 sn'de bir tazelenir
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const load = () => apiRequest<SessionRow[]>('/admin/sessions', { token: accessToken })
      .then(rows => { if (!cancelled) setOpenTables(new Set(rows.map(r => r.table_id)).size); })
      .catch(() => {});
    load();
    const t = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [accessToken, orderKey]);

  // Personel: mola olayı gelince (SSE) ve 30 sn'de bir tazelenir
  useEffect(() => {
    if (!accessToken || !staffEnabled) return;
    let cancelled = false;
    const load = () => apiRequest<{ staff: StaffMember[]; activity: StaffActivity[] }>('/admin/waiters/overview', { token: accessToken })
      .then(d => { if (!cancelled) { setStaff(d.staff); setActivity(d.activity); } })
      .catch(() => {});
    load();
    const t = window.setInterval(load, 30_000);
    window.addEventListener('atlasqr:staff-update', load);
    return () => { cancelled = true; window.clearInterval(t); window.removeEventListener('atlasqr:staff-update', load); };
  }, [accessToken, staffEnabled]);

  // Alt çubuğu sayfa kutusuyla hizala
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBarBox(prev => (prev && prev.left === r.left && prev.width === r.width ? prev : { left: r.left, width: r.width }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // Yalnızca vardiyadaki (giriş yapmış) personel sayılır; oturumu biten birinin eski mola kaydı sayılmaz
  const onShift = staff.filter(s => s.shift_ends_at && !s.on_break);
  const onBreak = staff.filter(s => s.shift_ends_at && s.on_break);
  const breakOverdue = onBreak.filter(s => s.break_ends_at && new Date(s.break_ends_at).getTime() < now);
  const shiftEnding = staff.filter(s => s.shift_ends_at
    && new Date(s.shift_ends_at).getTime() - now < SHIFT_ENDING_MINUTES * 60_000);

  const lateOrders = orders.filter(o => minutesSince(o.created_at, now) >= lateAfter);
  const unstarted = orders.filter(o => o.status === 'pending' && minutesSince(o.created_at, now) >= UNSTARTED_MINUTES);

  const metrics = [
    { label: 'Açık masa', value: openTables ?? '—', icon: Armchair },
    { label: 'Aktif sipariş', value: orders.length, icon: ClipboardList },
    { label: 'Geciken', value: lateOrders.length, icon: Clock, danger: lateOrders.length > 0 },
    { label: 'Bekleyen çağrı', value: callCount, icon: Bell, warn: callCount > 0 }
  ];

  const attention = [
    { count: requests.length, title: 'Onay bekleyen talep', desc: 'Personelin iade (mutfak başladıktan sonra iptal/azaltma) istekleri',
      icon: TriangleAlert, to: '/admin/orders', tone: 'danger' as const },
    { count: lateOrders.length, title: 'Geciken sipariş', desc: `${lateAfter} dakikayı aşan siparişler`, icon: Clock, to: '/admin/orders', tone: 'danger' as const },
    { count: callCount, title: 'Bekleyen çağrı', desc: 'Garson / hesap çağrıları', icon: Bell, to: '/admin/orders', tone: 'warn' as const },
    { count: unstarted.length, title: 'Başlatılmayan sipariş', desc: `${UNSTARTED_MINUTES} dakikadır "Bekliyor"da`, icon: CircleAlert, to: '/admin/orders', tone: 'warn' as const },
    ...(staffEnabled ? [
      { count: breakOverdue.length, title: 'Mola süresi aşıldı',
        desc: breakOverdue.length ? breakOverdue.map(s => s.name).join(', ') : 'Moladan dönmeyen personel',
        icon: Coffee, to: '/admin/waiters', tone: 'danger' as const },
      { count: shiftEnding.length, title: 'Vardiyası bitiyor',
        desc: shiftEnding.length ? shiftEnding.map(s => s.name).join(', ') : `${SHIFT_ENDING_MINUTES} dk içinde biten vardiya`,
        icon: Hourglass, to: '/admin/waiters', tone: 'warn' as const }
    ] : []),
    { count: inactiveProducts ?? 0, title: 'Satışa kapalı ürün', desc: 'Menüde gizli ürünler', icon: PackageX, to: '/admin/products', tone: 'muted' as const }
  ];

  // Sağ sütun yalnızca bir şey varken yer kaplar: sıfır olan maddeler gizlenir; hiçbir şey yoksa
  // sağ sütun hiç çizilmez ve siparişler tam genişliğe yayılır.
  const activeAttention = attention.filter(a => a.count > 0);
  const showActivity = staffEnabled && activity.length > 0;
  const hasSideContent = requests.length > 0 || activeAttention.length > 0 || showActivity;

  const shortcuts = [
    { label: 'Ürün ekle', to: '/admin/products?yeni=1', icon: Plus },
    { label: 'Masa ekle', to: '/admin/tables?yeni=1', icon: Armchair },
    ...(staffEnabled ? [{ label: 'Personel ekle', to: '/admin/waiters?yeni=1', icon: UserPlus }] : [])
  ];

  return (
    <div ref={rootRef} className="text-ink pb-28">
      <h1 className="font-serif font-bold text-3xl md:text-4xl mb-5">Bugünkü servis</h1>

      <div className={`grid gap-5 items-start ${hasSideContent ? 'xl:grid-cols-[1fr_320px]' : ''}`}>
        <div className="min-w-0 space-y-5">
          {/* Ölçüm kartları */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.map(m => (
              <div key={m.label} className="ui-card rounded-3xl p-4 md:p-5 flex items-center gap-3 md:gap-4">
                <span className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                  <m.icon size={24} strokeWidth={1.5} aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-xs md:text-sm text-ink-muted leading-tight">{m.label}</div>
                  <div className={`font-serif font-bold text-3xl md:text-4xl leading-tight tabular-nums ${
                    m.danger ? 'text-state-danger' : m.warn ? 'text-state-warn' : ''}`}>{m.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Aktif siparişler */}
          <section className="ui-card rounded-3xl p-4 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-serif font-bold text-2xl">Aktif siparişler</h2>
              <Link to="/admin/orders" className="text-sm font-semibold text-ink-muted hover:text-ink inline-flex items-center gap-1.5 no-underline">
                <span className="hidden sm:inline">Tüm siparişleri gör</span><span className="sm:hidden">Tümü</span> <ArrowRight size={15} strokeWidth={1.75} />
              </Link>
            </div>

            {orders.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-ink-muted">
                <UtensilsCrossed size={40} strokeWidth={1.5} className="text-accent" />
                <p className="font-serif text-xl font-bold text-ink mt-3">Şu an aktif sipariş yok</p>
                <p className="text-sm mt-1">Yeni sipariş gelince burada anında görünür.</p>
              </div>
            ) : (
              <div className="-mx-4 md:mx-0 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-2 text-ink-muted text-[11px] font-bold uppercase tracking-[0.12em]">
                      <th className="text-left font-bold px-3 md:px-4 py-3 md:rounded-l-xl">Masa</th>
                      <th className="text-left font-bold px-3 md:px-4 py-3">Durum</th>
                      <th className="text-left font-bold px-3 md:px-4 py-3">Süre</th>
                      <th className="text-right font-bold px-3 md:px-4 py-3 md:rounded-r-xl">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => {
                      const mins = minutesSince(o.created_at, now);
                      const late = mins >= lateAfter;
                      const st = displayStatus(o, late);
                      return (
                        <tr key={o.id} className="border-b border-line last:border-b-0"
                          style={late ? { background: 'color-mix(in srgb, var(--state-danger-bg) 70%, transparent)' } : undefined}>
                          <td className="px-3 md:px-4 py-3.5 font-semibold text-[15px] whitespace-nowrap">{o.table_name}</td>
                          <td className="px-3 md:px-4 py-3.5">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${st.badge}`}>{st.label}</span>
                          </td>
                          <td className={`px-3 md:px-4 py-3.5 tabular-nums whitespace-nowrap ${late ? 'text-state-danger font-bold' : ''}`}>{formatElapsed(mins)}</td>
                          <td className="px-3 md:px-4 py-3.5 text-right">
                            <button onClick={() => setDetail(o)}
                              className="btn-outline px-3 md:px-4 py-1.5 rounded-xl text-sm font-semibold spring-btn">Detay</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {hasSideContent && (
        <div className="space-y-5 min-w-0">
        {/* Onay bekleyenler — personelin iptal / adet azaltma talepleri (yalnızca varken) */}
        {requests.length > 0 && (
          <aside className="ui-card rounded-3xl p-4 md:p-6" style={{ borderColor: 'var(--state-danger)' }}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-serif font-bold text-2xl">Onay bekleyenler</h2>
              <span className="min-w-6 h-6 px-2 rounded-full bg-state-danger text-page text-xs font-extrabold flex items-center justify-center">
                {requests.length}
              </span>
            </div>
            <ul className="space-y-4">
              {requests.map(r => (
                <li key={r.id} className="pb-4 border-b border-line last:border-b-0 last:pb-0">
                  <ChangeRequestItem request={r} busy={busyId === r.id} onDecide={d => decideFromPanel(r.id, d)} />
                </li>
              ))}
            </ul>
            {decisionNote && <p className="text-xs font-semibold text-ink-muted mt-3">{decisionNote}</p>}
          </aside>
        )}

        {/* Dikkat gerektirenler — yalnızca sayısı olan maddeler */}
        {activeAttention.length > 0 && (
        <aside className="ui-card rounded-3xl p-4 md:p-6 fade-enter">
          <h2 className="font-serif font-bold text-2xl mb-2">Dikkat gerektirenler</h2>
          <div>
            {activeAttention.map(a => {
              const tone = a.tone === 'danger' ? 'text-state-danger' : a.tone === 'warn' ? 'text-state-warn' : 'text-accent';
              return (
                <Link key={a.title} to={a.to}
                  className="no-underline text-ink flex items-center gap-3 py-3.5 border-b border-line last:border-b-0 group">
                  <span className="w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                    <a.icon size={20} strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className={`font-serif font-bold text-2xl w-7 text-center tabular-nums ${tone}`}>{a.count}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif font-semibold text-[15px] leading-tight">{a.title}</span>
                    <span className="block text-xs text-ink-muted truncate">{a.desc}</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.5} className="text-ink-muted group-hover:text-ink shrink-0" aria-hidden />
                </Link>
              );
            })}
          </div>
        </aside>
        )}

        {/* Hareketler — personel giriş/çıkış ve molaları (canlı; yalnızca hareket varken) */}
        {showActivity && (
          <aside className="ui-card rounded-3xl p-4 md:p-6 fade-enter">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="font-serif font-bold text-2xl">Hareketler</h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-state-ok">
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" /> Canlı
              </span>
            </div>
            {(
              <ul className="max-h-80 overflow-y-auto -mr-2 pr-2">
                {activity.map(a => {
                  const isBreakEnd = a.action === 'break_end';
                  const overdue = isBreakEnd && (a.metadata.overdue_min ?? 0) > 0;
                  const look = {
                    break_start: { icon: Coffee, cls: 'bg-state-warn-bg text-state-warn', text: `molaya çıktı${a.metadata.minutes ? ` (${a.metadata.minutes} dk)` : ''}` },
                    break_end: { icon: Play, cls: 'bg-state-ok-bg text-state-ok', text: 'moladan döndü' },
                    shift_start: { icon: LogIn, cls: 'bg-state-ok-bg text-state-ok', text: 'servise girdi' },
                    shift_end: { icon: LogOut, cls: 'bg-surface-2 text-ink-muted', text: 'çıkış yaptı' }
                  }[a.action];
                  return (
                    <li key={a.id} className="flex items-start gap-3 py-3 border-b border-line last:border-b-0">
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${look.cls}`}>
                        <look.icon size={16} strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">
                          <strong className="font-semibold">{a.waiter_name}</strong> {look.text}
                        </p>
                        <p className={`text-xs mt-0.5 ${overdue ? 'text-state-danger font-semibold' : 'text-ink-muted'}`}>
                          {ago(a.created_at, now)}
                          {isBreakEnd && a.metadata.duration_min !== undefined && ` · ${a.metadata.duration_min} dk sürdü`}
                          {overdue && ` · ${a.metadata.overdue_min} dk gecikti`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        )}
        </div>
        )}
      </div>

      {/* Alt kısayol çubuğu */}
      <div className="fixed bottom-0 z-30 pb-3 pt-4 bg-gradient-to-t from-[var(--bg)] from-60% to-transparent"
        style={barBox ? { left: barBox.left, width: barBox.width } : { left: 0, right: 0 }}>
        <div className="bg-brand text-on-brand rounded-2xl px-3 md:px-5 py-2.5 flex items-center gap-2 md:gap-4 shadow-[var(--shadow)]">
          {staffEnabled && (
            <Link to="/admin/waiters" className="no-underline text-on-brand flex items-center gap-2.5 min-w-0 pr-2 md:pr-4 md:border-r border-[color-mix(in_srgb,var(--on-brand)_25%,transparent)]"
              title="Serviste / molada personel">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7cc896] shrink-0 shadow-[0_0_0_3px_color-mix(in_srgb,#7cc896_30%,transparent)]" aria-hidden />
              <span className="font-serif text-[15px] md:text-base whitespace-nowrap">
                <strong className="tabular-nums">{onShift.length}</strong> serviste
              </span>
              {onBreak.length > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs opacity-80 whitespace-nowrap">
                  <Coffee size={13} /> {onBreak.length} molada
                </span>
              )}
            </Link>
          )}
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            {shortcuts.map(s => (
              <Link key={s.label} to={s.to} title={s.label}
                className="no-underline text-on-brand inline-flex items-center gap-2 px-2.5 md:px-3.5 py-2 rounded-xl hover:bg-[color-mix(in_srgb,var(--on-brand)_14%,transparent)] transition-colors">
                <s.icon size={19} strokeWidth={1.5} aria-hidden />
                <span className="hidden md:inline font-serif text-[15px] whitespace-nowrap">{s.label}</span>
              </Link>
            ))}
            {slug && (
              <a href={`${PUBLIC_BASE_URL}/m/${slug}`} target="_blank" rel="noopener noreferrer" title="Menüyü aç"
                className="no-underline text-on-brand inline-flex items-center gap-2 px-2.5 md:px-3.5 py-2 rounded-xl hover:bg-[color-mix(in_srgb,var(--on-brand)_14%,transparent)] transition-colors">
                <ExternalLink size={19} strokeWidth={1.5} aria-hidden />
                <span className="hidden md:inline font-serif text-[15px] whitespace-nowrap">Menüyü aç</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {detail && <OrderDetailModal order={detail} now={now} lateAfter={lateAfter} onClose={() => setDetail(null)} />}
    </div>
  );
}

function OrderDetailModal({ order, now, lateAfter, onClose }: { order: Order; now: number; lateAfter: number; onClose: () => void }) {
  const mins = minutesSince(order.created_at, now);
  const late = mins >= lateAfter;
  const st = displayStatus(order, late);
  const total = order.items.reduce((sum, i) => sum + i.quantity * i.price_int, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`${order.table_name} sipariş detayı`}>
      <div className="absolute inset-0 ui-scrim fade-enter" onClick={onClose} />
      <div className="relative ui-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 md:p-6 sheet-enter max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="font-serif font-bold text-2xl">{order.table_name}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${st.badge}`}>{st.label}</span>
              <span className={`text-sm tabular-nums ${late ? 'text-state-danger font-bold' : 'text-ink-muted'}`}>
                {new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {formatElapsed(mins)} önce
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="ui-chip w-9 h-9 rounded-full flex items-center justify-center spring-btn shrink-0">
            <X size={16} />
          </button>
        </div>

        <ul className="divide-y divide-[var(--line)] border-y border-line">
          {order.items.map(item => (
            <li key={item.id} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className="font-serif font-bold text-lg text-accent tabular-nums min-w-[2.25rem]">{item.quantity}×</span>
                <span className="flex-1 font-semibold">{item.product_name}</span>
                <span className="text-sm text-ink-muted tabular-nums">{priceText(item.quantity * item.price_int)}</span>
              </div>
              {item.note && item.note.trim() && (
                <p className="ml-[3rem] mt-1 text-xs font-semibold text-state-warn">Not: {item.note}</p>
              )}
            </li>
          ))}
        </ul>

        {order.note && order.note.trim() && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-state-warn-bg text-state-warn">
            <TriangleAlert size={15} className="shrink-0 mt-0.5" /> {order.note}
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-ink-muted">Toplam</span>
          <span className="font-serif font-bold text-xl">{priceText(total)}</span>
        </div>

        <Link to="/admin/orders" onClick={onClose}
          className="btn-primary mt-5 w-full py-3 rounded-full text-sm font-bold inline-flex items-center justify-center gap-2 no-underline spring-btn">
          Siparişlerde aç <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
