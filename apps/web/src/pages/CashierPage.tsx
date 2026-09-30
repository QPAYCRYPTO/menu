// apps/web/src/pages/CashierPage.tsx
// Kasa (Ödemeler) — /admin/kasa
// Solda açık hesaplar (hesap istendi → açık → boş), sağda seçili masanın adisyonu ve ödeme alanı.
// Ödeme akışı Masalar sayfasındaki eski "Ödeme Al" penceresinin aynısı (ürün seçerek tahsil, masayı kapat).
// Telefonda tek sütun: masa seçilince adisyon tam ekran açılır.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Banknote, BadgePercent, Check, CreditCard, Gift, Link2, NotebookPen, Receipt, Ticket, Timer, Wallet,
  type LucideIcon
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrders } from '../context/OrderContext';
import { orderStatusStyle } from '../lib/orderStatus';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { ConfirmModal, type ConfirmState } from '../components/ConfirmModal';
import { OpenOrdersDecisionPanel } from '../components/payment/OpenOrdersDecisionPanel';
import {
  closeTable, getSessionBill, payItems,
  type BillSummary, type OpenOrderDecision, type OpenOrderRequiringDecision, type PaymentMethod
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

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { value: 'cash', label: 'Nakit', icon: Banknote },
  { value: 'card', label: 'Kart', icon: CreditCard },
  { value: 'other', label: 'Yemek Kartı', icon: Ticket },
];

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

  // Canlı siparişler (SSE) değişince hesapları tazele: yeni sipariş, iptal, birleştirme…
  const ordersSignature = activeOrders.map(o => `${o.id}:${o.status}`).join('|');
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

// ─── ADİSYON + ÖDEME PANELİ ──────────────────────────────────────────────────
type BillPanelProps = {
  sessionId: string;
  entry: Entry;
  token: string;
  now: number;
  /** Canlı sipariş listesi değişince adisyonu yeniden çek */
  refreshSignal: string;
  onBack: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
  onAcknowledgeCalls: () => void;
  onClosed: () => void;
};

