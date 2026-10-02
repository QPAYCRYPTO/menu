// apps/web/src/pages/CashierPage.tsx
// Kasa (Ödemeler) — /admin/kasa
// Solda açık hesaplar (hesap istendi → açık → boş), sağda seçili masanın adisyonu ve ödeme alanı.
// Aşama 2: her tahsilat ayrı kayıt (tutarla / ürün seçerek / eşit bölerek), nakitte para üstü,
// indirim ve ikram, ödeme iptali; tutarlar sunucudaki /sessions/:id/summary'den gelir.
// Telefonda tek sütun: masa seçilince adisyon tam ekran açılır.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Banknote, BadgePercent, Check, CreditCard, Divide, Gift, Link2, NotebookPen, Receipt, Ticket, Timer, Undo2,
  Users, Wallet, X, type LucideIcon
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrders } from '../context/OrderContext';
import { orderStatusStyle } from '../lib/orderStatus';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { ConfirmModal, type ConfirmState } from '../components/ConfirmModal';
import { OpenOrdersDecisionPanel } from '../components/payment/OpenOrdersDecisionPanel';
import { parseMoney, splitShare, toMoneyInput } from '../lib/money';
import {
  closeTable, createDiscount, createPayment, getSessionSummary, voidDiscount, voidPayment,
  type LedgerDiscount, type LedgerMethod, type LedgerPayment, type OpenOrderDecision, type OpenOrderRequiringDecision,
  type SessionSummary
} from '../api/paymentApi';

type Table = { id: string; name: string; sort_order: number; is_active: boolean };

type SessionInfo = {
  id: string;
  table_id: string;
  opened_at: string;
  cached_total_int: number;
  status: 'open' | 'closed' | 'merged';
  merge_group_id: string | null;
  merged_into_session_id: string | null;
  table_name: string;
};

/** Sol listedeki bir satır: açık hesap (birleşik masalar tek satır) ya da boş masa */
type Entry = {
  key: string;
  kind: 'bill' | 'open' | 'clean';
  name: string;
  /** Satırın kapsadığı masalar (birleşik grupta hedef + kaynaklar) */
  tableIds: string[];
  mergedNames: string[];
  sessionId: string | null;
  openedAt: string | null;
  totalInt: number;
  billCallIds: string[];
  billCallAt: string | null;
  sortOrder: number;
};

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

function formatElapsed(since: string, now: number): string {
  const min = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
}

