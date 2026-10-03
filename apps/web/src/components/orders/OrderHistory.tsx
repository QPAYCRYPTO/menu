// apps/web/src/components/orders/OrderHistory.tsx
// Siparişler → Geçmiş (MASA BAZLI): bir satır = hesabı kapatılmış bir masa; o masada farklı zamanlarda
// verilen bütün siparişler tek satırda toplanır. No = günün kaçıncı kapanan hesabı, saat = kapanış,
// tutar = net (brüt − indirim − ikram). Satıra basınca detay: yenilen/içilenler, hesap, ödemeler,
// iptal/iade ve sipariş akışı. Excel: masa bazlı ya da ürün bazlı.
// Veri: GET /admin/orders/history, GET /admin/orders/history/sessions/:id. Garson çağrıları yer almaz.

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Download, FileSpreadsheet, LoaderCircle, Search, X
} from 'lucide-react';
import { apiRequest, authFetch } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { orderStatusStyle } from '../../lib/orderStatus';
import { CancelledItems, type CancellationEntry } from './CancelledItems';
import { Select } from '../Select';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';
const PAGE_SIZE = 25;

type HistoryStatus = 'all' | 'cancelled' | 'refunded' | 'discounted';
type Preset = 'today' | 'yesterday' | '7d' | 'month' | 'custom';
type Method = 'cash' | 'card' | 'meal_card';

/** Bir satır = hesabı kapatılmış bir masa oturumu (o masadaki bütün siparişler) */
type HistoryRow = {
  id: string;
  no: number;
  table_name: string;
  opened_at: string;
  closed_at: string;
  auto_closed: boolean;
  closed_by_email: string | null;
  order_count: number;
  item_count: number;
  gross_int: number;
  discount_int: number;
  complimentary_int: number;
  net_int: number;
  paid_int: number;
  cash_int: number;
  card_int: number;
  meal_card_int: number;
  cancel_count: number;
  cancelled_int: number;
  refund_count: number;
  refund_int: number;
  staff: string[];
  items: Array<{ product_name: string; price_int: number; quantity: number }>;
};

type HistoryOrder = {
  id: string;
  status: string;
  is_refund: boolean;
  note: string | null;
  waiter_name: string | null;
  created_at: string;
  preparing_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by_email: string | null;
  refund_requested_by: string | null;
  total_int: number;
  items: Array<{ product_name: string; quantity: number; price_int: number; note: string | null }>;
  cancellations: CancellationEntry[];
};

type SessionDetail = {
  orders: HistoryOrder[];
  payments: Array<{
    id: string; amount_int: number; method: Method; note: string | null; created_at: string;
    voided_at: string | null; void_reason: string | null; collected_by_email: string | null; voided_by_email: string | null;
  }>;
  discounts: Array<{
    id: string; type: 'discount' | 'complimentary'; amount_int: number; percent: number | null; applies_to: 'session' | 'item';
    note: string | null; created_at: string; voided_at: string | null; product_name: string | null; created_by_email: string | null;
  }>;
};

type HistoryResponse = {
  rows: HistoryRow[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    count: number; gross_int: number; discount_int: number; complimentary_int: number; net_int: number; paid_int: number;
    cancel_count: number; cancelled_int: number; refund_count: number; refund_int: number; avg_stay_min: number | null;
  };
  options: { tables: { id: string; name: string }[]; waiters: { id: string; name: string }[] };
};

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'yesterday', label: 'Dün' },
  { key: '7d', label: 'Son 7 gün' },
  { key: 'month', label: 'Bu ay' },
  { key: 'custom', label: 'Özel' }
];

const STATUS_OPTIONS: { key: HistoryStatus; label: string }[] = [
  { key: 'all', label: 'Tüm hesaplar' },
  { key: 'cancelled', label: 'İptal olanlar' },
  { key: 'refunded', label: 'İade olanlar' },
  { key: 'discounted', label: 'İndirim / ikram olanlar' }
];

const METHOD_LABEL: Record<Method, string> = { cash: 'Nakit', card: 'Kart', meal_card: 'Yemek kartı' };

const REASON_LABELS: Record<string, string> = {
  customer_cancelled: 'Müşteri vazgeçti', customer_left: 'Müşteri gitti', not_claimed: 'Hazır ama alıcı yok',
  no_payment: 'Ödemeden gitti', wrong_order: 'Yanlış sipariş', out_of_stock: 'Stok yok', other: 'Diğer'
};

