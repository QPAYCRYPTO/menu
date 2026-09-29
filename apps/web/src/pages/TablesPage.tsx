// apps/web/src/pages/TablesPage.tsx
// CHANGELOG v4:
// - Birleşik masalar mavi gösterim + grup bağlantı çizgisi
// - Her masa kartında "💳 Ödeme Al" butonu (dolu masada)
// - Ödeme modal: item seçim + nakit/kart/yemek kartı + tahsil + masa kapat
// - merge_group_id ile birleşik masalar gruplanır

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Armchair, Banknote, Check, Clock, CreditCard, Link2, Lock, Receipt, RefreshCw, Ticket, Timer,
  NotebookPen, Wallet, X, type LucideIcon
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { ConfirmModal, type ConfirmState } from '../components/ConfirmModal';
import {
  getSessionBill,
  payItems,
  closeTable,
  type BillItem,
  type BillSummary,
  type OpenOrderDecision,
  type OpenOrderRequiringDecision,
  type PaymentMethod,
} from '../api/paymentApi';
import { adminMergeSessions, adminMoveSession } from '../api/tableOperationsApi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

type Table = { id: string; name: string; sort_order: number; is_active: boolean; };

type SessionInfo = {
  id: string;
  table_id: string;
  opened_at: string;
  cached_total_int: number;
  status: 'open' | 'closed' | 'merged';
  merge_group_id: string | null;
  merged_into_session_id: string | null;
  table_name: string;
  order_count: number;
  delivered_count: number;
  pending_count: number;
};

type SessionDetail = {
  session: any;
  table: { id: string; name: string } | null;
  orders: Array<{
    id: string; status: string; note: string | null; created_at: string;
    type: string;
    customer_token: string | null;
    items: Array<{ id: string; product_name: string; quantity: number; price_int: number }>;
  }>;
};

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