/** 30 sn'de bir yenilenen "şimdi" (süre yazıları için) */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────
export function CashierPage() {
  const { accessToken } = useAuth();
  const { activeOrders, updateOrderStatus } = useOrders();
  const [tables, setTables] = useState<Table[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTableId = searchParams.get('masa');
  const now = useNow();

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  async function loadAll() {
    if (!accessToken) return;
    try {
      const [t, s] = await Promise.all([
        apiRequest<Table[]>('/admin/tables', { token: accessToken }),
        apiRequest<SessionInfo[]>('/admin/sessions', { token: accessToken })
      ]);
      setTables(t);
      setSessions(s);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Masalar alınamadı.', 'error');
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 10_000);
    return () => clearInterval(id);
  }, [accessToken]);

  // Başka ekranda ödeme / indirim / kapatma / birleştirme olunca (SSE "tables_changed") tazele
  const [ledgerTick, setLedgerTick] = useState(0);
  useEffect(() => {
    const onChange = () => setLedgerTick(t => t + 1);
    window.addEventListener('atlasqr:tables-changed', onChange);
    return () => window.removeEventListener('atlasqr:tables-changed', onChange);
  }, []);

  // Canlı siparişler (SSE) değişince hesapları tazele: yeni sipariş, iptal, birleştirme…
  const ordersSignature = `${activeOrders.map(o => `${o.id}:${o.status}`).join('|')}#${ledgerTick}`;
  const firstSignature = useRef(true);
  useEffect(() => {
    if (firstSignature.current) { firstSignature.current = false; return; }
    const t = setTimeout(loadAll, 400);
    return () => clearTimeout(t);
  }, [ordersSignature]);

  const billCalls = useMemo(
    () => activeOrders.filter(o => o.type === 'call' && o.call_type === 'bill' && o.status === 'pending'),
    [activeOrders]
  );

  const entries = useMemo(() => {
    const byId = new Map(sessions.map(s => [s.id, s]));
    // Birleşik zincirin sonundaki açık hesap
    const resolve = (s: SessionInfo | undefined) => {
      const seen = new Set<string>();
      let cur = s;
      while (cur && cur.status === 'merged' && cur.merged_into_session_id && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.merged_into_session_id) ?? cur;
      }
      return cur?.status === 'open' ? cur : undefined;
    };
    const sessionByTable = new Map(sessions.map(s => [s.table_id, s]));
    const tableById = new Map(tables.map(t => [t.id, t]));

    const open = new Map<string, Entry>();
    for (const s of sessions) {
      if (s.status !== 'open') continue;
      open.set(s.id, {
        key: s.id, kind: 'open', name: s.table_name, tableIds: [s.table_id], mergedNames: [],
        sessionId: s.id, openedAt: s.opened_at, totalInt: s.cached_total_int,
        billCallIds: [], billCallAt: null, sortOrder: tableById.get(s.table_id)?.sort_order ?? 0
      });
    }
    for (const s of sessions) {
      if (s.status !== 'merged') continue;
      const target = resolve(s);
      const entry = target && open.get(target.id);
      if (!entry) continue;
      entry.tableIds.push(s.table_id);
      entry.mergedNames.push(s.table_name);
    }

    const clean = new Map<string, Entry>();
    for (const t of tables) {
      if (!t.is_active || sessionByTable.has(t.id)) continue;
      clean.set(t.id, {
        key: `t-${t.id}`, kind: 'clean', name: t.name, tableIds: [t.id], mergedNames: [],
        sessionId: null, openedAt: null, totalInt: 0, billCallIds: [], billCallAt: null, sortOrder: t.sort_order
      });
    }

    // Hesap istekleri → masanın (varsa birleşik hedef) hesabına
    for (const call of billCalls) {
      const target = resolve(sessionByTable.get(call.table_id));
      const entry = (target && open.get(target.id)) ?? clean.get(call.table_id);
      if (!entry) continue;
      entry.kind = 'bill';
      entry.billCallIds.push(call.id);
      if (!entry.billCallAt || call.created_at < entry.billCallAt) entry.billCallAt = call.created_at;
    }

    const all = [...open.values(), ...clean.values()];
    const rank = { bill: 0, open: 1, clean: 2 } as const;
    return all.sort((a, b) => {
      if (a.kind !== b.kind) return rank[a.kind] - rank[b.kind];
      if (a.kind === 'bill') return (a.billCallAt ?? '').localeCompare(b.billCallAt ?? '');
      if (a.kind === 'open') return (a.openedAt ?? '').localeCompare(b.openedAt ?? '');
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr');
    });
  }, [sessions, tables, billCalls]);

  const selected = selectedTableId ? entries.find(e => e.tableIds.includes(selectedTableId)) ?? null : null;
  const openEntries = entries.filter(e => e.sessionId);
  const openTotal = openEntries.reduce((sum, e) => sum + e.totalInt, 0);

  function select(entry: Entry | null) {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (entry) p.set('masa', entry.tableIds[0]); else p.delete('masa');
      return p;
    }, { replace: true });
  }

  async function acknowledgeBillCalls(ids: string[]) {
    await Promise.all(ids.map(id => updateOrderStatus(id, 'delivered').catch(() => {})));
  }

  return (
    <div className="text-ink">
      <Toast state={toast} />

      <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)] md:h-[calc(100dvh-150px)] md:min-h-[520px]">
        {/* ── SOL: masa listesi ── */}
        <aside className="ui-card rounded-3xl flex flex-col min-h-0 overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-line">
            <div className="flex items-center gap-2">
              <Wallet size={20} strokeWidth={1.5} className="text-cash" aria-hidden />
              <h2 className="font-serif font-bold text-2xl text-cash">Kasa</h2>
            </div>
            <p className="text-xs text-ink-muted mt-1">
              Açık hesaplar: <span className="font-bold text-ink">{openEntries.length} masa</span>
              {' · '}<span className="font-bold text-ink tabular-nums">{formatPrice(openTotal)}</span>
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2" role="list" aria-label="Masalar">
            {!loaded && (
              <div className="py-10 flex justify-center">
                <div className="w-7 h-7 rounded-full border-2 border-line animate-spin" style={{ borderTopColor: 'var(--cash)' }} />
              </div>
            )}
            {loaded && entries.length === 0 && (
              <p className="text-sm text-ink-muted text-center py-10">Henüz masa yok.</p>
            )}
            {entries.map(entry => (
              <TableRow key={entry.key} entry={entry} now={now}
                selected={selected?.key === entry.key}
                onSelect={() => select(entry)} />
            ))}
          </div>
        </aside>

        {/* ── SAĞ: adisyon + ödeme ── */}
        <section className={selected
          ? 'fixed inset-0 z-40 bg-page overflow-y-auto p-3 md:static md:z-auto md:bg-transparent md:p-0 md:overflow-visible md:min-h-0 flex flex-col'
          : 'hidden md:flex md:flex-col md:min-h-0'}>
          {selected && selected.sessionId && accessToken ? (
            <BillPanel key={selected.sessionId}
              sessionId={selected.sessionId}
              entry={selected}
              token={accessToken}
              now={now}
              refreshSignal={ordersSignature}
              onBack={() => select(null)}
              onToast={showToast}
              onAcknowledgeCalls={() => acknowledgeBillCalls(selected.billCallIds)}
              onClosed={async () => {
                await acknowledgeBillCalls(selected.billCallIds);
                select(null);
                await loadAll();
              }} />
          ) : selected ? (
            <EmptyTablePanel entry={selected} now={now} onBack={() => select(null)}
              onAcknowledge={async () => { await acknowledgeBillCalls(selected.billCallIds); showToast('Hesap isteği kapatıldı.', 'success'); }} />
          ) : (
            <div className="ui-card rounded-3xl flex-1 flex flex-col items-center justify-center text-center p-10" style={{ borderStyle: 'dashed' }}>
              <Receipt size={40} strokeWidth={1.25} className="text-cash mb-3" aria-hidden />
              <p className="font-serif text-xl font-bold text-ink">Bir masa seçin</p>
              <p className="text-sm text-ink-muted mt-1">Soldaki listeden masaya dokununca adisyon ve ödeme burada açılır.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── SOL LİSTE SATIRI ─────────────────────────────────────────────────────────
function TableRow({ entry, now, selected, onSelect }: { entry: Entry; now: number; selected: boolean; onSelect: () => void }) {
  const isBill = entry.kind === 'bill';
  const isClean = entry.kind === 'clean' && !isBill;
  const strip = isBill ? 'var(--state-danger)' : entry.kind === 'open' ? 'var(--state-warn)' : 'var(--state-ok)';

  return (
    <button type="button" role="listitem" onClick={onSelect} aria-current={selected ? 'true' : undefined}
      className={`w-full text-left rounded-2xl pl-4 pr-3 py-3 spring-btn relative overflow-hidden transition-colors ${
        selected ? 'bg-cash-bg' : 'bg-surface-2 hover:bg-[color-mix(in_srgb,var(--cash)_8%,var(--surface-2))]'} ${isClean ? 'opacity-55' : ''}`}
      style={{
        border: `${selected ? 2 : 1}px solid ${selected ? 'var(--cash)' : 'var(--line)'}`,
      }}>
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: strip }} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-serif font-bold text-[17px] leading-tight truncate">{entry.name}</div>
          {entry.mergedNames.length > 0 && (
            <div className="text-[11px] text-state-info font-semibold flex items-center gap-1 mt-0.5 truncate">
              <Link2 size={11} className="flex-shrink-0" /> + {entry.mergedNames.join(', ')}
            </div>
          )}
        </div>
        {entry.sessionId && (
          <span className="font-bold tabular-nums text-[15px] whitespace-nowrap">{formatPrice(entry.totalInt)}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
        {isBill ? (
          <span className="font-bold text-state-danger inline-flex items-center gap-1">
            <Receipt size={12} /> Hesap istendi · {formatElapsed(entry.billCallAt!, now)}
          </span>
        ) : entry.kind === 'open' ? (
          <span className="font-semibold text-state-warn">Açık hesap</span>
        ) : (
          <span className="font-semibold text-state-ok">Boş</span>
        )}
        {entry.openedAt && (
          <span className="text-ink-muted inline-flex items-center gap-1 tabular-nums"><Timer size={11} /> {formatElapsed(entry.openedAt, now)}</span>
        )}
      </div>
    </button>
  );
}

// ─── HESABI OLMAYAN MASA (ör. boş masadan hesap isteği) ───────────────────────
function EmptyTablePanel({ entry, now, onBack, onAcknowledge }: { entry: Entry; now: number; onBack: () => void; onAcknowledge: () => void }) {
  return (
    <div className="ui-card rounded-3xl flex-1 flex flex-col p-6">
      <button onClick={onBack} className="md:hidden ui-chip self-start px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 mb-4 spring-btn">
        <ArrowLeft size={16} /> Masalar
      </button>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="font-serif text-2xl font-bold">{entry.name}</p>
        <p className="text-sm text-ink-muted mt-1">Bu masada açık hesap yok.</p>
        {entry.billCallIds.length > 0 && (
          <>
            <p className="text-sm font-semibold text-state-danger mt-4 inline-flex items-center gap-1.5">
              <Receipt size={14} /> Hesap istendi · {formatElapsed(entry.billCallAt!, now)}
            </p>
            <button onClick={onAcknowledge} className="btn-outline mt-3 px-4 py-2.5 rounded-2xl text-sm font-bold spring-btn">
              İsteği kapat
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PARA GİRİŞİ ─────────────────────────────────────────────────────────────
const METHOD_META: Record<LedgerMethod, { label: string; icon: LucideIcon }> = {
  cash: { label: 'Nakit', icon: Banknote },
  card: { label: 'Kart', icon: CreditCard },
  meal_card: { label: 'Yemek Kartı', icon: Ticket },
};
const METHOD_ORDER: LedgerMethod[] = ['cash', 'card', 'meal_card'];
const CASH_QUICK = [5000, 10000, 20000, 50000];

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** Kasa içi küçük pencere (Esc / dışarı tıklayınca kapanır) */
function Dialog({ title, icon: Icon, onClose, children }: { title: string; icon: LucideIcon; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 fade-enter" style={{ background: 'var(--scrim)' }} onClick={onClose}>
      <div className="ui-card w-full max-w-md rounded-3xl p-5 text-ink max-h-[90dvh] overflow-y-auto" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif font-bold text-xl flex items-center gap-2"><Icon size={18} className="text-cash" /> {title}</h3>
          <button onClick={onClose} aria-label="Kapat" className="ui-chip w-8 h-8 rounded-full flex items-center justify-center spring-btn"><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const segBtn = (on: boolean) =>
  `flex-1 py-2.5 rounded-xl text-sm font-bold spring-btn ${on ? 'bg-cash text-on-cash' : 'bg-surface-2 text-ink-muted border border-line'}`;

// ─── İNDİRİM ─────────────────────────────────────────────────────────────────
function DiscountDialog({ summary, onClose, onApply }: {
  summary: SessionSummary;
  onClose: () => void;
  onApply: (body: { percent?: number; amount_int?: number; note?: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const base = summary.total_int - summary.discount_int;
  const pct = mode === 'percent' ? Math.min(100, Math.max(0, parseInt(value, 10) || 0)) : 0;
  const preview = Math.min(summary.remaining_int, mode === 'percent' ? Math.round((base * pct) / 100) : parseMoney(value) ?? 0);

  return (
    <Dialog title="İndirim" icon={BadgePercent} onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button className={segBtn(mode === 'percent')} onClick={() => { setMode('percent'); setValue(''); }}>% Yüzde</button>
        <button className={segBtn(mode === 'amount')} onClick={() => { setMode('amount'); setValue(''); }}>TL Tutar</button>
      </div>
      <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" autoFocus
        placeholder={mode === 'percent' ? 'Örn. 10' : 'Örn. 50,00'} aria-label={mode === 'percent' ? 'Yüzde' : 'Tutar'}
        className="ui-input w-full px-4 py-3 rounded-2xl text-2xl font-bold tabular-nums mb-2" />
      {mode === 'percent' && (
        <div className="flex gap-2 mb-3">
          {[5, 10, 15, 20].map(p => (
            <button key={p} onClick={() => setValue(String(p))} className="ui-chip flex-1 py-2 rounded-xl text-sm font-semibold spring-btn">%{p}</button>
          ))}
        </div>
      )}
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Not (isteğe bağlı)"
        className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm mb-4" />
      <div className="flex items-center justify-between mb-4 text-sm">
        <span className="text-ink-muted">Uygulanacak indirim</span>
        <span className="font-bold text-lg tabular-nums text-cash">−{formatPrice(preview)}</span>
      </div>
      <button disabled={busy || preview <= 0} onClick={async () => {
        setBusy(true);
        try { await onApply(mode === 'percent' ? { percent: pct, note: note.trim() || undefined } : { amount_int: preview, note: note.trim() || undefined }); }
        finally { setBusy(false); }
      }} className="w-full py-3.5 rounded-2xl font-bold bg-cash text-on-cash spring-btn disabled:opacity-45">
        {busy ? 'Uygulanıyor…' : 'İndirimi Uygula'}
      </button>
    </Dialog>
  );
}

// ─── İKRAM ───────────────────────────────────────────────────────────────────
function ComplimentaryDialog({ summary, onClose, onApply }: {
  summary: SessionSummary;
  onClose: () => void;
  onApply: (body: { applies_to: 'session' | 'item'; order_item_id?: string; note: string }) => Promise<void>;
}) {
  const candidates = summary.items.filter(i => i.order_status === 'delivered' && !i.is_paid && !i.is_complimentary);
  const [scope, setScope] = useState<'item' | 'session'>(candidates.length ? 'item' : 'session');
  const [itemId, setItemId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const item = candidates.find(i => i.item_id === itemId);
  const preview = scope === 'session' ? summary.remaining_int : Math.min(summary.remaining_int, item ? item.price_int * item.quantity : 0);
  const ready = preview > 0 && note.trim().length > 0 && (scope === 'session' || !!item);

  return (
    <Dialog title="İkram" icon={Gift} onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button className={segBtn(scope === 'item')} onClick={() => setScope('item')} disabled={!candidates.length}>Ürün</button>
        <button className={segBtn(scope === 'session')} onClick={() => setScope('session')}>Tüm hesap</button>
      </div>
      {scope === 'item' && (
        <div className="space-y-1.5 mb-3 max-h-56 overflow-y-auto" role="radiogroup" aria-label="İkram edilecek ürün">
          {candidates.map(i => {
            const on = i.item_id === itemId;
            return (
              <button key={i.item_id} role="radio" aria-checked={on} onClick={() => setItemId(i.item_id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm text-left"
                style={{ background: on ? 'var(--cash-bg)' : 'var(--surface-2)', border: `1.5px solid ${on ? 'var(--cash)' : 'var(--line)'}` }}>
                <span className="font-semibold">{i.quantity}× {i.product_name}</span>
                <span className="font-bold tabular-nums">{formatPrice(i.price_int * i.quantity)}</span>
              </button>
            );
          })}
        </div>
      )}
      <label className="block text-xs font-semibold text-ink-muted mb-1.5">Not — kim onayladı, neden? (zorunlu)</label>
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} autoFocus placeholder="Örn. Müdür Ahmet onayladı, doğum günü"
        className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm mb-4" />
      <div className="flex items-center justify-between mb-4 text-sm">
        <span className="text-ink-muted">İkram tutarı</span>
        <span className="font-bold text-lg tabular-nums text-cash">−{formatPrice(preview)}</span>
      </div>
      <button disabled={busy || !ready} onClick={async () => {
        setBusy(true);
        try { await onApply({ applies_to: scope, order_item_id: scope === 'item' ? itemId ?? undefined : undefined, note: note.trim() }); }
        finally { setBusy(false); }
      }} className="w-full py-3.5 rounded-2xl font-bold bg-cash text-on-cash spring-btn disabled:opacity-45">
        {busy ? 'Uygulanıyor…' : 'İkram Et'}
      </button>
    </Dialog>
  );
}

// ─── ÖDEME İPTALİ ────────────────────────────────────────────────────────────
function VoidDialog({ payment, onClose, onConfirm }: { payment: LedgerPayment; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const meta = METHOD_META[payment.method];
  return (
    <Dialog title="Ödemeyi iptal et" icon={Undo2} onClose={onClose}>
      <p className="text-sm text-ink-muted mb-3">
        <span className="font-bold text-ink">{meta.label} · {formatPrice(payment.amount_int)}</span> · {timeOf(payment.created_at)}
        {payment.item_count > 0 && <> — seçilen {payment.item_count} ürün yeniden ödenmemiş olur.</>}
      </p>
      <div className="flex flex-wrap gap-2 mb-2">
        {['Yanlış ödeme yöntemi', 'Yanlış tutar', 'Müşteri vazgeçti'].map(r => (
          <button key={r} onClick={() => setReason(r)} className="ui-chip px-3 py-1.5 rounded-full text-xs font-semibold spring-btn">{r}</button>
        ))}
      </div>
      <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} autoFocus placeholder="İptal sebebi (zorunlu)"
        className="ui-input w-full px-4 py-2.5 rounded-2xl text-sm mb-4" />
      <button disabled={busy || reason.trim().length < 2} onClick={async () => {
        setBusy(true);
        try { await onConfirm(reason.trim()); } finally { setBusy(false); }
      }} className="w-full py-3.5 rounded-2xl font-bold spring-btn disabled:opacity-45"
        style={{ background: 'var(--state-danger)', color: 'var(--bg)' }}>
        {busy ? 'İptal ediliyor…' : 'Ödemeyi İptal Et'}
      </button>
    </Dialog>
  );
}

// ─── ADİSYON + ÖDEME PANELİ ──────────────────────────────────────────────────
type BillPanelProps = {
  sessionId: string;
  entry: Entry;
  token: string;
  now: number;
  /** Canlı sipariş/hesap olayları değişince özeti yeniden çek */
  refreshSignal: string;
  onBack: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
  onAcknowledgeCalls: () => void;
  onClosed: () => void;
};

type Split = { n: number; share: number; paid: number };

function BillPanel({ sessionId, entry, token, now, refreshSignal, onBack, onToast, onAcknowledgeCalls, onClosed }: BillPanelProps) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<LedgerMethod>('cash');
  const [amountStr, setAmountStr] = useState('');
  const [receivedStr, setReceivedStr] = useState('');
  const [split, setSplit] = useState<Split | null>(null);
  const [splitPicker, setSplitPicker] = useState(false);
  const [customSplit, setCustomSplit] = useState('');
  const [paying, setPaying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dialog, setDialog] = useState<'discount' | 'complimentary' | null>(null);
  const [voidTarget, setVoidTarget] = useState<LedgerPayment | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  // Doluysa hesap kapanmadı: ödenmemiş açık siparişler için karar paneli
  const [openOrders, setOpenOrders] = useState<OpenOrderRequiringDecision[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, OpenOrderDecision>>({});

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const data = await getSessionSummary(token, sessionId);
      setSummary(data);
      // Ödenmiş / ikram edilmiş / listeden çıkmış seçimleri bırak
      const selectable = new Set(data.items.filter(i => i.order_status === 'delivered' && !i.is_paid && !i.is_complimentary).map(i => i.item_id));
      setSelectedItems(prev => new Set([...prev].filter(id => selectable.has(id))));
      if (data.remaining_int <= 0) setSplit(null);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Adisyon yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(true); }, [sessionId]);
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) { firstSignal.current = false; return; }
    const t = setTimeout(() => load(), 400);
    return () => clearTimeout(t);
  }, [refreshSignal]);

  const remaining = Math.max(0, summary?.remaining_int ?? 0);
  // Adisyon = teslim edilmiş siparişler; teslim bekleyenler ayrı listelenir, tahsil edilemez
  const billItems = summary?.items.filter(i => i.order_status === 'delivered') ?? [];
  const waitingItems = summary?.items.filter(i => i.order_status !== 'delivered') ?? [];
  const selectableItems = billItems.filter(i => !i.is_paid && !i.is_complimentary);
  const allSelected = selectableItems.length > 0 && selectableItems.every(i => selectedItems.has(i.item_id));
  const selectedTotal = selectableItems.filter(i => selectedItems.has(i.item_id)).reduce((s, i) => s + i.price_int * i.quantity, 0);

  // Tahsil edilecek tutar: ürün seçimi > eşit bölme payı > elle girilen
  const amountMode: 'items' | 'split' | 'manual' = selectedItems.size > 0 ? 'items' : split ? 'split' : 'manual';
  const amountInt = amountMode === 'items' ? Math.min(selectedTotal, remaining)
    : amountMode === 'split' ? Math.min(split!.share, remaining)
    : parseMoney(amountStr) ?? 0;
  const amountTooHigh = amountInt > remaining;
  const receivedInt = parseMoney(receivedStr);
  const change = method === 'cash' && receivedInt != null && amountInt > 0 ? receivedInt - amountInt : null;

  function toggleItem(itemId: string) {
    setSplit(null);
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function onAmountChange(v: string) {
    setSelectedItems(new Set());
    setSplit(null);
    setAmountStr(v);
  }

  function startSplit(n: number) {
    const share = splitShare(remaining, n);
    if (share == null) return;
    setSelectedItems(new Set());
    setAmountStr('');
    setSplit({ n, share, paid: 0 });
    setSplitPicker(false);
    setCustomSplit('');
  }

  async function handlePay() {
    if (amountInt <= 0 || amountTooHigh) return;
    setPaying(true);
    try {
      const res = await createPayment(token, {
        session_id: sessionId,
        method,
        ...(amountMode === 'items' ? { item_ids: [...selectedItems] } : { amount_int: amountInt })
      });
      const paid = res.payment.amount_int;
      onToast(`${METHOD_META[method].label} · ${formatPrice(paid)} tahsil edildi`
        + (change != null && change > 0 ? ` · Para üstü ${formatPrice(change)}` : ''), 'success');
      setSelectedItems(new Set());
      setAmountStr('');
      setReceivedStr('');
      setSplit(s => (s && s.paid + 1 < s.n && res.ledger.remaining_int > 0 ? { ...s, paid: s.paid + 1 } : null));
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Ödeme alınamadı.', 'error');
    } finally {
      setPaying(false);
    }
  }

  async function applyDiscount(body: Parameters<typeof createDiscount>[1]) {
    try {
      await createDiscount(token, body);
      onToast(body.type === 'complimentary' ? 'İkram uygulandı.' : 'İndirim uygulandı.', 'success');
      setDialog(null);
      setSplit(null);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Uygulanamadı.', 'error');
    }
  }

  function askRemoveDiscount(d: LedgerDiscount) {
    setConfirm({
      title: d.type === 'complimentary' ? 'İkramı kaldır?' : 'İndirimi kaldır?',
      message: <><strong>{formatPrice(d.amount_int)}</strong> yeniden hesaba eklenecek.</>,
      confirmText: 'Evet, kaldır',
      tone: 'warning',
      onConfirm: async () => {
        await voidDiscount(token, d.id);
        onToast('Kaldırıldı.', 'success');
        await load();
      }
    });
  }

  async function confirmVoid(reason: string) {
    if (!voidTarget) return;
    try {
      await voidPayment(token, voidTarget.id, reason);
      onToast('Ödeme iptal edildi.', 'success');
      setVoidTarget(null);
      setSplit(null);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'İptal edilemedi.', 'error');
    }
  }

  async function handleCloseTable(force = false) {
    setClosing(true);
    try {
      const decisionList = Object.entries(decisions).map(([order_id, decision]) => ({ order_id, decision }));
      const result = await closeTable(token, sessionId, force, force ? decisionList : []);
      if (result.open_orders && result.open_orders.length > 0) {
        // Kararı eksik açık sipariş var → hesap kapanmadı, panel açılır (liste değiştiyse güncellenir)
        const ids = new Set(result.open_orders.map(o => o.order_id));
        if (openOrders) onToast('Açık sipariş listesi değişti. Seçimleri kontrol edin.', 'error');
        setOpenOrders(result.open_orders);
        setDecisions(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id))));
        return;
      }
      if (result.closed_session_ids.length === 0) {
        // Kalan tutar sıfırlanmadan hesap kapanmaz (sunucu da reddeder)
        onToast(`${formatPrice(result.remaining_int ?? remaining)} kaldı. Tahsil edin, ikram ya da indirim uygulayın.`, 'error');
        await load();
        return;
      }
      onToast('Hesap kapatıldı.', 'success');
      onClosed();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Hesap kapatılamadı.', 'error');
    } finally {
      setClosing(false);
    }
  }

  async function transferPending() {
    setClosing(true);
    try {
      await apiRequest(`/admin/sessions/${sessionId}/close`, { method: 'POST', token, body: { action: 'transfer' } });
      onToast('Hesap kapatıldı; bekleyen siparişler yeni hesaba taşındı.', 'success');
      onClosed();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'İşlem yapılamadı.', 'error');
    } finally {
      setClosing(false);
    }
  }

  // Tahsil edilecek tutar varken birincil eylem "Tahsil Et", yoksa "Hesabı Kapat"
  const payIsPrimary = amountInt > 0 && remaining > 0;
  // Hesap yalnızca kalan sıfırken kapanır: tahsilat, ikram ya da indirimle
  const canClose = remaining <= 0;
  const primaryBtn = 'bg-cash text-on-cash border border-transparent';
  const softBtn = 'bg-cash-bg text-ink border border-[var(--cash)]';

  return (
    <div className="ui-card rounded-3xl flex-1 flex flex-col min-h-0 overflow-hidden">
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />
      {summary && dialog === 'discount' && (
        <DiscountDialog summary={summary} onClose={() => setDialog(null)}
          onApply={b => applyDiscount({ session_id: sessionId, type: 'discount', applies_to: 'session', ...b })} />
      )}
      {summary && dialog === 'complimentary' && (
        <ComplimentaryDialog summary={summary} onClose={() => setDialog(null)}
          onApply={b => applyDiscount({ session_id: sessionId, type: 'complimentary', ...b })} />
      )}
      {voidTarget && <VoidDialog payment={voidTarget} onClose={() => setVoidTarget(null)} onConfirm={confirmVoid} />}

      {/* Başlık */}
      <div className="px-5 md:px-6 pt-4 pb-4 border-b border-line flex-shrink-0">
        <button onClick={onBack} className="md:hidden ui-chip px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 mb-3 spring-btn">
          <ArrowLeft size={16} /> Masalar
        </button>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-serif font-bold text-2xl md:text-3xl text-cash leading-tight">{entry.name}</h2>
            {entry.mergedNames.length > 0 && (
              <p className="text-xs text-state-info font-semibold mt-1 inline-flex items-center gap-1">
                <Link2 size={12} /> Birleşik: {entry.mergedNames.join(', ')}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="ui-eyebrow">Toplam</div>
            <div className="font-serif font-bold text-2xl md:text-3xl text-cash tabular-nums">{formatPrice(summary?.total_int ?? entry.totalInt)}</div>
          </div>
        </div>
        {entry.billCallIds.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-state-danger-bg">
            <span className="text-sm font-bold text-state-danger inline-flex items-center gap-1.5">
              <Receipt size={15} /> Hesap istendi · {formatElapsed(entry.billCallAt!, now)}
            </span>
            <button onClick={onAcknowledgeCalls} className="text-xs font-bold text-state-danger underline underline-offset-2">
              Görüldü
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-line animate-spin" style={{ borderTopColor: 'var(--cash)' }} />
        </div>
      ) : summary && openOrders ? (
        <OpenOrdersDecisionPanel
          orders={openOrders}
          decisions={decisions}
          closing={closing}
          onDecide={(orderId, decision) => setDecisions(prev => ({ ...prev, [orderId]: decision }))}
          onCancel={() => { setOpenOrders(null); setDecisions({}); }}
          onConfirm={() => handleCloseTable(true)}
          onTransfer={transferPending}
        />
      ) : summary ? (
        <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden xl:grid xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── Adisyon: kalemler, indirimler, ödeme geçmişi ── */}
          <div className="px-5 md:px-6 py-4 xl:overflow-y-auto xl:min-h-0">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <span className="ui-eyebrow">Adisyon</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setDialog('discount')} disabled={remaining <= 0}
                  className="ui-chip px-3 py-1.5 rounded-full text-xs font-semibold spring-btn flex items-center gap-1.5 disabled:opacity-45">
                  <BadgePercent size={14} /> İndirim
                </button>
                <button onClick={() => setDialog('complimentary')} disabled={remaining <= 0}
                  className="ui-chip px-3 py-1.5 rounded-full text-xs font-semibold spring-btn flex items-center gap-1.5 disabled:opacity-45">
                  <Gift size={14} /> İkram
                </button>
                {selectableItems.length > 0 && (
                  <button onClick={() => { setSplit(null); setSelectedItems(allSelected ? new Set() : new Set(selectableItems.map(i => i.item_id))); }}
                    className="text-xs font-bold text-cash spring-btn px-2 py-1">
                    {allSelected ? 'Seçimi kaldır' : 'Tümünü seç'}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              {billItems.map(item => {
                const locked = item.is_paid || item.is_complimentary;
                const sel = selectedItems.has(item.item_id);
                return (
                  <button type="button" key={item.item_id} disabled={locked} onClick={() => toggleItem(item.item_id)}
                    aria-pressed={locked ? undefined : sel}
                    className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors ${locked ? 'opacity-55 cursor-default' : ''}`}
                    style={{
                      background: sel ? 'var(--cash-bg)' : 'var(--surface-2)',
                      border: `1.5px solid ${sel ? 'var(--cash)' : 'var(--line)'}`
                    }}>
                    <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={item.is_paid
                        ? { background: 'var(--state-ok-bg)', border: '1.5px solid var(--state-ok)' }
                        : item.is_complimentary
                        ? { background: 'var(--cash-bg)', border: '1.5px solid var(--cash)' }
                        : { background: sel ? 'var(--cash)' : 'var(--surface)', border: `1.5px solid ${sel ? 'var(--cash)' : 'var(--ink-muted)'}` }}>
                      {item.is_paid ? <Check size={13} strokeWidth={3} className="text-state-ok" />
                        : item.is_complimentary ? <Gift size={12} className="text-cash" />
                        : sel && <Check size={13} strokeWidth={3} className="text-on-cash" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold">
                        <span className={locked ? 'line-through text-ink-muted' : ''}>{item.quantity}× {item.product_name}</span>
                        {item.is_complimentary && <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cash-bg text-cash">İkram</span>}
                      </span>
                      <span className="block text-xs text-ink-muted tabular-nums">{item.quantity} × {formatPrice(item.price_int)}</span>
                      {item.note && (
                        <span className="text-xs text-ink-muted flex items-center gap-1 mt-0.5"><NotebookPen size={11} className="flex-shrink-0" /> {item.note}</span>
                      )}
                    </span>
                    <span className={`text-[15px] font-bold tabular-nums flex-shrink-0 ${locked ? 'line-through text-ink-muted' : ''}`}>{formatPrice(item.price_int * item.quantity)}</span>
                  </button>
                );
              })}
              {billItems.length === 0 && (
                <p className="text-center py-6 text-sm text-ink-muted">Henüz teslim edilmiş sipariş yok.</p>
              )}
            </div>

            {waitingItems.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="ui-eyebrow">Teslim bekleyen · adisyona eklenmedi</div>
                {waitingItems.map(item => {
                  const st = orderStatusStyle(item.order_status);
                  return (
                    <div key={item.item_id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl opacity-70"
                      style={{ border: '1.5px dashed var(--line)' }}>
                      <span className="flex-1 min-w-0 text-sm font-semibold">
                        {item.quantity}× {item.product_name}
                        <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                      </span>
                      <span className="text-sm tabular-nums text-ink-muted">{formatPrice(item.price_int * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {summary.discounts.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="ui-eyebrow">İndirim / İkram</div>
                {summary.discounts.map(d => (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-cash-bg" style={{ border: '1px solid var(--line)' }}>
                    {d.type === 'complimentary' ? <Gift size={15} className="text-cash flex-shrink-0" /> : <BadgePercent size={15} className="text-cash flex-shrink-0" />}
                    <span className="flex-1 min-w-0 text-sm">
                      <span className="font-semibold">
                        {d.type === 'complimentary' ? 'İkram' : 'İndirim'}
                        {d.percent ? ` %${d.percent}` : ''}
                        {d.product_name ? ` · ${d.item_quantity}× ${d.product_name}` : d.type === 'complimentary' ? ' · Tüm hesap' : ''}
                      </span>
                      {d.note && <span className="block text-xs text-ink-muted truncate">{d.note}</span>}
                    </span>
                    <span className="font-bold tabular-nums text-sm">−{formatPrice(d.amount_int)}</span>
                    <button onClick={() => askRemoveDiscount(d)} className="text-xs font-bold text-ink-muted hover:text-state-danger px-1.5 py-1">Kaldır</button>
                  </div>
                ))}
              </div>
            )}

            {summary.payments.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="ui-eyebrow">Ödemeler</div>
                {summary.payments.map(p => {
                  const meta = METHOD_META[p.method];
                  const voided = !!p.voided_at;
                  return (
                    <div key={p.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-surface-2 ${voided ? 'opacity-55' : ''}`} style={{ border: '1px solid var(--line)' }}>
                      <meta.icon size={16} className={voided ? 'text-ink-muted flex-shrink-0' : 'text-state-ok flex-shrink-0'} />
                      <span className="flex-1 min-w-0 text-sm">
                        <span className={`font-semibold ${voided ? 'line-through' : ''}`}>
                          {meta.label} · <span className="tabular-nums">{formatPrice(p.amount_int)}</span>
                        </span>
                        <span className="text-xs text-ink-muted"> · {timeOf(p.created_at)}{p.item_count > 0 ? ` · ${p.item_count} ürün` : ''}</span>
                        {voided && <span className="block text-xs text-state-danger">İptal: {p.void_reason}</span>}
                        {!voided && p.note && <span className="block text-xs text-ink-muted truncate">{p.note}</span>}
                      </span>
                      {!voided && (
                        <button onClick={() => setVoidTarget(p)} className="text-xs font-bold text-ink-muted hover:text-state-danger px-1.5 py-1">İptal</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Ödeme alanı ── */}
          <div className="border-t border-line xl:border-t-0 xl:border-l px-5 md:px-6 py-4 space-y-3 xl:overflow-y-auto xl:min-h-0">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Toplam</div>
                <div className="text-sm font-bold tabular-nums">{formatPrice(summary.total_int)}</div>
              </div>
              <div className="rounded-xl bg-surface-2 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">İndirim</div>
                <div className="text-sm font-bold tabular-nums text-cash">{summary.discount_int > 0 ? `−${formatPrice(summary.discount_int)}` : '—'}</div>
              </div>
              <div className="rounded-xl bg-surface-2 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Ödenen</div>
                <div className="text-sm font-bold tabular-nums text-state-ok">{formatPrice(summary.paid_int)}</div>
              </div>
            </div>

            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="ui-eyebrow">Kalan</div>
                <div className="font-serif font-bold text-4xl tabular-nums leading-none mt-1">{formatPrice(remaining)}</div>
              </div>
              {split && (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-cash-bg text-cash inline-flex items-center gap-1.5">
                  <Users size={13} /> Kişi {split.paid + 1}/{split.n}
                  <button onClick={() => setSplit(null)} aria-label="Bölmeyi kapat" className="ml-0.5"><X size={12} /></button>
                </span>
              )}
            </div>

            {/* Ödeme yöntemleri + Böl — ileride POS / yemek kartı entegrasyonları buraya eklenecek */}
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Ödeme yöntemi">
              {METHOD_ORDER.map(m => {
                const meta = METHOD_META[m];
                const on = method === m;
                return (
                  <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setMethod(m)}
                    className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold spring-btn"
                    style={{
                      background: on ? 'var(--cash-bg)' : 'var(--surface-2)',
                      border: `${on ? 2 : 1}px solid ${on ? 'var(--cash)' : 'var(--line)'}`,
                      color: on ? 'var(--ink)' : 'var(--ink-muted)'
                    }}>
                    <meta.icon size={21} strokeWidth={1.5} className={on ? 'text-cash' : ''} /> {meta.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => setSplitPicker(v => !v)} disabled={remaining <= 0} aria-expanded={splitPicker}
                className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold spring-btn disabled:opacity-45"
                style={{ background: split || splitPicker ? 'var(--cash-bg)' : 'var(--surface-2)', border: `1px solid ${split || splitPicker ? 'var(--cash)' : 'var(--line)'}`, color: 'var(--ink-muted)' }}>
                <Divide size={21} strokeWidth={1.5} /> Böl
              </button>
            </div>

            {splitPicker && (
              <div className="rounded-2xl bg-surface-2 p-3" style={{ border: '1px solid var(--line)' }}>
                <div className="text-xs font-semibold text-ink-muted mb-2">Kaç kişiye eşit bölünsün?</div>
                <div className="flex gap-2">
                  {[2, 3, 4].map(n => (
                    <button key={n} onClick={() => startSplit(n)} className="ui-chip flex-1 py-2.5 rounded-xl text-sm font-bold spring-btn">{n}</button>
                  ))}
                  <input value={customSplit} onChange={e => setCustomSplit(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
                    onKeyDown={e => e.key === 'Enter' && startSplit(parseInt(customSplit, 10))}
                    placeholder="Özel" aria-label="Kişi sayısı" className="ui-input w-16 px-2 py-2 rounded-xl text-sm text-center" />
                  <button onClick={() => startSplit(parseInt(customSplit, 10))} disabled={!customSplit}
                    className="px-3 rounded-xl text-sm font-bold bg-cash text-on-cash disabled:opacity-45">Tamam</button>
                </div>
                {remaining > 0 && (
                  <div className="text-xs text-ink-muted mt-2 tabular-nums">
                    Kişi başı: 2 → {formatPrice(Math.ceil(remaining / 2))} · 3 → {formatPrice(Math.ceil(remaining / 3))} · 4 → {formatPrice(Math.ceil(remaining / 4))}
                  </div>
                )}
              </div>
            )}

            {/* Tutar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="pay-amount" className="text-xs font-semibold text-ink-muted">
                  {amountMode === 'items' ? `Tutar · ${selectedItems.size} ürün seçili`
                    : amountMode === 'split' ? `Tutar · kişi başı pay (${split!.n} kişi)` : 'Tutar'}
                </label>
                <button onClick={() => onAmountChange(toMoneyInput(remaining))} disabled={remaining <= 0}
                  className="text-xs font-bold text-cash px-2 py-1 disabled:opacity-45">Tamamını öde</button>
              </div>
              <div className="relative">
                <input id="pay-amount" inputMode="decimal" autoComplete="off"
                  value={amountMode === 'manual' ? amountStr : toMoneyInput(amountInt)}
                  onChange={e => onAmountChange(e.target.value)}
                  placeholder="0,00"
                  className="ui-input w-full pl-4 pr-12 py-3 rounded-2xl text-2xl font-bold tabular-nums"
                  style={amountTooHigh ? { borderColor: 'var(--state-danger)' } : undefined} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted font-bold">TL</span>
              </div>
              {amountTooHigh && <p className="text-xs text-state-danger font-semibold mt-1">Tutar kalandan ({formatPrice(remaining)}) fazla olamaz.</p>}
            </div>

            {/* Nakitte alınan + para üstü */}
            {method === 'cash' && amountInt > 0 && !amountTooHigh && (
              <div className="rounded-2xl bg-surface-2 p-3 space-y-2" style={{ border: '1px solid var(--line)' }}>
                <div className="flex items-center gap-2">
                  <label htmlFor="pay-received" className="text-xs font-semibold text-ink-muted w-14">Alınan</label>
                  <input id="pay-received" inputMode="decimal" autoComplete="off" value={receivedStr} onChange={e => setReceivedStr(e.target.value)}
                    placeholder={toMoneyInput(amountInt)} className="ui-input flex-1 min-w-0 px-3 py-2 rounded-xl text-lg font-bold tabular-nums" />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {CASH_QUICK.filter(v => v >= amountInt).slice(0, 3).map(v => (
                    <button key={v} onClick={() => setReceivedStr(toMoneyInput(v))} className="ui-chip px-3 py-1.5 rounded-full text-xs font-bold spring-btn tabular-nums">{formatPrice(v)}</button>
                  ))}
                </div>
                {change != null && (
                  change >= 0 ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm font-semibold text-ink-muted">Para üstü</span>
                      <span className="font-serif font-bold text-3xl tabular-nums text-state-ok">{formatPrice(change)}</span>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-state-danger">Alınan tutar eksik: {formatPrice(-change)}</p>
                  )
                )}
              </div>
            )}

            <div className="grid gap-2 grid-cols-2">
              <button onClick={handlePay} disabled={paying || amountInt <= 0 || amountTooHigh || remaining <= 0}
                className={`py-4 rounded-2xl text-base font-bold spring-btn flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed ${payIsPrimary ? primaryBtn : softBtn}`}>
                {paying ? 'İşleniyor…' : <><Wallet size={18} /> Tahsil Et</>}
              </button>
              <button onClick={() => handleCloseTable()} disabled={closing || !canClose}
                title={canClose ? undefined : 'Kalan tutar sıfırlanmadan hesap kapanmaz'}
                className={`py-4 rounded-2xl text-base font-bold spring-btn flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed ${payIsPrimary || !canClose ? softBtn : primaryBtn}`}>
                {closing ? 'Kapatılıyor…' : <><Check size={18} strokeWidth={2.5} /> Hesabı Kapat</>}
              </button>
            </div>
            {!canClose && (
              <p className="text-xs text-ink-muted text-center -mt-1">
                Hesabı kapatmak için kalan <strong className="text-ink tabular-nums">{formatPrice(remaining)}</strong> sıfırlanmalı: tahsil edin, ikram ya da indirim uygulayın.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