function reasonLabel(raw: string | null): string {
  if (!raw) return '';
  const [code, ...rest] = raw.split(':');
  const label = REASON_LABELS[code.trim()];
  if (!label) return raw;
  const text = rest.join(':').trim();
  return text ? `${label} — ${text}` : label;
}

const money = (int: number) => `${(int / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';
const dateShort = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });

function dayStart(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromInputDate(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

/** Seçili aralık (yerel saat): [from, to) */
function rangeFor(preset: Preset, customFrom: string, customTo: string): { from: Date; to: Date; label: string } {
  const today = dayStart(new Date());
  const fmt = (d: Date) => d.toLocaleDateString('tr-TR');
  switch (preset) {
    case 'today': return { from: today, to: addDays(today, 1), label: `Bugün (${fmt(today)})` };
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: today, label: `Dün (${fmt(y)})` }; }
    case '7d': { const f = addDays(today, -6); return { from: f, to: addDays(today, 1), label: `${fmt(f)} – ${fmt(today)}` }; }
    case 'month': { const f = new Date(today.getFullYear(), today.getMonth(), 1); return { from: f, to: addDays(today, 1), label: `${fmt(f)} – ${fmt(today)}` }; }
    default: {
      const f = fromInputDate(customFrom);
      const t = fromInputDate(customTo);
      return { from: f, to: addDays(t, 1), label: `${fmt(f)} – ${fmt(t)}` };
    }
  }
}

const minutes = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
function stayLabel(a: string, b: string): string {
  const m = minutes(a, b);
  return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`;
}

/** Satırdaki küçük işaretler: iptal / iade / indirim-ikram */
function rowFlags(r: HistoryRow): { label: string; cls: string }[] {
  const flags: { label: string; cls: string }[] = [];
  if (r.cancel_count) flags.push({ label: `${r.cancel_count} iptal`, cls: orderStatusStyle('cancelled').badge });
  if (r.refund_count) flags.push({ label: `${r.refund_count} iade`, cls: 'bg-state-warn-bg text-state-warn' });
  if (r.discount_int + r.complimentary_int) flags.push({ label: 'indirim', cls: 'bg-surface-2 text-ink-muted' });
  return flags;
}

