// apps/web/src/pages/AdminDashboardPage.tsx
// Panel — "Bugünkü servis" (Atölye referans tasarımı)
// - Üstte ölçüm kartları: Açık masa · Aktif sipariş · Geciken · Bekleyen çağrı
// - Aktif siparişler listesi: Masa · Durum · Süre (verildiği andan beri, canlı) · Detay
//   Süre, Ayarlar → Servis → "Ortalama teslim süresi"ni aşarsa satır "Gecikiyor" olur (kırmızımsı ton).
// - Sağda "Dikkat gerektirenler" (Aşama 3'te personel hareketleriyle genişleyecek)
// Veri: siparişler OrderContext'ten canlı (SSE); açık masalar /admin/sessions'tan (sipariş değişince + 30 sn'de bir).

import type { BusinessSettingsResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Armchair, ArrowRight, Bell, ChevronRight, CircleAlert, ClipboardList, Clock, PackageX, TriangleAlert, UtensilsCrossed, X
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrders, type Order } from '../context/OrderContext';
import { orderStatusStyle } from '../lib/orderStatus';

const DEFAULT_LATE_MINUTES = 15;
/** Bu kadar dakikadır "Bekliyor"da duran (mutfağın başlamadığı) sipariş dikkat listesine düşer */
const UNSTARTED_MINUTES = 5;

type SessionRow = { id: string; table_id: string; status: 'open' | 'merged' };
type ProductRow = { id: string; is_active: boolean };

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

  // Süreler canlı akar
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // İşletme eşiği + satışa kapalı ürünler (bir kez)
  useEffect(() => {
    if (!accessToken) return;
    apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken })
      .then(b => setLateAfter(b.late_after_minutes ?? DEFAULT_LATE_MINUTES))
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

  const lateOrders = orders.filter(o => minutesSince(o.created_at, now) >= lateAfter);
  const unstarted = orders.filter(o => o.status === 'pending' && minutesSince(o.created_at, now) >= UNSTARTED_MINUTES);

  const metrics = [
    { label: 'Açık masa', value: openTables ?? '—', icon: Armchair },
    { label: 'Aktif sipariş', value: orders.length, icon: ClipboardList },
    { label: 'Geciken', value: lateOrders.length, icon: Clock, danger: lateOrders.length > 0 },
    { label: 'Bekleyen çağrı', value: callCount, icon: Bell, warn: callCount > 0 }
  ];

  const attention = [
    { count: lateOrders.length, title: 'Geciken sipariş', desc: `${lateAfter} dakikayı aşan siparişler`, icon: Clock, to: '/admin/orders', tone: 'danger' as const },
    { count: callCount, title: 'Bekleyen çağrı', desc: 'Garson / hesap çağrıları', icon: Bell, to: '/admin/orders', tone: 'warn' as const },
    { count: unstarted.length, title: 'Başlatılmayan sipariş', desc: `${UNSTARTED_MINUTES} dakikadır "Bekliyor"da`, icon: CircleAlert, to: '/admin/orders', tone: 'warn' as const },
    { count: inactiveProducts ?? 0, title: 'Satışa kapalı ürün', desc: 'Menüde gizli ürünler', icon: PackageX, to: '/admin/products', tone: 'muted' as const }
  ];

  return (
    <div className="text-ink">
      <h1 className="font-serif font-bold text-3xl md:text-4xl mb-5">Bugünkü servis</h1>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px] items-start">
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

        {/* Dikkat gerektirenler */}
        <aside className="ui-card rounded-3xl p-4 md:p-6">
          <h2 className="font-serif font-bold text-2xl mb-2">Dikkat gerektirenler</h2>
          <div>
            {attention.map(a => {
              const active = a.count > 0;
              const tone = !active ? 'text-ink-muted' : a.tone === 'danger' ? 'text-state-danger' : a.tone === 'warn' ? 'text-state-warn' : 'text-accent';
              return (
                <Link key={a.title} to={a.to}
                  className={`no-underline text-ink flex items-center gap-3 py-3.5 border-b border-line last:border-b-0 group ${active ? '' : 'opacity-60'}`}>
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
