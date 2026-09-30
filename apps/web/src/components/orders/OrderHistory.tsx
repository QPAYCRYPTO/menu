// apps/web/src/components/orders/OrderHistory.tsx
// Siparişler → Geçmiş: tarih / durum / masa / personel / arama filtreleri, özet, sayfalı tablo,
// satır detayı ve Excel (.xlsx) çıktısı (sipariş bazlı ya da ürün bazlı). Veri: GET /admin/orders/history.
// Garson çağrıları burada yer almaz (yalnızca yemek siparişleri).

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Download, FileSpreadsheet, LoaderCircle, Search, X
} from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { orderStatusStyle } from '../../lib/orderStatus';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';
const PAGE_SIZE = 25;

type HistoryStatus = 'all' | 'delivered' | 'cancelled' | 'refunded';
type Preset = 'today' | 'yesterday' | '7d' | 'month' | 'custom';

type HistoryRow = {
  id: string;
  order_no: number;
  table_name: string;
  status: 'delivered' | 'cancelled';
  is_refund: boolean;
  note: string | null;
  waiter_name: string | null;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by_email: string | null;
  refund_requested_by: string | null;
  total_int: number;
  items: Array<{ product_name: string; quantity: number; price_int: number; note: string | null }>;
};

type HistoryResponse = {
  rows: HistoryRow[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    count: number; delivered_count: number; revenue_int: number;
    cancelled_count: number; refund_count: number; lost_int: number; avg_delivery_min: number | null;
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
  { key: 'all', label: 'Tüm durumlar' },
  { key: 'delivered', label: 'Teslim' },
  { key: 'cancelled', label: 'İptal' },
  { key: 'refunded', label: 'İade' }
];

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

function statusBadge(r: HistoryRow): { label: string; cls: string } {
  if (r.status === 'delivered') return { label: 'Teslim', cls: orderStatusStyle('delivered').badge };
  if (r.is_refund) return { label: 'İade', cls: 'bg-state-warn-bg text-state-warn' };
  return { label: 'İptal', cls: orderStatusStyle('cancelled').badge };
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
  const [exporting, setExporting] = useState<'orders' | 'items' | null>(null);

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

  async function exportExcel(mode: 'orders' | 'items') {
    if (!query || exporting) return;
    setExporting(mode);
    try {
      const p = new URLSearchParams(query);
      p.set('mode', mode);
      p.set('label', filterLabel);
      const res = await fetch(`${API_BASE_URL}/admin/orders/history/export?${p.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? 'Excel oluşturulamadı.');
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'siparisler.xlsx';
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
          <select value={status} onChange={e => setStatus(e.target.value as HistoryStatus)}
            className="ui-input px-3 py-2 rounded-xl text-sm" aria-label="Durum">
            {STATUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <select value={tableId} onChange={e => setTableId(e.target.value)}
            className="ui-input px-3 py-2 rounded-xl text-sm" aria-label="Masa">
            <option value="">Tüm masalar</option>
            {data?.options.tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={waiterId} onChange={e => setWaiterId(e.target.value)}
            className="ui-input px-3 py-2 rounded-xl text-sm" aria-label="Personel">
            <option value="">Tüm personel</option>
            <option value="customer">Müşteri (QR)</option>
            {data?.options.waiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
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
            {(['orders', 'items'] as const).map(mode => (
              <button key={mode} onClick={() => exportExcel(mode)} disabled={!data || data.total === 0 || !!exporting}
                title={mode === 'orders' ? 'Her satır bir sipariş' : 'Her satır bir ürün — hangi üründen kaç satıldı'}
                className="btn-outline px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 spring-btn disabled:opacity-50">
                {exporting === mode ? <LoaderCircle size={15} className="animate-spin" /> : mode === 'orders' ? <FileSpreadsheet size={15} /> : <Download size={15} />}
                Excel · {mode === 'orders' ? 'sipariş bazlı' : 'ürün bazlı'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Özet */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Sipariş', value: String(s.count), sub: `${s.delivered_count} teslim` },
            { label: 'Ciro (teslim)', value: money(s.revenue_int), sub: s.delivered_count ? `ort. ${money(Math.round(s.revenue_int / s.delivered_count))}` : '' },
            { label: 'İptal / İade', value: `${s.cancelled_count} / ${s.refund_count}`, sub: s.lost_int ? money(s.lost_int) : '', danger: s.cancelled_count + s.refund_count > 0 },
            { label: 'Ort. teslim süresi', value: s.avg_delivery_min !== null ? `${s.avg_delivery_min} dk` : '—', sub: 'verilişten teslime' }
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
            <p className="font-serif text-lg font-bold text-ink mt-2">Bu filtrede sipariş yok</p>
            <p className="text-sm">Tarih aralığını genişletmeyi ya da filtreleri temizlemeyi dene.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surface-2 text-ink-muted text-[11px] font-bold uppercase tracking-[0.1em]">
                  <th className="text-left font-bold px-3 py-2.5 rounded-l-xl">No</th>
                  <th className="text-left font-bold px-3 py-2.5">Saat</th>
                  <th className="text-left font-bold px-3 py-2.5">Masa</th>
                  <th className="text-left font-bold px-3 py-2.5 hidden md:table-cell">Personel</th>
                  <th className="text-left font-bold px-3 py-2.5 hidden lg:table-cell">Ürünler</th>
                  <th className="text-right font-bold px-3 py-2.5">Tutar</th>
                  <th className="text-left font-bold px-3 py-2.5 rounded-r-xl">Durum</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map(r => {
                  const st = statusBadge(r);
                  return (
                    <tr key={r.id} onClick={() => setDetail(r)} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') setDetail(r); }}
                      className="border-b border-line last:border-b-0 cursor-pointer hover:bg-surface-2 focus:bg-surface-2 outline-none">
                      <td className="px-3 py-3 font-semibold tabular-nums whitespace-nowrap">#{r.order_no}</td>
                      <td className="px-3 py-3 tabular-nums whitespace-nowrap">
                        {time(r.created_at)}
                        {preset !== 'today' && <span className="block text-[11px] text-ink-muted">{dateShort(r.created_at)}</span>}
                      </td>
                      <td className="px-3 py-3 font-semibold whitespace-nowrap">{r.table_name}</td>
                      <td className="px-3 py-3 hidden md:table-cell whitespace-nowrap">{r.waiter_name ?? <span className="text-ink-muted">Müşteri (QR)</span>}</td>
                      <td className="px-3 py-3 hidden lg:table-cell text-ink-muted max-w-[320px] truncate">
                        {r.items.map(i => `${i.quantity}× ${i.product_name}`).join(', ')}
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold ${r.status === 'cancelled' ? 'line-through text-ink-muted' : ''}`}>{money(r.total_int)}</td>
                      <td className="px-3 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${st.cls}`}>{st.label}</span></td>
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

      {detail && <HistoryDetail row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function HistoryDetail({ row, onClose }: { row: HistoryRow; onClose: () => void }) {
  const st = statusBadge(row);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const steps: { label: string; at: string | null }[] = [
    { label: 'Verildi', at: row.created_at },
    { label: 'Hazırlanıyor', at: row.preparing_at },
    { label: 'Hazır', at: row.ready_at },
    row.status === 'delivered' ? { label: 'Teslim', at: row.delivered_at } : { label: row.is_refund ? 'İade' : 'İptal', at: row.cancelled_at }
  ];
  const deliveryMin = row.delivered_at ? Math.round((new Date(row.delivered_at).getTime() - new Date(row.created_at).getTime()) / 60_000) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Sipariş #${row.order_no}`}>
      <div className="absolute inset-0 ui-scrim fade-enter" onClick={onClose} />
      <div className="relative ui-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 md:p-6 sheet-enter max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-serif font-bold text-2xl">#{row.order_no} · {row.table_name}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-ink-muted">
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${st.cls}`}>{st.label}</span>
              {new Date(row.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
              · {row.waiter_name ?? 'Müşteri (QR)'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="ui-chip w-9 h-9 rounded-full flex items-center justify-center spring-btn shrink-0"><X size={16} /></button>
        </div>

        {/* Zaman çizelgesi */}
        <ol className="flex items-start justify-between gap-1 mb-4">
          {steps.map((s, i) => (
            <li key={i} className="flex-1 text-center">
              <div className={`w-2.5 h-2.5 rounded-full mx-auto ${s.at ? 'bg-brand' : 'bg-line'}`} />
              <div className="text-[11px] text-ink-muted mt-1">{s.label}</div>
              <div className="text-xs font-semibold tabular-nums">{time(s.at)}</div>
            </li>
          ))}
        </ol>
        {deliveryMin !== null && <p className="text-xs text-ink-muted -mt-2 mb-3 text-center">Teslim süresi: {deliveryMin} dk</p>}

        <ul className="divide-y divide-[var(--line)] border-y border-line">
          {row.items.map((i, idx) => (
            <li key={idx} className="py-2.5">
              <div className="flex items-baseline gap-3">
                <span className="font-serif font-bold text-accent tabular-nums min-w-[2rem]">{i.quantity}×</span>
                <span className="flex-1 font-semibold">{i.product_name}</span>
                <span className="text-sm text-ink-muted tabular-nums">{money(i.quantity * i.price_int)}</span>
              </div>
              {i.note && <p className="ml-[2.75rem] text-xs font-semibold text-state-warn mt-0.5">Not: {i.note}</p>}
            </li>
          ))}
        </ul>
        {row.note && <p className="mt-3 px-3 py-2 rounded-xl text-sm font-semibold bg-state-warn-bg text-state-warn">{row.note}</p>}
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm text-ink-muted">Toplam</span>
          <span className={`font-serif font-bold text-xl ${row.status === 'cancelled' ? 'line-through text-ink-muted' : ''}`}>{money(row.total_int)}</span>
        </div>

        {row.status === 'cancelled' && (
          <div className="mt-4 rounded-2xl px-4 py-3 bg-state-danger-bg text-sm space-y-1">
            <div className="font-bold text-state-danger">{row.is_refund ? 'İade' : 'İptal'} · {reasonLabel(row.cancel_reason) || 'Gerekçe yok'}</div>
            {row.refund_requested_by && <div className="text-ink-muted">İade talep eden: <strong className="text-ink">{row.refund_requested_by}</strong></div>}
            {row.cancelled_by_email && <div className="text-ink-muted">{row.refund_requested_by ? 'Onaylayan' : 'İptal eden'}: <strong className="text-ink">{row.cancelled_by_email}</strong></div>}
          </div>
        )}
      </div>
    </div>
  );
}