function BillPanel({ sessionId, entry, token, now, refreshSignal, onBack, onToast, onAcknowledgeCalls, onClosed }: BillPanelProps) {
  const [bill, setBill] = useState<BillSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paying, setPaying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  // Doluysa hesap kapanmadı: ödenmemiş açık siparişler için karar paneli
  const [openOrders, setOpenOrders] = useState<OpenOrderRequiringDecision[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, OpenOrderDecision>>({});

  async function loadBill(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const data = await getSessionBill(token, sessionId);
      setBill(data);
      // Ödenmiş ya da artık listede olmayan seçimleri bırak
      const unpaid = new Set(data.items.filter(i => !i.is_paid).map(i => i.item_id));
      setSelectedItems(prev => new Set([...prev].filter(id => unpaid.has(id))));
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Adisyon yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBill(true); }, [sessionId]);
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) { firstSignal.current = false; return; }
    const t = setTimeout(() => loadBill(), 500);
    return () => clearTimeout(t);
  }, [refreshSignal]);

  function toggleItem(itemId: string) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  const unpaidItems = bill?.items.filter(i => !i.is_paid) ?? [];
  const paidItems = bill?.items.filter(i => i.is_paid) ?? [];
  const allSelected = unpaidItems.length > 0 && unpaidItems.every(i => selectedItems.has(i.item_id));
  const selectedTotal = unpaidItems
    .filter(i => selectedItems.has(i.item_id))
    .reduce((sum, i) => sum + i.price_int * i.quantity, 0);

  async function handlePay() {
    if (selectedItems.size === 0) { onToast('En az 1 ürün seçin.', 'error'); return; }
    setPaying(true);
    try {
      const result = await payItems(token, sessionId, Array.from(selectedItems), paymentMethod);
      onToast(`${formatPrice(selectedTotal)} tahsil edildi. Kalan: ${formatPrice(result.remaining_int)}`, 'success');
      setSelectedItems(new Set());
      await loadBill();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Ödeme alınamadı.', 'error');
    } finally {
      setPaying(false);
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
      if (result.closed_session_ids.length === 0 && !force) {
        setConfirm({
          title: 'Ödenmemiş ürün var',
          message: <><strong>{result.unpaid_items_count}</strong> ürünün ödemesi alınmadı. Yine de hesabı kapatmak istiyor musunuz?</>,
          confirmText: 'Evet, kapat',
          tone: 'warning',
          onConfirm: () => handleCloseTable(true)
        });
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

  // Ürün seçiliyken birincil eylem "Tahsil Et", değilse "Hesabı Kapat"
  const payIsPrimary = selectedItems.size > 0;
  const primaryBtn = 'bg-cash text-on-cash border border-transparent';
  const softBtn = 'bg-cash-bg text-ink border border-[var(--cash)]';

  return (
    <div className="ui-card rounded-3xl flex-1 flex flex-col min-h-0 overflow-hidden">
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />

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
            <div className="font-serif font-bold text-2xl md:text-3xl text-cash tabular-nums">{formatPrice(bill?.total_int ?? entry.totalInt)}</div>
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
      ) : bill && openOrders ? (
        <OpenOrdersDecisionPanel
          orders={openOrders}
          decisions={decisions}
          closing={closing}
          onDecide={(orderId, decision) => setDecisions(prev => ({ ...prev, [orderId]: decision }))}
          onCancel={() => { setOpenOrders(null); setDecisions({}); }}
          onConfirm={() => handleCloseTable(true)}
          onTransfer={transferPending}
        />
      ) : bill ? (
        <>
          {/* Kalemler */}
          <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 min-h-[160px]">
            {unpaidItems.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="ui-eyebrow">Ödenmemiş ({unpaidItems.length})</span>
                  <button onClick={() => setSelectedItems(allSelected ? new Set() : new Set(unpaidItems.map(i => i.item_id)))}
                    className="text-xs font-bold text-cash spring-btn px-2 py-1">
                    {allSelected ? 'Seçimi kaldır' : 'Tümünü seç'}
                  </button>
                </div>
                <div className="space-y-1.5 mb-5">
                  {unpaidItems.map(item => {
                    const sel = selectedItems.has(item.item_id);
                    const st = item.order_status !== 'delivered' ? orderStatusStyle(item.order_status) : null;
                    return (
                      <button type="button" key={item.item_id} onClick={() => toggleItem(item.item_id)}
                        aria-pressed={sel}
                        className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors"
                        style={{
                          background: sel ? 'var(--cash-bg)' : 'var(--surface-2)',
                          border: `1.5px solid ${sel ? 'var(--cash)' : 'var(--line)'}`
                        }}>
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: sel ? 'var(--cash)' : 'var(--surface)', border: `1.5px solid ${sel ? 'var(--cash)' : 'var(--ink-muted)'}` }}>
                          {sel && <Check size={13} strokeWidth={3} className="text-on-cash" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-semibold">
                            {item.quantity}× {item.product_name}
                            {st && (
                              <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                            )}
                          </span>
                          <span className="block text-xs text-ink-muted tabular-nums">{item.quantity} × {formatPrice(item.price_int)}</span>
                          {item.note && (
                            <span className="text-xs text-ink-muted flex items-center gap-1 mt-0.5"><NotebookPen size={11} className="flex-shrink-0" /> {item.note}</span>
                          )}
                        </span>
                        <span className="text-[15px] font-bold tabular-nums flex-shrink-0">{formatPrice(item.price_int * item.quantity)}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {paidItems.length > 0 && (
              <>
                <div className="ui-eyebrow mb-2">Tahsil edildi ({paidItems.length})</div>
                <div className="space-y-1.5">
                  {paidItems.map(item => (
                    <div key={item.item_id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl opacity-55"
                      style={{ background: 'var(--surface-2)', border: '1.5px solid var(--line)' }}>
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 bg-state-ok-bg" style={{ border: '1.5px solid var(--state-ok)' }}>
                        <Check size={13} strokeWidth={3} className="text-state-ok" />
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-semibold line-through text-ink-muted">{item.quantity}× {item.product_name}</span>
                      <span className="text-sm font-bold line-through text-ink-muted tabular-nums">{formatPrice(item.price_int * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {bill.items.length === 0 && (
              <p className="text-center py-10 text-ink-muted">Bu adisyonda ürün yok.</p>
            )}
          </div>

          {/* Özet + ödeme */}
          <div className="border-t border-line px-5 md:px-6 py-4 flex-shrink-0 space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="ui-eyebrow">Kalan</div>
                <div className="font-serif font-bold text-3xl md:text-4xl tabular-nums leading-none mt-1">{formatPrice(bill.remaining_int)}</div>
              </div>
              <div className="text-right">
                <div className="ui-eyebrow">Ödenen</div>
                <div className="font-bold text-lg tabular-nums text-state-ok">{formatPrice(bill.paid_int)}</div>
              </div>
            </div>

            {/* Ödeme yöntemleri — ileride POS / yemek kartı entegrasyonları buraya eklenecek */}
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Ödeme yöntemi">
              {PAYMENT_METHODS.map(pm => {
                const on = paymentMethod === pm.value;
                return (
                  <button key={pm.value} type="button" role="radio" aria-checked={on}
                    onClick={() => setPaymentMethod(pm.value)}
                    className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1 text-sm font-bold spring-btn"
                    style={{
                      background: on ? 'var(--cash-bg)' : 'var(--surface-2)',
                      border: `${on ? 2 : 1}px solid ${on ? 'var(--cash)' : 'var(--line)'}`,
                      color: on ? 'var(--ink)' : 'var(--ink-muted)'
                    }}>
                    <pm.icon size={22} strokeWidth={1.5} className={on ? 'text-cash' : ''} /> {pm.label}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button type="button" disabled title="Yakında"
                className="ui-chip flex-1 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 opacity-50 cursor-not-allowed">
                <BadgePercent size={15} /> İndirim
              </button>
              <button type="button" disabled title="Yakında"
                className="ui-chip flex-1 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 opacity-50 cursor-not-allowed">
                <Gift size={15} /> İkram
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={handlePay} disabled={paying || selectedItems.size === 0}
                className={`py-4 rounded-2xl text-base font-bold spring-btn flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed ${payIsPrimary ? primaryBtn : softBtn}`}>
                {paying ? 'İşleniyor…' : <><Wallet size={18} /> Tahsil Et{selectedItems.size > 0 ? ` · ${formatPrice(selectedTotal)}` : ''}</>}
              </button>
              <button onClick={() => handleCloseTable()} disabled={closing}
                className={`py-4 rounded-2xl text-base font-bold spring-btn flex items-center justify-center gap-2 disabled:opacity-45 ${payIsPrimary ? softBtn : primaryBtn}`}>
                {closing ? 'Kapatılıyor…' : <><Check size={18} strokeWidth={2.5} /> Hesabı Kapat</>}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