function formatDuration(openedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}s ${m}dk`;
  if (m > 0) return `${m}dk ${s}sn`;
  return `${s}sn`;
}

function useDuration(openedAt: string) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return formatDuration(openedAt);
}

// ─── ÖDEME MODAL ─────────────────────────────────────────────────────────────
type PaymentModalProps = {
  sessionId: string;
  tableName: string;
  token: string;
  onClose: () => void;
  onTableClosed: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { value: 'cash', label: 'Nakit', icon: Banknote },
  { value: 'card', label: 'Kredi Kartı', icon: CreditCard },
  { value: 'other', label: 'Yemek Kartı', icon: Ticket },
];

function PaymentModal({ sessionId, tableName, token, onClose, onTableClosed, onToast }: PaymentModalProps) {
  const [bill, setBill] = useState<BillSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paying, setPaying] = useState(false);
  const [closing, setClosing] = useState(false);
  // Doluysa masa kapanmadı: ödenmemiş açık siparişler için karar paneli gösterilir
  const [openOrders, setOpenOrders] = useState<OpenOrderRequiringDecision[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, OpenOrderDecision>>({});
  const paymentStartAt = useRef(new Date().toISOString());

  useEffect(() => {
    loadBill();
  }, []);

  async function loadBill() {
    setLoading(true);
    try {
      const data = await getSessionBill(token, sessionId);
      setBill(data);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Adisyon yüklenemedi.', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(itemId: string) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function selectAll() {
    if (!bill) return;
    const unpaid = bill.items.filter(i => !i.is_paid).map(i => i.item_id);
    setSelectedItems(new Set(unpaid));
  }

  async function handlePay() {
    if (selectedItems.size === 0) { onToast('En az 1 ürün seçin.', 'error'); return; }
    setPaying(true);
    try {
      const result = await payItems(token, sessionId, Array.from(selectedItems), paymentMethod);
      onToast(`${selectedItems.size} ürün tahsil edildi. Kalan: ${formatPrice(result.remaining_int)}`, 'success');
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
        // Kararı eksik açık sipariş var → masa kapanmadı, panel açılır (liste değiştiyse güncellenir)
        const ids = new Set(result.open_orders.map(o => o.order_id));
        if (openOrders) onToast('Açık sipariş listesi değişti. Seçimleri kontrol edin.', 'error');
        setOpenOrders(result.open_orders);
        setDecisions(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id))));
        return;
      }
      if (result.closed_session_ids.length === 0 && !force) {
        // Ödenmemiş item var
        const proceed = window.confirm(
          `${result.unpaid_items_count} ödenmemiş ürün var. Yine de masayı kapat?`
        );
        if (proceed) await handleCloseTable(true);
        setClosing(false);
        return;
      }
      onToast('Masa kapatıldı.', 'success');
      onTableClosed();
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Masa kapatılamadı.', 'error');
    } finally {
      setClosing(false);
    }
  }

  const unpaidItems = bill?.items.filter(i => !i.is_paid) ?? [];
  const paidItems = bill?.items.filter(i => i.is_paid) ?? [];
  const selectedTotal = bill?.items
    .filter(i => selectedItems.has(i.item_id))
    .reduce((sum, i) => sum + i.price_int * i.quantity, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-enter"
      style={{ background: 'var(--scrim)' }}
      onClick={onClose}>
      <div className="ui-card w-full max-w-lg rounded-3xl overflow-hidden flex flex-col text-ink"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0 border-b border-line">
          <div>
            <div className="font-serif font-bold text-lg text-ink flex items-center gap-2">
              <CreditCard size={16} className="text-accent" />
              Ödeme Al — {tableName}
            </div>
            {bill && (
              <div className="text-xs mt-0.5 text-ink-muted">
                Toplam: <span className="text-ink font-bold">{formatPrice(bill.total_int)}</span> · Kalan: <span className="text-ink font-bold">{formatPrice(bill.remaining_int)}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Kapat"
            className="ui-chip w-8 h-8 rounded-full flex items-center justify-center spring-btn">
            <X size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : bill && openOrders ? (
          <OpenOrdersDecisionPanel
            orders={openOrders}
            decisions={decisions}
            closing={closing}
            onDecide={(orderId, decision) => setDecisions(prev => ({ ...prev, [orderId]: decision }))}
            onCancel={() => { setOpenOrders(null); setDecisions({}); }}
            onConfirm={() => handleCloseTable(true)}
          />
        ) : bill ? (
          <>
            {/* Ödeme Yöntemi */}
            <div className="px-5 pt-4 flex-shrink-0">
              <div className="text-[11px] font-semibold mb-2 uppercase tracking-wider text-ink-muted">
                Ödeme Yöntemi
              </div>
              <div className="flex gap-2 mb-4">
                {PAYMENT_METHODS.map(pm => (
                  <button key={pm.value}
                    onClick={() => setPaymentMethod(pm.value)}
                    className={`flex-1 py-2.5 rounded-2xl text-xs font-semibold spring-btn flex items-center justify-center gap-1.5 ${paymentMethod === pm.value ? 'btn-primary' : 'ui-chip text-ink-muted'}`}>
                    <pm.icon size={14} /> {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Item Listesi */}
            <div className="flex-1 overflow-y-auto px-5">
              {/* Ödenmemiş */}
              {unpaidItems.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                      Ödenmemiş ({unpaidItems.length})
                    </div>
                    <button onClick={selectAll}
                      className="text-xs font-bold spring-btn"
                      style={{ color: 'var(--accent)' }}>
                      Tümünü Seç
                    </button>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {unpaidItems.map(item => {
                      const selected = selectedItems.has(item.item_id);
                      return (
                        <div key={item.item_id}
                          onClick={() => toggleItem(item.item_id)}
                          className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors"
                          style={{
                            background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
                            border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--line)'}`
                          }}>
                          <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: selected ? 'var(--brand)' : 'var(--surface)', border: `1.5px solid ${selected ? 'var(--brand)' : 'var(--ink-muted)'}` }}>
                            {selected && <Check size={10} strokeWidth={3.5} className="text-on-brand" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-ink">
                              {item.quantity}x {item.product_name}
                            </div>
                            {item.note && (
                              <div className="text-xs text-state-warn font-semibold flex items-center gap-1"><NotebookPen size={12} className="flex-shrink-0" /> {item.note}</div>
                            )}
                          </div>
                          <div className="text-sm font-bold flex-shrink-0 text-ink">
                            {formatPrice(item.price_int * item.quantity)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Ödenmiş */}
              {paidItems.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold mb-2 uppercase tracking-wider text-ink-muted">
                    Tahsil Edildi ({paidItems.length})
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {paidItems.map(item => (
                      <div key={item.item_id}
                        className="flex items-center gap-3 p-3 rounded-2xl opacity-50"
                        style={{ background: 'var(--surface-2)', border: '1.5px solid var(--line)' }}>
                        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--state-ok-bg)', border: '1.5px solid var(--state-ok)' }}>
                          <Check size={10} strokeWidth={3.5} style={{ color: 'var(--state-ok)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold line-through text-ink-muted">
                            {item.quantity}x {item.product_name}
                          </div>
                        </div>
                        <div className="text-sm font-bold flex-shrink-0 line-through text-ink-muted">
                          {formatPrice(item.price_int * item.quantity)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {bill.items.length === 0 && (
                <div className="text-center py-8 text-ink-muted">
                  Bu adisyonda ürün yok.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 flex-shrink-0 border-t border-line">
              {/* Seçili tutar */}
              {selectedItems.size > 0 && (
                <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-2xl"
                  style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                  <span className="text-sm font-semibold text-ink-muted">
                    {selectedItems.size} ürün seçildi
                  </span>
                  <span className="text-base font-extrabold text-ink">
                    {formatPrice(selectedTotal)}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => handlePay()}
                  disabled={paying || selectedItems.size === 0}
                  className="btn-primary flex-1 py-3 rounded-2xl text-sm font-bold spring-btn flex items-center justify-center gap-1.5">
                  {paying ? 'İşleniyor...' : <><CreditCard size={14} /> {`Tahsil Et${selectedItems.size > 0 ? ` (${formatPrice(selectedTotal)})` : ''}`}</>}
                </button>
                <button onClick={() => handleCloseTable()}
                  disabled={closing}
                  className="px-4 py-3 rounded-2xl text-sm font-bold spring-btn flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1.5px solid var(--state-danger)' }}>
                  {closing ? '...' : <><Lock size={14} /> Kapat</>}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── AÇIK SİPARİŞ KARAR PANELİ ───────────────────────────────────────────────
// Ödenmemiş ürünü olan, teslim edilmemiş her sipariş için "İptal Et" veya "Zayi Say"
// seçilmeden masa kapatılamaz (backend de aynı kuralı zorunlu tutar).
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
};

const DECISION_OPTIONS: { value: OpenOrderDecision; label: string; icon: LucideIcon; hint: string; color: string; bg: string }[] = [
  { value: 'customer_left', label: 'İptal Et', icon: X, hint: 'Müşteri kalktı', color: 'var(--state-warn)', bg: 'var(--state-warn-bg)' },
  { value: 'no_payment', label: 'Zayi Say', icon: AlertTriangle, hint: 'Hazırlandı, ödenmedi', color: 'var(--state-danger)', bg: 'var(--state-danger-bg)' },
];

function OpenOrdersDecisionPanel({ orders, decisions, closing, onDecide, onCancel, onConfirm }: {
  orders: OpenOrderRequiringDecision[];
  decisions: Record<string, OpenOrderDecision>;
  closing: boolean;
  onDecide: (orderId: string, decision: OpenOrderDecision) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const decidedCount = orders.filter(o => decisions[o.order_id]).length;
  const allDecided = decidedCount === orders.length;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pt-4">
        <div className="mb-3 px-3 py-2.5 rounded-2xl text-xs font-semibold flex gap-2 items-start"
          style={{ background: 'var(--state-danger-bg)', color: 'var(--ink)' }}>
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--state-danger)' }} />
          <span>Masa kapatılmadan önce ödenmemiş açık siparişler için karar verin. Karar verilmeden masa kapatılamaz.</span>
        </div>

        <div className="space-y-3 mb-4">
          {orders.map(order => {
            const selected = decisions[order.order_id];
            const hasPaidItems = order.items.some(i => i.is_paid);
            return (
              <div key={order.order_id} className="p-3 rounded-2xl"
                style={{
                  background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
                  border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--line)'}`
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-ink">
                    {order.table_name} · {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--state-danger)' }}>
                    {formatPrice(order.unpaid_total_int)}
                  </span>
                </div>
                <div className="text-xs mb-2 text-ink-muted">
                  {order.items.map((i, idx) => (
                    <span key={idx} style={i.is_paid ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                      {idx > 0 ? ', ' : ''}{i.quantity}x {i.product_name}
                    </span>
                  ))}
                </div>
                {hasPaidItems && (
                  <div className="text-xs mb-2 text-state-warn font-semibold">
                    Bu siparişte ödenmiş ürün de var; sipariş bütün olarak iptal edilir.
                  </div>
                )}
                <div className="flex gap-2">
                  {DECISION_OPTIONS.map(opt => (
                    <button key={opt.value}
                      onClick={() => onDecide(order.order_id, opt.value)}
                      className="flex-1 py-2 rounded-2xl text-xs font-semibold spring-btn"
                      style={{
                        background: selected === opt.value ? opt.color : opt.bg,
                        color: selected === opt.value ? 'var(--bg)' : opt.color,
                        border: `1.5px solid ${opt.color}`
                      }}>
                      <span className="inline-flex items-center gap-1"><opt.icon size={12} strokeWidth={2.5} /> {opt.label}</span>
                      <div style={{ fontWeight: 400, fontSize: 10, opacity: 0.85 }}>{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-4 flex-shrink-0 border-t border-line">
        <div className="text-xs mb-2 text-center text-ink-muted">
          {decidedCount}/{orders.length} sipariş için karar verildi
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={closing}
            className="ui-chip px-4 py-3 rounded-2xl text-sm font-semibold spring-btn">
            Vazgeç
          </button>
          <button onClick={onConfirm}
            disabled={closing || !allDecided}
            className="btn-primary flex-1 py-3 rounded-2xl text-sm font-bold spring-btn flex items-center justify-center gap-1.5">
            {closing ? '...' : <><Lock size={14} /> Kararları Uygula ve Masayı Kapat</>}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────
export function TablesPage() {
  const { accessToken } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [detailOpen, setDetailOpen] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [closeModal, setCloseModal] = useState<{ sessionId: string; tableName: string; pendingCount: number } | null>(null);

  // Ödeme modal
  const [paymentSession, setPaymentSession] = useState<{ sessionId: string; tableName: string } | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  async function loadTables() {
    try {
      const data = await apiRequest<Table[]>('/admin/tables', { token: accessToken });
      setTables(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Masalar alınamadı.', 'error');
    }
  }

  async function loadSessions() {
    try {
      const data = await apiRequest<SessionInfo[]>('/admin/sessions', { token: accessToken });
      setSessions(data);
    } catch {}
  }

  useEffect(() => {
    loadTables();
    loadSessions();
    pollingRef.current = setInterval(loadSessions, 10000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [accessToken]);

  async function addTable() {
    const name = newName.trim();
    if (!name) { showToast('Masa adı boş olamaz.', 'error'); return; }
    try {
      await apiRequest('/admin/tables', { method: 'POST', token: accessToken, body: { name } });
      setNewName('');
      await loadTables();
      showToast('Masa eklendi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Masa eklenemedi.', 'error');
    }
  }

  async function saveTable(table: Table) {
    const name = editingName.trim();
    if (!name) { showToast('Masa adı boş olamaz.', 'error'); return; }
    try {
      await apiRequest(`/admin/tables/${table.id}`, { method: 'PUT', token: accessToken, body: { name } });
      setEditingId(null);
      await loadTables();
      showToast('Masa güncellendi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi.', 'error');
    }
  }

  async function toggleActive(table: Table) {
    try {
      await apiRequest(`/admin/tables/${table.id}`, { method: 'PUT', token: accessToken, body: { is_active: !table.is_active } });
      await loadTables();
      showToast(table.is_active ? 'Masa pasif yapıldı.' : 'Masa aktif yapıldı.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi.', 'error');
    }
  }

  function askDeleteTable(table: Table) {
    setConfirm({
      title: 'Masayı Sil?',
      message: <><strong>{table.name}</strong> kalıcı olarak pasif yapılacak.</>,
      confirmText: 'Evet, Sil',
      tone: 'danger',
      onConfirm: async () => {
        await apiRequest(`/admin/tables/${table.id}`, { method: 'DELETE', token: accessToken });
        await loadTables();
        showToast('Masa silindi.', 'success');
      }
    });
  }

  async function openDetail(sessionId: string) {
    setDetailOpen(sessionId);
    setDetailLoading(true);
    try {
      const data = await apiRequest<SessionDetail>(`/admin/sessions/${sessionId}`, { token: accessToken });
      setDetailData(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Detay yüklenemedi.', 'error');
      setDetailOpen(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function tryCloseSession(sessionId: string, tableName: string, action: 'close' | 'transfer' | 'cancel_pending' = 'close') {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.status === 409) {
        const body = await res.json();
        setCloseModal({ sessionId, tableName, pendingCount: body.pending_count });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Hata' }));
        throw new Error(body.message);
      }
      await loadSessions();
      setDetailOpen(null);
      setDetailData(null);
      setCloseModal(null);
      showToast('Masa kapatıldı.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Masa kapatılamadı.', 'error');
    }
  }

  // Kapat: masa artık buradan doğrudan kapatılmaz (sessions/:id/close çağrılmaz).
  // Bekleyen sipariş varsa seçenek modalı (yeni müşteri / iptal et ve ödemeye geç),
  // yoksa ödeme ekranı açılır; ödenmemiş ürün kontrolü ve kapatma orada yapılır.
  async function startCloseFlow(sessionId: string, tableName: string) {
    try {
      const detail = await apiRequest<SessionDetail>(`/admin/sessions/${sessionId}`, { token: accessToken });
      const pendingCount = detail.orders.filter(o =>
        o.type === 'order' && ['pending', 'preparing', 'ready'].includes(o.status)
      ).length;
      if (pendingCount > 0) {
        setCloseModal({ sessionId, tableName, pendingCount });
        return;
      }
      setDetailOpen(null);
      setDetailData(null);
      setPaymentSession({ sessionId, tableName });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Masa bilgisi alınamadı.', 'error');
    }
  }

  // Bekleyen siparişleri tek tek iptal et (customer_left), masayı KAPATMA → ödeme ekranını aç.
  // Kapatma ödeme ekranından yapılır (ödenmemiş ürün kontrolü + açık sipariş karar paneli orada).
  async function cancelPendingAndOpenPayment(sessionId: string, tableName: string) {
    try {
      const detail = await apiRequest<SessionDetail>(`/admin/sessions/${sessionId}`, { token: accessToken });
      const pendingOrders = detail.orders.filter(o =>
        o.type === 'order' && ['pending', 'preparing', 'ready'].includes(o.status)
      );
      await Promise.all(pendingOrders.map(o =>
        apiRequest(`/admin/orders/${o.id}/cancel`, {
          method: 'POST',
          token: accessToken,
          body: { reason_code: 'customer_left' }
        })
      ));
      setCloseModal(null);
      setDetailOpen(null);
      setDetailData(null);
      await loadSessions();
      setPaymentSession({ sessionId, tableName });
      showToast(`${pendingOrders.length} bekleyen sipariş iptal edildi. Ödemeyi alıp masayı kapatın.`, 'success');
    } catch (e) {
      await loadSessions();
      showToast(e instanceof Error ? e.message : 'Bekleyen siparişler iptal edilemedi.', 'error');
    }
  }

  // Birleşik kaynak masadan hedef masanın kartına kaydır ve kısa süre vurgula
  function goToTableCard(tableId: string) {
    const el = document.getElementById(`table-card-${tableId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.boxShadow = '0 0 0 4px var(--accent), 0 0 32px color-mix(in srgb, var(--accent) 50%, transparent)';
    setTimeout(() => { el.style.boxShadow = ''; }, 1600);
  }

  // Birleşik masa gruplarını hesapla
  const mergeGroups = new Map<string, string[]>(); // group_id → table_id[]
  sessions.forEach(s => {
    if (s.merge_group_id) {
      const existing = mergeGroups.get(s.merge_group_id) ?? [];
      existing.push(s.table_id);
      mergeGroups.set(s.merge_group_id, existing);
    }
  });

  const tablesWithSession = tables.map(t => {
    const session = sessions.find(s => s.table_id === t.id);
    const isMerged = session?.merge_group_id != null;

    // Birleşik masada ödeme ve detay, zincirin sonundaki açık (target) session üzerinden
    let paymentSessionInfo = session;
    const seen = new Set<string>();
    while (paymentSessionInfo?.status === 'merged' && paymentSessionInfo.merged_into_session_id
      && !seen.has(paymentSessionInfo.id)) {
      seen.add(paymentSessionInfo.id);
      const targetId: string = paymentSessionInfo.merged_into_session_id;
      paymentSessionInfo = sessions.find(s => s.id === targetId) ?? paymentSessionInfo;
    }

    // Kaynak (merged) masa: siparişleri hedef masada → kartta hedefe yönlendirme gösterilir
    const mergedInto = session?.status === 'merged' && paymentSessionInfo?.status === 'open'
      && paymentSessionInfo.id !== session.id
      ? { tableId: paymentSessionInfo.table_id, tableName: paymentSessionInfo.table_name }
      : null;

    return { ...t, session, isMerged, mergeGroupId: session?.merge_group_id ?? null, paymentSessionInfo, mergedInto };
  });

  // Merge group'larını renk/sıra için indexle
  const mergeGroupIndex = new Map<string, number>();
  let mgIdx = 0;
  mergeGroups.forEach((_, gid) => { mergeGroupIndex.set(gid, mgIdx++); });

  return (
    <div>
      <Toast state={toast} />
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />

      {/* Masa Ekle */}
      <div className="ui-card rounded-3xl p-6 mb-6 max-w-2xl">
        <h2 className="text-[11px] font-semibold mb-4 uppercase tracking-wider text-ink-muted flex items-center gap-2">
          <Armchair size={14} className="text-accent" /> Yeni Masa Ekle
        </h2>
        <div className="flex gap-3">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTable()}
            placeholder="Örn: Masa 1, Bahçe 3, VIP..."
            className="ui-input flex-1 min-w-0 px-4 py-2.5 rounded-2xl text-sm" />
          <button onClick={addTable}
            className="btn-primary px-5 py-2.5 rounded-2xl text-sm font-bold spring-btn whitespace-nowrap">+ Ekle</button>
        </div>
      </div>

      {/* İstatistikler */}
      {tables.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          {/* Masa durum renkleri garson ekranıyla aynı: Boş yeşil, Dolu amber, Birleşik mavi */}
          <div className="px-4 py-2 rounded-full bg-state-ok-bg text-state-ok">
            <span className="text-xs font-bold inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-current" /> Boş: {tablesWithSession.filter(t => t.is_active && !t.session).length}
            </span>
          </div>
          <div className="px-4 py-2 rounded-full bg-state-warn-bg text-state-warn">
            <span className="text-xs font-bold inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-current" /> Dolu: {tablesWithSession.filter(t => t.is_active && t.session && !t.isMerged).length}
            </span>
          </div>
          {mergeGroups.size > 0 && (
            <div className="px-4 py-2 rounded-full bg-state-info-bg text-state-info">
              <span className="text-xs font-bold inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-current" /> Birleşik: {[...mergeGroups.values()].reduce((s, v) => s + v.length, 0)} masa
              </span>
            </div>
          )}
          {sessions.length > 0 && (
            <div className="bg-brand text-on-brand px-4 py-2 rounded-full">
              <span className="text-xs font-bold inline-flex items-center gap-1.5">
                <Wallet size={12} /> Toplam: {formatPrice(sessions.filter(s => s.status === 'open').reduce((sum, s) => sum + s.cached_total_int, 0))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Masa Kartları */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {tablesWithSession.map(table => (
          <TableCard
            key={table.id}
            table={table}
            session={table.session}
            isMerged={table.isMerged}
            mergeGroupId={table.mergeGroupId}
            mergedInto={table.mergedInto}
            onGoToTable={goToTableCard}
            editing={editingId === table.id}
            editingName={editingName}
            onStartEdit={() => { setEditingId(table.id); setEditingName(table.name); }}
            onChangeEditName={setEditingName}
            onSaveEdit={() => saveTable(table)}
            onCancelEdit={() => { setEditingId(null); setEditingName(''); }}
            onToggleActive={() => toggleActive(table)}
            onDelete={() => askDeleteTable(table)}
            onOpenDetail={() => table.paymentSessionInfo && openDetail(table.paymentSessionInfo.id)}
            onCloseSession={() => table.session && startCloseFlow(table.session.id, table.name)}
            onOpenPayment={() => table.paymentSessionInfo && setPaymentSession({ 
              sessionId: table.paymentSessionInfo.id, 
              tableName: table.paymentSessionInfo.table_name 
            })}
          />
        ))}

        {tables.length === 0 && (
          <div className="ui-card col-span-full text-center py-16 rounded-3xl" style={{ borderStyle: 'dashed' }}>
            <div className="mb-3 flex justify-center text-ink-muted"><Armchair size={36} strokeWidth={1.5} /></div>
            <p className="text-sm text-ink-muted">Henüz masa yok</p>
          </div>
        )}
      </div>

      {/* Adisyon Detay Modal */}
      {detailOpen && (
        <div className="fade-enter" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--scrim)', padding: 16 }}
          onClick={() => { setDetailOpen(null); setDetailData(null); }}>
          <div className="ui-card rounded-3xl text-ink" style={{ maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div className="border-b border-line" style={{ padding: '20px 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="font-serif text-ink flex items-center gap-2" style={{ fontWeight: 700, fontSize: 20 }}>
                <Receipt size={16} className="text-accent" />
                {detailData?.table?.name ?? 'Masa Detayı'}
              </h3>
              <button onClick={() => { setDetailOpen(null); setDetailData(null); }} aria-label="Kapat"
                className="ui-chip spring-btn flex items-center justify-center"
                style={{ width: 32, height: 32, borderRadius: '50%', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto"
                    style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                </div>
              ) : detailData ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                    {[
                      { label: 'Adisyon', value: formatPrice(detailData.session?.cached_total_int ?? 0), color: 'var(--ink)', bg: 'var(--surface-2)' },
                      { label: 'Teslim', value: detailData.orders.filter(o => o.status === 'delivered').length, color: 'var(--state-ok)', bg: 'var(--state-ok-bg)' },
                      { label: 'Bekliyor', value: detailData.orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length, color: 'var(--state-warn)', bg: 'var(--state-warn-bg)' },
                    ].map(s => (
                      <div key={s.label} style={{ padding: 10, background: s.bg, borderRadius: 14, textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>{s.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: s.color, marginTop: 2 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {detailData.orders.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13, padding: 20 }}>Henüz sipariş yok.</p>
                  ) : detailData.orders.map((order, idx) => (
                    <div key={order.id} style={{ marginBottom: 10, border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 16, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: order.status === 'delivered' ? 'var(--state-ok-bg)' : 'var(--state-warn-bg)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: order.status === 'delivered' ? 'var(--state-ok)' : 'var(--state-warn)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          #{idx + 1} · {order.status === 'delivered' ? <>Teslim <Check size={12} strokeWidth={3} /></> : order.status === 'pending' ? 'Bekliyor' : order.status}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                          {new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ padding: '8px 12px' }}>
                        {order.items.map(item => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: 'var(--ink)' }}>
                            <span>{item.quantity}x {item.product_name}</span>
                            <span style={{ fontWeight: 700 }}>{formatPrice(item.price_int * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
            {detailData && detailData.session?.status === 'open' && (
              <div className="border-t border-line" style={{ padding: '12px 24px 16px', display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    setDetailOpen(null);
                    setDetailData(null);
                    if (detailData?.table) setPaymentSession({ sessionId: detailOpen!, tableName: detailData.table.name });
                  }}
                  className="btn-primary spring-btn flex items-center justify-center gap-1.5"
                  style={{ flex: 1, padding: 12, borderRadius: 16, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  <CreditCard size={16} /> Ödeme Al
                </button>
                <button
                  onClick={() => startCloseFlow(detailOpen!, detailData?.table?.name ?? 'Masa')}
                  className="spring-btn flex items-center justify-center gap-1.5"
                  style={{ flex: 1, padding: 12, borderRadius: 16, border: '1.5px solid var(--state-danger)', background: 'var(--state-danger-bg)', color: 'var(--state-danger)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  <Lock size={16} /> Masayı Kapat
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending sipariş modal */}
      {closeModal && (
        <div className="fade-enter" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--scrim)', padding: 16 }}
          onClick={() => setCloseModal(null)}>
          <div className="ui-card rounded-3xl text-ink" style={{ maxWidth: 440, width: '100%', padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: 'var(--state-warn)' }}><AlertTriangle size={32} /></div>
            <h3 className="font-serif text-ink" style={{ fontWeight: 700, fontSize: 19, textAlign: 'center', marginBottom: 8 }}>
              Teslim Edilmemiş Sipariş Var
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
              <strong className="text-ink">{closeModal.tableName}</strong> masasında <strong className="text-state-warn">{closeModal.pendingCount}</strong> bekleyen sipariş var.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => tryCloseSession(closeModal.sessionId, closeModal.tableName, 'transfer')}
                className="spring-btn flex items-center gap-2"
                style={{ padding: 12, borderRadius: 16, border: '1.5px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                <RefreshCw size={14} className="flex-shrink-0" /> Yeni müşteriye ait — yeni masa aç
              </button>
              <button onClick={() => cancelPendingAndOpenPayment(closeModal.sessionId, closeModal.tableName)}
                className="spring-btn flex items-center gap-2"
                style={{ padding: 12, borderRadius: 16, border: '1.5px solid var(--state-danger)', background: 'var(--state-danger-bg)', color: 'var(--state-danger)', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                <X size={14} strokeWidth={3} className="flex-shrink-0" /> Bekleyenleri İptal Et ve Ödemeye Geç
              </button>
              <button onClick={() => setCloseModal(null)}
                className="ui-chip spring-btn"
                style={{ padding: 12, borderRadius: 16, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ödeme Modal */}
      {paymentSession && accessToken && (
        <PaymentModal
          sessionId={paymentSession.sessionId}
          tableName={paymentSession.tableName}
          token={accessToken}
          onClose={() => setPaymentSession(null)}
          onTableClosed={() => { loadSessions(); loadTables(); }}
          onToast={showToast}
        />
      )}
    </div>
  );
}

// ─── MASA KARTI ───────────────────────────────────────────────────────────────
type TableCardProps = {
  table: { id: string; name: string; sort_order: number; is_active: boolean };
  session: SessionInfo | undefined;
  isMerged: boolean;
  mergeGroupId: string | null;
  mergedInto: { tableId: string; tableName: string } | null;
  onGoToTable: (tableId: string) => void;
  editing: boolean;
  editingName: string;
  onStartEdit: () => void;
  onChangeEditName: (name: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
  onCloseSession: () => void;
  onOpenPayment: () => void;
};

function TableCard({
  table, session, isMerged, mergeGroupId, mergedInto, onGoToTable,
  editing, editingName,
  onStartEdit, onChangeEditName, onSaveEdit, onCancelEdit,
  onToggleActive, onDelete, onOpenDetail, onCloseSession, onOpenPayment
}: TableCardProps) {
  const isOccupied = !!session;
  const isPassive = !table.is_active;
  // Hook her render'da çağrılır (koşullu çağrı masa dolunca "hook sayısı değişti" hatası verirdi)
  const elapsed = useDuration(session?.opened_at ?? new Date().toISOString());
  const duration = session ? elapsed : null;

  // Durum renkleri garson ekranıyla aynı: Boş yeşil, Dolu amber, Birleşik mavi, Pasif gri
  const tone = isPassive
    ? { color: 'var(--ink-muted)', bg: 'var(--surface-2)', label: 'Pasif' }
    : isMerged
    ? { color: 'var(--state-info)', bg: 'var(--state-info-bg)', label: 'Birleşik' }
    : isOccupied
    ? { color: 'var(--state-warn)', bg: 'var(--state-warn-bg)', label: 'Dolu' }
    : { color: 'var(--state-ok)', bg: 'var(--state-ok-bg)', label: 'Boş' };

  const innerBox = { background: 'var(--surface-2)' } as const;
  const smallBtn = { flex: 1, padding: '6px', borderRadius: 10, fontWeight: 600, fontSize: 11, cursor: 'pointer' } as const;

  return (
    <div id={`table-card-${table.id}`} className="ui-card text-ink" style={{
      borderColor: isPassive ? 'var(--line)' : tone.color,
      borderRadius: 24,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      opacity: isPassive ? 0.6 : 1
    }}>
      {/* Durum hapı + süre */}
      <div style={{ padding: '12px 14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: tone.bg, color: tone.color }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'currentColor' }} /> {tone.label}
        </span>
        {isOccupied && duration && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted" style={{ fontFamily: 'monospace' }}><Timer size={12} /> {duration}</span>
        )}
      </div>

      <div style={{ padding: 16, flex: 1 }}>
        {editing ? (
          <input value={editingName} onChange={e => onChangeEditName(e.target.value)}
            autoFocus className="ui-input w-full px-3 py-2 rounded-xl text-sm mb-3"
            style={{ borderColor: 'var(--accent)' }} />
        ) : (
          <h3 className="font-serif text-ink" style={{ fontWeight: 700, fontSize: 22, lineHeight: 1.1, marginBottom: 12 }}>
            {table.name}
          </h3>
        )}

        {/* Birleşik masa görseli */}
        {isMerged && (
          <div style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--state-info-bg)', borderRadius: 12, fontSize: 11, color: 'var(--state-info)', fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Link2 size={12} /> Birleşik Masa Grubu
          </div>
        )}

        {/* Kaynak masa: siparişler hedef masada, burada adisyon/detay yok */}
        {mergedInto && (
          <div style={{ ...innerBox, marginBottom: 12, padding: '10px', borderRadius: 12, fontSize: 12, color: 'var(--ink)', fontWeight: 600, textAlign: 'center' }}>
            Bu masa birleştirildi → <strong style={{ color: 'var(--state-info)' }}>{mergedInto.tableName}</strong>
          </div>
        )}

        {isOccupied && session && !mergedInto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <div style={{ ...innerBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 600 }}>Adisyon</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>
                {formatPrice(session.cached_total_int)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ ...innerBox, flex: 1, padding: '5px 8px', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Teslim</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--state-ok)' }}>{session.delivered_count}</div>
              </div>
              <div style={{ ...innerBox, flex: 1, padding: '5px 8px', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Bekliyor</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--state-warn)' }}>{session.pending_count}</div>
              </div>
            </div>
          </div>
        )}

        {!isOccupied && !editing && !isPassive && (
          <div style={{ padding: '14px 8px', textAlign: 'center', borderRadius: 14, border: '1px dashed var(--line)', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--state-ok)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={11} style={{ marginRight: 6 }} />Müşteri bekleniyor
            </div>
          </div>
        )}
      </div>

      {/* Butonlar */}
      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mergedInto && !editing && (
          <button onClick={() => onGoToTable(mergedInto.tableId)}
            className="spring-btn"
            style={{ width: '100%', padding: '9px', borderRadius: 12, border: '1px solid var(--state-info)', background: 'var(--state-info-bg)', color: 'var(--state-info)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            → {mergedInto.tableName} masasına git
          </button>
        )}

        {isOccupied && !editing && !mergedInto && (
          <>
            {/* Ödeme Al butonu */}
            <button onClick={onOpenPayment}
              className="btn-primary spring-btn flex items-center justify-center gap-1.5"
              style={{ width: '100%', padding: '9px', borderRadius: 12, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              <CreditCard size={12} /> Ödeme Al
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onOpenDetail}
                className="btn-outline spring-btn flex items-center justify-center gap-1"
                style={{ flex: 1, padding: '7px', borderRadius: 12, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                <Receipt size={11} /> Detay
              </button>
              <button onClick={onCloseSession}
                className="spring-btn flex items-center justify-center gap-1"
                style={{ flex: 1, padding: '7px', borderRadius: 12, border: '1px solid var(--state-danger)', background: 'var(--state-danger-bg)', color: 'var(--state-danger)', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                <Lock size={11} /> Kapat
              </button>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button onClick={onSaveEdit} className="btn-primary spring-btn" style={{ ...smallBtn, fontWeight: 700 }}>Kaydet</button>
              <button onClick={onCancelEdit} className="btn-outline spring-btn" style={{ ...smallBtn, fontWeight: 700 }}>İptal</button>
            </>
          ) : (
            <>
              <button onClick={onStartEdit} className="btn-outline spring-btn" style={smallBtn}>Düzenle</button>
              <button onClick={onToggleActive} className="btn-outline spring-btn" style={{ ...smallBtn, color: table.is_active ? 'var(--state-danger)' : 'var(--state-ok)' }}>
                {table.is_active ? 'Pasif' : 'Aktif'}
              </button>
              <button onClick={onDelete} className="spring-btn" style={{ ...smallBtn, border: '1px solid transparent', background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}>Sil</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}