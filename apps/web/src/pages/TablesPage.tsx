// apps/web/src/pages/TablesPage.tsx
// CHANGELOG v4:
// - Birleşik masalar mavi gösterim + grup bağlantı çizgisi
// - Her masa kartında "💳 Ödeme Al" butonu (dolu masada)
// - Ödeme modal: item seçim + nakit/kart/yemek kartı + tahsil + masa kapat
// - merge_group_id ile birleşik masalar gruplanır

import { useEffect, useRef, useState } from 'react';
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

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash', label: 'Nakit', icon: '💵' },
  { value: 'card', label: 'Kredi Kartı', icon: '💳' },
  { value: 'other', label: 'Yemek Kartı', icon: '🎫' },
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
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}>
      <div className="glass-dark w-full max-w-lg rounded-3xl overflow-hidden flex flex-col text-white"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0 border-b border-white/15">
          <div>
            <div className="font-serif font-bold text-lg text-white flex items-center gap-2">
              <i className="fa-solid fa-credit-card text-amber-300 text-base" />
              Ödeme Al — {tableName}
            </div>
            {bill && (
              <div className="text-xs mt-0.5 text-white/65">
                Toplam: <span className="text-amber-300 font-semibold">{formatPrice(bill.total_int)}</span> · Kalan: <span className="text-amber-300 font-semibold">{formatPrice(bill.remaining_int)}</span>
              </div>
            )}
          </div>
          <button onClick={onClose}
            className="glass-pill w-8 h-8 rounded-full flex items-center justify-center spring-btn">
            <i className="fa-solid fa-xmark text-sm" />
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
              <div className="text-[11px] font-semibold mb-2 uppercase tracking-wider text-white/60">
                Ödeme Yöntemi
              </div>
              <div className="flex gap-2 mb-4">
                {PAYMENT_METHODS.map(pm => (
                  <button key={pm.value}
                    onClick={() => setPaymentMethod(pm.value)}
                    className={`flex-1 py-2.5 rounded-2xl text-xs font-semibold spring-btn ${paymentMethod === pm.value ? 'btn-accent' : 'glass-pill text-white/85'}`}>
                    {pm.icon} {pm.label}
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
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
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
                            background: selected ? 'var(--accent-soft)' : 'rgba(255,255,255,0.08)',
                            border: `1.5px solid ${selected ? 'var(--accent)' : 'rgba(255,255,255,0.18)'}`
                          }}>
                          <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: selected ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.1)', border: `1.5px solid ${selected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)'}` }}>
                            {selected && <i className="fa-solid fa-check text-white text-[10px]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white">
                              {item.quantity}x {item.product_name}
                            </div>
                            {item.note && (
                              <div className="text-xs text-amber-200/90">📝 {item.note}</div>
                            )}
                          </div>
                          <div className="text-sm font-bold flex-shrink-0 text-amber-300">
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
                  <div className="text-[11px] font-semibold mb-2 uppercase tracking-wider text-white/45">
                    Tahsil Edildi ({paidItems.length})
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {paidItems.map(item => (
                      <div key={item.item_id}
                        className="flex items-center gap-3 p-3 rounded-2xl opacity-50"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--success-bg)', border: '1.5px solid var(--success)' }}>
                          <i className="fa-solid fa-check text-[10px]" style={{ color: 'var(--success)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold line-through text-white/70">
                            {item.quantity}x {item.product_name}
                          </div>
                        </div>
                        <div className="text-sm font-bold flex-shrink-0 line-through text-white/55">
                          {formatPrice(item.price_int * item.quantity)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {bill.items.length === 0 && (
                <div className="text-center py-8 text-white/50">
                  Bu adisyonda ürün yok.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 flex-shrink-0 border-t border-white/15">
              {/* Seçili tutar */}
              {selectedItems.size > 0 && (
                <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-2xl"
                  style={{ background: 'var(--accent-soft)', border: '1px solid rgba(255,122,41,0.55)' }}>
                  <span className="text-sm font-semibold text-white/90">
                    {selectedItems.size} ürün seçildi
                  </span>
                  <span className="text-base font-extrabold text-amber-300">
                    {formatPrice(selectedTotal)}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => handlePay()}
                  disabled={paying || selectedItems.size === 0}
                  className="btn-accent flex-1 py-3 rounded-2xl text-sm font-bold spring-btn">
                  {paying ? 'İşleniyor...' : `💳 Tahsil Et${selectedItems.size > 0 ? ` (${formatPrice(selectedTotal)})` : ''}`}
                </button>
                <button onClick={() => handleCloseTable()}
                  disabled={closing}
                  className="px-4 py-3 rounded-2xl text-sm font-bold spring-btn"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1.5px solid var(--danger)' }}>
                  {closing ? '...' : '🔒 Kapat'}
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

const DECISION_OPTIONS: { value: OpenOrderDecision; label: string; hint: string; color: string; bg: string }[] = [
  { value: 'customer_left', label: '✖ İptal Et', hint: 'Müşteri kalktı', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  { value: 'no_payment', label: '⚠ Zayi Say', hint: 'Hazırlandı, ödenmedi', color: 'var(--danger)', bg: 'var(--danger-bg)' },
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
          style={{ background: 'var(--danger-bg)', border: '1px solid rgba(251,113,133,0.5)', color: '#FECDD3' }}>
          <i className="fa-solid fa-triangle-exclamation mt-0.5" style={{ color: 'var(--danger)' }} />
          <span>Masa kapatılmadan önce ödenmemiş açık siparişler için karar verin. Karar verilmeden masa kapatılamaz.</span>
        </div>

        <div className="space-y-3 mb-4">
          {orders.map(order => {
            const selected = decisions[order.order_id];
            const hasPaidItems = order.items.some(i => i.is_paid);
            return (
              <div key={order.order_id} className="p-3 rounded-2xl"
                style={{
                  background: selected ? 'var(--accent-soft)' : 'rgba(255,255,255,0.08)',
                  border: `1.5px solid ${selected ? 'var(--accent)' : 'rgba(255,255,255,0.18)'}`
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-white">
                    {order.table_name} · {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--danger)' }}>
                    {formatPrice(order.unpaid_total_int)}
                  </span>
                </div>
                <div className="text-xs mb-2 text-white/65">
                  {order.items.map((i, idx) => (
                    <span key={idx} style={i.is_paid ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                      {idx > 0 ? ', ' : ''}{i.quantity}x {i.product_name}
                    </span>
                  ))}
                </div>
                {hasPaidItems && (
                  <div className="text-xs mb-2 text-amber-200/90">
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
                        color: selected === opt.value ? '#14110F' : opt.color,
                        border: `1.5px solid ${opt.color}`
                      }}>
                      {opt.label}
                      <div style={{ fontWeight: 400, fontSize: 10, opacity: 0.85 }}>{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-4 flex-shrink-0 border-t border-white/15">
        <div className="text-xs mb-2 text-center text-white/60">
          {decidedCount}/{orders.length} sipariş için karar verildi
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={closing}
            className="glass-pill px-4 py-3 rounded-2xl text-sm font-semibold spring-btn">
            Vazgeç
          </button>
          <button onClick={onConfirm}
            disabled={closing || !allDecided}
            className="btn-accent flex-1 py-3 rounded-2xl text-sm font-bold spring-btn">
            {closing ? '...' : '🔒 Kararları Uygula ve Masayı Kapat'}
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
    el.style.boxShadow = '0 0 0 4px #FF7A29, 0 0 32px rgba(255,122,41,0.6)';
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
      <div className="glass-panel rounded-3xl p-6 mb-6 max-w-2xl">
        <h2 className="text-[11px] font-semibold mb-4 uppercase tracking-wider text-white/70 flex items-center gap-2">
          <i className="fa-solid fa-chair text-amber-300" /> Yeni Masa Ekle
        </h2>
        <div className="flex gap-3">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTable()}
            placeholder="Örn: Masa 1, Bahçe 3, VIP..."
            className="glass-input flex-1 min-w-0 px-4 py-2.5 rounded-2xl text-sm" />
          <button onClick={addTable}
            className="btn-accent px-5 py-2.5 rounded-2xl text-sm font-bold spring-btn whitespace-nowrap">+ Ekle</button>
        </div>
      </div>

      {/* İstatistikler */}
      {tables.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="px-4 py-2 rounded-2xl backdrop-blur-md" style={{ background: 'var(--success-bg)', border: '1px solid rgba(52,211,153,0.5)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
              🟢 Boş: {tablesWithSession.filter(t => t.is_active && !t.session).length}
            </span>
          </div>
          <div className="px-4 py-2 rounded-2xl backdrop-blur-md" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(251,113,133,0.5)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
              🔴 Dolu: {tablesWithSession.filter(t => t.is_active && t.session && !t.isMerged).length}
            </span>
          </div>
          {mergeGroups.size > 0 && (
            <div className="px-4 py-2 rounded-2xl backdrop-blur-md" style={{ background: 'var(--info-bg)', border: '1px solid rgba(125,211,252,0.5)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--info)' }}>
                🔵 Birleşik: {[...mergeGroups.values()].reduce((s, v) => s + v.length, 0)} masa
              </span>
            </div>
          )}
          {sessions.length > 0 && (
            <div className="glass-pill px-4 py-2 rounded-2xl">
              <span className="text-xs font-semibold text-amber-300">
                💰 Toplam: {formatPrice(sessions.filter(s => s.status === 'open').reduce((sum, s) => sum + s.cached_total_int, 0))}
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
          <div className="glass-card col-span-full text-center py-16 rounded-3xl" style={{ borderStyle: 'dashed' }}>
            <div className="text-4xl mb-3">🪑</div>
            <p className="text-sm text-white/65">Henüz masa yok</p>
          </div>
        )}
      </div>

      {/* Adisyon Detay Modal */}
      {detailOpen && (
        <div className="fade-enter" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay)', padding: 16 }}
          onClick={() => { setDetailOpen(null); setDetailData(null); }}>
          <div className="glass-dark rounded-3xl text-white" style={{ maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div className="border-b border-white/15" style={{ padding: '20px 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="font-serif text-white flex items-center gap-2" style={{ fontWeight: 700, fontSize: 20 }}>
                <i className="fa-solid fa-receipt text-amber-300 text-base" />
                {detailData?.table?.name ?? 'Masa Detayı'}
              </h3>
              <button onClick={() => { setDetailOpen(null); setDetailData(null); }}
                className="glass-pill spring-btn flex items-center justify-center"
                style={{ width: 32, height: 32, borderRadius: '50%', cursor: 'pointer' }}>
                <i className="fa-solid fa-xmark text-sm" />
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
                      { label: 'Adisyon', value: formatPrice(detailData.session?.cached_total_int ?? 0), color: '#FCD34D', bg: 'var(--accent-soft)' },
                      { label: 'Teslim', value: detailData.orders.filter(o => o.status === 'delivered').length, color: 'var(--success)', bg: 'var(--success-bg)' },
                      { label: 'Bekliyor', value: detailData.orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length, color: 'var(--warning)', bg: 'var(--warning-bg)' },
                    ].map(s => (
                      <div key={s.label} style={{ padding: 10, background: s.bg, borderRadius: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.15)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>{s.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: s.color, marginTop: 2 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {detailData.orders.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, padding: 20 }}>Henüz sipariş yok.</p>
                  ) : detailData.orders.map((order, idx) => (
                    <div key={order.id} style={{ marginBottom: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: order.status === 'delivered' ? 'var(--success-bg)' : 'var(--warning-bg)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: order.status === 'delivered' ? 'var(--success)' : 'var(--warning)' }}>
                          #{idx + 1} · {order.status === 'delivered' ? 'Teslim ✓' : order.status === 'pending' ? 'Bekliyor' : order.status}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ padding: '8px 12px' }}>
                        {order.items.map(item => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                            <span>{item.quantity}x {item.product_name}</span>
                            <span className="text-amber-300" style={{ fontWeight: 600 }}>{formatPrice(item.price_int * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
            {detailData && detailData.session?.status === 'open' && (
              <div className="border-t border-white/15" style={{ padding: '12px 24px 16px', display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    setDetailOpen(null);
                    setDetailData(null);
                    if (detailData?.table) setPaymentSession({ sessionId: detailOpen!, tableName: detailData.table.name });
                  }}
                  className="btn-accent spring-btn"
                  style={{ flex: 1, padding: 12, borderRadius: 16, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  💳 Ödeme Al
                </button>
                <button
                  onClick={() => startCloseFlow(detailOpen!, detailData?.table?.name ?? 'Masa')}
                  className="spring-btn"
                  style={{ flex: 1, padding: 12, borderRadius: 16, border: '1.5px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  🔒 Masayı Kapat
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending sipariş modal */}
      {closeModal && (
        <div className="fade-enter" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay)', padding: 16 }}
          onClick={() => setCloseModal(null)}>
          <div className="glass-dark rounded-3xl text-white" style={{ maxWidth: 440, width: '100%', padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>⚠️</div>
            <h3 className="font-serif text-white" style={{ fontWeight: 700, fontSize: 19, textAlign: 'center', marginBottom: 8 }}>
              Teslim Edilmemiş Sipariş Var
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
              <strong className="text-white">{closeModal.tableName}</strong> masasında <strong className="text-amber-300">{closeModal.pendingCount}</strong> bekleyen sipariş var.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => tryCloseSession(closeModal.sessionId, closeModal.tableName, 'transfer')}
                className="spring-btn"
                style={{ padding: 12, borderRadius: 16, border: '1.5px solid var(--accent)', background: 'var(--accent-soft)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                🔄 Yeni müşteriye ait — yeni masa aç
              </button>
              <button onClick={() => cancelPendingAndOpenPayment(closeModal.sessionId, closeModal.tableName)}
                className="spring-btn"
                style={{ padding: 12, borderRadius: 16, border: '1.5px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                ❌ Bekleyenleri İptal Et ve Ödemeye Geç
              </button>
              <button onClick={() => setCloseModal(null)}
                className="glass-pill spring-btn"
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
  const duration = session ? useDuration(session.opened_at) : null;

  // Renk: mavi=birleşik, kırmızı=dolu, yeşil=boş, gri=pasif
  // Glass varyantları: renkli tint + üst şerit, beyaz metin
  const colors = isPassive
    ? { bg: 'rgba(255,255,255,0.1)', border: 'rgba(255,255,255,0.25)', accent: 'rgba(255,255,255,0.22)', text: 'rgba(255,255,255,0.75)' }
    : isMerged
    ? { bg: 'rgba(14,165,233,0.22)', border: 'rgba(125,211,252,0.6)', accent: 'rgba(14,165,233,0.75)', text: '#7DD3FC' }
    : isOccupied
    ? { bg: 'rgba(244,63,94,0.2)', border: 'rgba(251,113,133,0.55)', accent: 'rgba(225,29,72,0.75)', text: '#FDA4AF' }
    : { bg: 'rgba(16,185,129,0.2)', border: 'rgba(52,211,153,0.55)', accent: 'rgba(5,150,105,0.75)', text: '#6EE7B7' };

  const innerBox = { background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.14)' } as const;
  const smallBtn = { flex: 1, padding: '6px', borderRadius: 10, fontWeight: 600, fontSize: 11, cursor: 'pointer' } as const;

  const statusLabel = isPassive ? 'Pasif'
    : isMerged ? '🔵 Birleşik'
    : isOccupied ? '● Dolu'
    : '○ Boş';

  return (
    <div id={`table-card-${table.id}`} className="glass-card glass-card-hover text-white" style={{
      background: colors.bg,
      border: `1.5px solid ${colors.border}`,
      borderRadius: 24,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      opacity: isPassive ? 0.6 : 1
    }}>
      {/* Üst şerit */}
      <div style={{
        padding: '8px 14px',
        background: colors.accent,
        borderBottom: '1px solid rgba(255,255,255,0.25)',
        color: 'white',
        fontWeight: 700,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>{statusLabel}</span>
        {isOccupied && duration && (
          <span style={{ fontFamily: 'monospace' }}>⏱ {duration}</span>
        )}
      </div>

      <div style={{ padding: 16, flex: 1 }}>
        {editing ? (
          <input value={editingName} onChange={e => onChangeEditName(e.target.value)}
            autoFocus className="glass-input w-full px-3 py-2 rounded-xl text-sm mb-3"
            style={{ borderColor: 'var(--accent)' }} />
        ) : (
          <h3 className="font-serif text-white" style={{ fontWeight: 700, fontSize: 22, lineHeight: 1.1, marginBottom: 12 }}>
            {table.name}
          </h3>
        )}

        {/* Birleşik masa görseli */}
        {isMerged && (
          <div style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--info-bg)', border: '1px solid rgba(125,211,252,0.45)', borderRadius: 12, fontSize: 11, color: 'var(--info)', fontWeight: 600, textAlign: 'center' }}>
            🔗 Birleşik Masa Grubu
          </div>
        )}

        {/* Kaynak masa: siparişler hedef masada, burada adisyon/detay yok */}
        {mergedInto && (
          <div style={{ ...innerBox, marginBottom: 12, padding: '10px', borderRadius: 12, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600, textAlign: 'center' }}>
            Bu masa birleştirildi → <strong style={{ color: 'var(--info)' }}>{mergedInto.tableName}</strong>
          </div>
        )}

        {isOccupied && session && !mergedInto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <div style={{ ...innerBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Adisyon</span>
              <span className="text-amber-300" style={{ fontSize: 16, fontWeight: 800 }}>
                {formatPrice(session.cached_total_int)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ ...innerBox, flex: 1, padding: '5px 8px', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Teslim</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>{session.delivered_count}</div>
              </div>
              <div style={{ ...innerBox, flex: 1, padding: '5px 8px', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Bekliyor</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>{session.pending_count}</div>
              </div>
            </div>
          </div>
        )}

        {!isOccupied && !editing && !isPassive && (
          <div style={{ padding: '14px 8px', textAlign: 'center', background: 'rgba(0,0,0,0.15)', borderRadius: 14, border: '1px dashed rgba(110,231,183,0.55)', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: colors.text, fontWeight: 600 }}>
              <i className="fa-regular fa-clock" style={{ marginRight: 6 }} />Müşteri bekleniyor
            </div>
          </div>
        )}
      </div>

      {/* Butonlar */}
      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.14)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mergedInto && !editing && (
          <button onClick={() => onGoToTable(mergedInto.tableId)}
            className="spring-btn"
            style={{ width: '100%', padding: '9px', borderRadius: 12, border: '1px solid rgba(125,211,252,0.6)', background: 'rgba(14,165,233,0.35)', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            → {mergedInto.tableName} masasına git
          </button>
        )}

        {isOccupied && !editing && !mergedInto && (
          <>
            {/* Ödeme Al butonu */}
            <button onClick={onOpenPayment}
              className="btn-accent spring-btn"
              style={{ width: '100%', padding: '9px', borderRadius: 12, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              💳 Ödeme Al
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onOpenDetail}
                className="glass-pill spring-btn"
                style={{ flex: 1, padding: '7px', borderRadius: 12, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                💰 Detay
              </button>
              <button onClick={onCloseSession}
                className="spring-btn"
                style={{ flex: 1, padding: '7px', borderRadius: 12, border: '1px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                🔒 Kapat
              </button>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button onClick={onSaveEdit} className="btn-accent spring-btn" style={{ ...smallBtn, fontWeight: 700 }}>Kaydet</button>
              <button onClick={onCancelEdit} className="glass-pill spring-btn" style={{ ...smallBtn, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>İptal</button>
            </>
          ) : (
            <>
              <button onClick={onStartEdit} className="glass-pill spring-btn" style={smallBtn}>Düzenle</button>
              <button onClick={onToggleActive} className="glass-pill spring-btn" style={{ ...smallBtn, color: table.is_active ? 'var(--danger)' : 'var(--success)' }}>
                {table.is_active ? 'Pasif' : 'Aktif'}
              </button>
              <button onClick={onDelete} className="spring-btn" style={{ ...smallBtn, border: '1px solid rgba(251,113,133,0.55)', background: 'var(--danger-bg)', color: 'var(--danger)' }}>Sil</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}