export function OrderHistory({ refreshKey }: { refreshKey: number }) {
  const { accessToken } = useAuth();
  const today = toInputDate(new Date());
  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [status, setStatus] = useState<HistoryStatus>('all');
  const [tableId, setTableId] = useState('');
  const [waiterId, setWaiterId] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<HistoryRow | null>(null);
  const [exporting, setExporting] = useState<'tables' | 'items' | null>(null);

  // Arama: yazmayı bitirince (300 ms)
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const customInvalid = preset === 'custom' && (!customFrom || !customTo || customFrom > customTo);
  const range = useMemo(
    () => (customInvalid ? null : rangeFor(preset, customFrom, customTo)),
    [preset, customFrom, customTo, customInvalid]
  );

  const query = useMemo(() => {
    if (!range) return null;
    const p = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString(), status });
    if (tableId) p.set('table_id', tableId);
    if (waiterId) p.set('waiter_id', waiterId);
    if (q) p.set('q', q);
    return p;
  }, [range, status, tableId, waiterId, q]);

  // Filtre değişince ilk sayfaya dön
  useEffect(() => { setPage(1); }, [query?.toString()]);

  useEffect(() => {
    if (!query || !accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const p = new URLSearchParams(query);
    p.set('page', String(page));
    p.set('page_size', String(PAGE_SIZE));
    apiRequest<HistoryResponse>(`/admin/orders/history?${p.toString()}`, { token: accessToken })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Geçmiş alınamadı.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query?.toString(), page, accessToken, refreshKey]);

  const filterLabel = useMemo(() => {
    if (!range || !data) return '';
    const parts = [range.label];
    if (status !== 'all') parts.push(STATUS_OPTIONS.find(s => s.key === status)!.label);
    if (tableId) parts.push(data.options.tables.find(t => t.id === tableId)?.name ?? 'Masa');
    if (waiterId) parts.push(waiterId === 'customer' ? 'Müşteri (QR)' : data.options.waiters.find(w => w.id === waiterId)?.name ?? 'Personel');
    if (q) parts.push(`"${q}"`);
    return parts.join(' · ');
  }, [range, status, tableId, waiterId, q, data]);

  async function exportExcel(mode: 'tables' | 'items') {
    if (!query || exporting) return;
    setExporting(mode);
    try {
      const p = new URLSearchParams(query);
      p.set('mode', mode);
      p.set('label', filterLabel);
      const res = await authFetch(`${API_BASE_URL}/admin/orders/history/export?${p.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? 'Excel oluşturulamadı.');
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'gecmis.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Excel oluşturulamadı.');
    } finally {
      setExporting(null);
    }
  }

  const s = data?.summary;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const hasFilter = status !== 'all' || tableId || waiterId || q;

  return (
    <div className="text-ink space-y-4">
      {/* Filtreler */}
      <div className="ui-card rounded-3xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays size={16} className="text-ink-muted" aria-hidden />
          {PRESETS.map(pr => (
            <button key={pr.key} onClick={() => setPreset(pr.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold spring-btn ${preset === pr.key ? 'ui-chip-active' : 'ui-chip'}`}>
              {pr.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={customFrom} max={today} onChange={e => setCustomFrom(e.target.value)}
                className="ui-input px-3 py-1.5 rounded-xl text-sm" aria-label="Başlangıç tarihi" />
              <span className="text-ink-muted">–</span>
              <input type="date" value={customTo} max={today} onChange={e => setCustomTo(e.target.value)}
                className="ui-input px-3 py-1.5 rounded-xl text-sm" aria-label="Bitiş tarihi" />
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={status} onChange={setStatus} ariaLabel="Durum"
            className="ui-input px-3 py-2 rounded-xl text-sm"
            options={STATUS_OPTIONS.map(o => ({ value: o.key, label: o.label }))} />
          <Select value={tableId} onChange={setTableId} ariaLabel="Masa"
            className="ui-input px-3 py-2 rounded-xl text-sm"
            options={[{ value: '', label: 'Tüm masalar' }, ...(data?.options.tables ?? []).map(t => ({ value: t.id, label: t.name }))]} />
          <Select value={waiterId} onChange={setWaiterId} ariaLabel="Personel"
            className="ui-input px-3 py-2 rounded-xl text-sm"
            options={[{ value: '', label: 'Tüm personel' }, { value: 'customer', label: 'Müşteri (QR)' },
              ...(data?.options.waiters ?? []).map(w => ({ value: w.id, label: w.name }))]} />
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden />
            <input value={qInput} onChange={e => setQInput(e.target.value)} maxLength={60}
              placeholder="Ürün ya da masa ara" className="ui-input w-full pl-9 pr-8 py-2 rounded-xl text-sm" />
            {qInput && (
              <button onClick={() => setQInput('')} aria-label="Aramayı temizle"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"><X size={15} /></button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">
            {customInvalid ? 'Başlangıç tarihi bitişten sonra olamaz.' : filterLabel}
            {hasFilter && (
              <button onClick={() => { setStatus('all'); setTableId(''); setWaiterId(''); setQInput(''); }}
                className="ml-2 underline underline-offset-2 hover:text-ink">Filtreleri temizle</button>
            )}
          </p>
          <div className="flex gap-2">
            {(['tables', 'items'] as const).map(mode => (
              <button key={mode} onClick={() => exportExcel(mode)} disabled={!data || data.total === 0 || !!exporting}
                title={mode === 'tables' ? 'Her satır bir masa hesabı' : 'Her satır bir ürün — hangi üründen kaç satıldı'}
                className="btn-outline px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 spring-btn disabled:opacity-50">
                {exporting === mode ? <LoaderCircle size={15} className="animate-spin" /> : mode === 'tables' ? <FileSpreadsheet size={15} /> : <Download size={15} />}
                Excel · {mode === 'tables' ? 'masa bazlı' : 'ürün bazlı'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Özet */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Kapanan masa', value: String(s.count), sub: s.avg_stay_min !== null ? `ort. ${s.avg_stay_min} dk oturma` : '' },
            { label: 'Net ciro', value: money(s.net_int), sub: s.net_int !== s.gross_int ? `brüt ${money(s.gross_int)}` : s.count ? `masa başı ${money(Math.round(s.net_int / s.count))}` : '' },
            { label: 'İndirim / İkram', value: money(s.discount_int + s.complimentary_int), sub: s.discount_int + s.complimentary_int ? `${money(s.discount_int)} · ${money(s.complimentary_int)}` : '' },
            { label: 'İptal / İade', value: `${s.cancel_count} / ${s.refund_count}`, sub: s.cancelled_int + s.refund_int ? money(s.cancelled_int + s.refund_int) : '', danger: s.cancel_count + s.refund_count > 0 }
          ].map(c => (
            <div key={c.label} className="ui-card rounded-3xl px-4 py-3">
              <div className="text-xs text-ink-muted">{c.label}</div>
              <div className={`font-serif font-bold text-2xl tabular-nums ${c.danger ? 'text-state-danger' : ''}`}>{c.value}</div>
              {c.sub && <div className="text-xs text-ink-muted">{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {error && <div className="ui-card rounded-2xl px-4 py-3 text-sm font-semibold bg-state-danger-bg text-state-danger">{error}</div>}

      {/* Liste */}
      <section className="ui-card rounded-3xl p-2 md:p-4 relative">
        {loading && (
          <div className="absolute inset-0 rounded-3xl bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] flex items-center justify-center z-10">
            <LoaderCircle size={24} className="animate-spin text-ink-muted" />
          </div>
        )}
        {data && data.rows.length === 0 ? (
          <div className="py-14 text-center text-ink-muted">
            <ClipboardList size={34} strokeWidth={1.5} className="mx-auto text-accent" />
            <p className="font-serif text-lg font-bold text-ink mt-2">Bu filtrede kapanan hesap yok</p>
            <p className="text-sm">Hesabı kapatılan masalar burada listelenir. Tarih aralığını genişletmeyi ya da filtreleri temizlemeyi dene.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surface-2 text-ink-muted text-[11px] font-bold uppercase tracking-[0.1em]">
                  <th className="text-left font-bold px-3 py-2.5 rounded-l-xl">No</th>
                  <th className="text-left font-bold px-3 py-2.5">Kapanış</th>
                  <th className="text-left font-bold px-3 py-2.5">Masa</th>
                  <th className="text-left font-bold px-3 py-2.5 hidden md:table-cell">Personel</th>
                  <th className="text-left font-bold px-3 py-2.5 hidden lg:table-cell">Ürünler</th>
                  <th className="text-right font-bold px-3 py-2.5 rounded-r-xl">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map(r => {
                  const flags = rowFlags(r);
                  return (
                    <tr key={r.id} onClick={() => setDetail(r)} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') setDetail(r); }}
                      className="border-b border-line last:border-b-0 cursor-pointer hover:bg-surface-2 focus:bg-surface-2 outline-none">
                      <td className="px-3 py-3 font-semibold tabular-nums whitespace-nowrap">#{r.no}</td>
                      <td className="px-3 py-3 tabular-nums whitespace-nowrap">
                        {time(r.closed_at)}
                        <span className="block text-[11px] text-ink-muted">
                          {preset !== 'today' && `${dateShort(r.closed_at)} · `}{stayLabel(r.opened_at, r.closed_at)}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-semibold">{r.table_name}</span>
                        {flags.length > 0 && (
                          <span className="flex gap-1 mt-1 flex-wrap">
                            {flags.map(f => <span key={f.label} className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${f.cls}`}>{f.label}</span>)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell max-w-[180px] truncate">{r.staff.join(', ') || <span className="text-ink-muted">—</span>}</td>
                      <td className="px-3 py-3 hidden lg:table-cell text-ink-muted max-w-[340px] truncate">
                        {r.items.length ? r.items.map(i => `${i.quantity}× ${i.product_name}`).join(', ') : 'Teslim edilen ürün yok'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                        <span className="font-semibold">{money(r.net_int)}</span>
                        {r.net_int !== r.gross_int && <span className="block text-[11px] text-ink-muted line-through">{money(r.gross_int)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 pt-3 px-2">
            <span className="text-xs text-ink-muted tabular-nums">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} / {data.total}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="btn-outline w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40" aria-label="Önceki sayfa"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold self-center tabular-nums">{page} / {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
                className="btn-outline w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40" aria-label="Sonraki sayfa"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </section>

      {detail && <HistoryDetail row={detail} token={accessToken} onClose={() => setDetail(null)} />}
    </div>
  );
}

function orderBadge(o: HistoryOrder): { label: string; cls: string } {
  if (o.status === 'delivered') return { label: 'Teslim', cls: orderStatusStyle('delivered').badge };
  if (o.status === 'cancelled') return o.is_refund
    ? { label: 'İade', cls: 'bg-state-warn-bg text-state-warn' }
    : { label: 'İptal', cls: orderStatusStyle('cancelled').badge };
  return { label: 'Teslim edilmedi', cls: 'bg-surface-2 text-ink-muted' };
}

function HistoryDetail({ row, token, onClose }: { row: HistoryRow; token: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState('');
  const [showFlow, setShowFlow] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiRequest<SessionDetail>(`/admin/orders/history/sessions/${row.id}`, { token })
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Detay alınamadı.'); });
    return () => { cancelled = true; };
  }, [row.id, token]);

  const cancelledOrders = detail?.orders.filter(o => o.status === 'cancelled') ?? [];
  const itemCancellations = detail?.orders.flatMap(o => o.cancellations.filter(c => !c.whole_order)) ?? [];
  const activeDiscounts = detail?.discounts.filter(d => !d.voided_at) ?? [];
  const methods = (['cash', 'card', 'meal_card'] as const).filter(m => row[`${m}_int`] > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Hesap #${row.no}`}>
      <div className="absolute inset-0 ui-scrim fade-enter" onClick={onClose} />
      <div className="relative ui-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 md:p-6 sheet-enter sheet-max-90 overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-serif font-bold text-2xl">#{row.no} · {row.table_name}</h3>
            <p className="text-sm text-ink-muted mt-1">
              {new Date(row.closed_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' })}
              {' · '}{time(row.opened_at)} → {time(row.closed_at)} ({stayLabel(row.opened_at, row.closed_at)})
            </p>
            <p className="text-xs text-ink-muted mt-0.5">
              {row.order_count} sipariş · {row.staff.join(', ') || '—'}
              {' · '}Kapatan: {row.auto_closed ? 'otomatik' : row.closed_by_email ?? '—'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="ui-chip w-9 h-9 rounded-full flex items-center justify-center spring-btn shrink-0"><X size={16} /></button>
        </div>

        {/* Yenilen / içilenler (teslim edilenler, birleştirilmiş) */}
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Yenilen / içilenler</div>
        {row.items.length === 0 ? (
          <p className="text-sm text-ink-muted py-2">Teslim edilen ürün yok.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] border-y border-line">
            {row.items.map((i, idx) => (
              <li key={idx} className="py-2 flex items-baseline gap-3">
                <span className="font-serif font-bold text-accent tabular-nums min-w-[2rem]">{i.quantity}×</span>
                <span className="flex-1 font-semibold">{i.product_name}</span>
                <span className="text-sm text-ink-muted tabular-nums">{money(i.quantity * i.price_int)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Hesap */}
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-muted">Brüt</span><span className="tabular-nums">{money(row.gross_int)}</span></div>
          {row.discount_int > 0 && <div className="flex justify-between"><span className="text-ink-muted">İndirim</span><span className="tabular-nums">−{money(row.discount_int)}</span></div>}
          {row.complimentary_int > 0 && <div className="flex justify-between"><span className="text-ink-muted">İkram</span><span className="tabular-nums">−{money(row.complimentary_int)}</span></div>}
          <div className="flex justify-between items-baseline pt-1 border-t border-line">
            <span className="font-semibold">Net</span>
            <span className="font-serif font-bold text-xl tabular-nums">{money(row.net_int)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-ink-muted">Tahsilat</span>
            <span className="tabular-nums font-semibold text-right">
              {methods.length ? methods.map(m => `${METHOD_LABEL[m]} ${money(row[`${m}_int`])}`).join(' · ') : money(row.paid_int)}
            </span>
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-state-danger">{error}</p>}
        {!detail && !error && <div className="py-6 flex justify-center"><LoaderCircle size={20} className="animate-spin text-ink-muted" /></div>}

        {detail && (
          <>
            {/* İndirim / ikram */}
            {activeDiscounts.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">İndirim / ikram</div>
                <ul className="text-sm space-y-1">
                  {activeDiscounts.map(d => (
                    <li key={d.id} className="flex justify-between gap-3">
                      <span>
                        {d.type === 'complimentary' ? 'İkram' : 'İndirim'}
                        {d.product_name ? ` · ${d.product_name}` : d.percent ? ` · %${d.percent}` : ''}
                        {d.note && <span className="text-ink-muted"> — {d.note}</span>}
                        <span className="text-ink-muted text-xs"> · {time(d.created_at)}{d.created_by_email ? ` · ${d.created_by_email}` : ''}</span>
                      </span>
                      <span className="tabular-nums shrink-0">−{money(d.amount_int)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ödemeler */}
            {detail.payments.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Ödemeler</div>
                <ul className="text-sm space-y-1">
                  {detail.payments.map(p => (
                    <li key={p.id} className={`flex justify-between gap-3 ${p.voided_at ? 'text-ink-muted' : ''}`}>
                      <span>
                        <span className={p.voided_at ? 'line-through' : ''}>{METHOD_LABEL[p.method]} · {time(p.created_at)}</span>
                        {p.collected_by_email && <span className="text-ink-muted text-xs"> · {p.collected_by_email}</span>}
                        {p.voided_at && <span className="text-xs"> (iptal edildi{p.void_reason ? `: ${p.void_reason}` : ''})</span>}
                      </span>
                      <span className={`tabular-nums shrink-0 ${p.voided_at ? 'line-through' : ''}`}>{money(p.amount_int)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* İptal / iade edilen siparişler */}
            {cancelledOrders.length > 0 && (
              <div className="mt-4 rounded-2xl px-4 py-3 bg-state-danger-bg text-sm space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-state-danger">İptal / iade edilen siparişler</div>
                {cancelledOrders.map(o => {
                  const actor = o.cancelled_by_email ?? o.cancellations.find(c => c.whole_order)?.actor_name ?? null;
                  return (
                    <div key={o.id}>
                      <div className="flex justify-between gap-3 font-semibold">
                        <span>{o.is_refund ? 'İade' : 'İptal'} · {time(o.cancelled_at ?? o.created_at)} · {reasonLabel(o.cancel_reason) || 'Gerekçe yok'}</span>
                        <span className="tabular-nums shrink-0 line-through text-ink-muted">{money(o.total_int)}</span>
                      </div>
                      <div className="text-ink-muted">{o.items.map(i => `${i.quantity}× ${i.product_name}`).join(', ')}</div>
                      {(o.refund_requested_by || actor) && (
                        <div className="text-xs text-ink-muted">
                          {o.refund_requested_by && <>Talep eden: <strong className="text-ink">{o.refund_requested_by}</strong>{actor ? ' · ' : ''}</>}
                          {actor && <>{o.refund_requested_by ? 'Onaylayan' : 'İptal eden'}: <strong className="text-ink">{actor}</strong></>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <CancelledItems title="İade edilen ürünler (mutfak başladıktan sonra)" entries={itemCancellations} />

            {/* Sipariş akışı */}
            <button onClick={() => setShowFlow(v => !v)} aria-expanded={showFlow}
              className="mt-4 w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-muted py-2 border-t border-line">
              Sipariş akışı ({detail.orders.length})
              <ChevronDown size={14} className={`transition-transform ${showFlow ? 'rotate-180' : ''}`} />
            </button>
            {showFlow && (
              <ol className="space-y-2">
                {detail.orders.map(o => {
                  const b = orderBadge(o);
                  return (
                    <li key={o.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold tabular-nums">{time(o.created_at)} · <span className="font-normal text-ink-muted">{o.waiter_name ?? 'Müşteri (QR)'}</span></span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${b.cls}`}>{b.label}</span>
                      </div>
                      <div className={`text-ink-muted ${o.status === 'cancelled' ? 'line-through' : ''}`}>
                        {o.items.map(i => `${i.quantity}× ${i.product_name}`).join(', ') || '—'}
                        <span className="tabular-nums"> · {money(o.total_int)}</span>
                      </div>
                      {o.delivered_at && <div className="text-[11px] text-ink-muted">Teslim {time(o.delivered_at)} ({minutes(o.created_at, o.delivered_at)} dk)</div>}
                      {o.note && <div className="text-xs font-semibold text-state-warn">Not: {o.note}</div>}
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}
