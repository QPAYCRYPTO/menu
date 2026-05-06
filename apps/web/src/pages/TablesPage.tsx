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
      const result = await closeTable(token, sessionId, force);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.75)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid #E2E8F0', background: '#0F172A' }}>
          <div>
            <div className="font-bold text-base text-white" style={{ fontFamily: 'Georgia, serif' }}>
              💳 Ödeme Al — {tableName}
            </div>
            {bill && (
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Toplam: {formatPrice(bill.total_int)} · Kalan: {formatPrice(bill.remaining_int)}
              </div>
            )}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#0D9488', borderTopColor: 'transparent' }} />
          </div>
        ) : bill ? (
          <>
            {/* Ödeme Yöntemi */}
            <div className="px-5 pt-4 flex-shrink-0">
              <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#64748B' }}>
                Ödeme Yöntemi
              </div>
              <div className="flex gap-2 mb-4">
                {PAYMENT_METHODS.map(pm => (
                  <button key={pm.value}
                    onClick={() => setPaymentMethod(pm.value)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold"
                    style={{
                      background: paymentMethod === pm.value ? '#0D9488' : '#F1F5F9',
                      color: paymentMethod === pm.value ? 'white' : '#0F172A',
                      border: `2px solid ${paymentMethod === pm.value ? '#0D9488' : 'transparent'}`
                    }}>
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
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
                      Ödenmemiş ({unpaidItems.length})
                    </div>
                    <button onClick={selectAll}
                      className="text-xs font-semibold"
                      style={{ color: '#0D9488' }}>
                      Tümünü Seç
                    </button>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {unpaidItems.map(item => {
                      const selected = selectedItems.has(item.item_id);
                      return (
                        <div key={item.item_id}
                          onClick={() => toggleItem(item.item_id)}
                          className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                          style={{
                            background: selected ? '#F0FDFA' : '#F8FAFC',
                            border: `1.5px solid ${selected ? '#0D9488' : '#E2E8F0'}`
                          }}>
                          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                            style={{ background: selected ? '#0D9488' : 'white', border: `2px solid ${selected ? '#0D9488' : '#CBD5E1'}` }}>
                            {selected && <span className="text-white text-xs">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                              {item.quantity}x {item.product_name}
                            </div>
                            {item.note && (
                              <div className="text-xs" style={{ color: '#92400E' }}>📝 {item.note}</div>
                            )}
                          </div>
                          <div className="text-sm font-bold flex-shrink-0" style={{ color: '#0D9488' }}>
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
                  <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                    Tahsil Edildi ({paidItems.length})
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {paidItems.map(item => (
                      <div key={item.item_id}
                        className="flex items-center gap-3 p-3 rounded-xl opacity-50"
                        style={{ background: '#F1F5F9', border: '1.5px solid #E2E8F0' }}>
                        <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                          style={{ background: '#16A34A' }}>
                          <span className="text-white text-xs">✓</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold line-through" style={{ color: '#64748B' }}>
                            {item.quantity}x {item.product_name}
                          </div>
                        </div>
                        <div className="text-sm font-bold flex-shrink-0 line-through" style={{ color: '#94A3B8' }}>
                          {formatPrice(item.price_int * item.quantity)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {bill.items.length === 0 && (
                <div className="text-center py-8" style={{ color: '#94A3B8' }}>
                  Bu adisyonda ürün yok.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid #E2E8F0' }}>
              {/* Seçili tutar */}
              {selectedItems.size > 0 && (
                <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl"
                  style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
                  <span className="text-sm font-semibold" style={{ color: '#0F766E' }}>
                    {selectedItems.size} ürün seçildi
                  </span>
                  <span className="text-base font-bold" style={{ color: '#0D9488' }}>
                    {formatPrice(selectedTotal)}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => handlePay()}
                  disabled={paying || selectedItems.size === 0}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: selectedItems.size === 0 || paying ? '#94A3B8' : '#0D9488' }}>
                  {paying ? 'İşleniyor...' : `💳 Tahsil Et${selectedItems.size > 0 ? ` (${formatPrice(selectedTotal)})` : ''}`}
                </button>
                <button onClick={() => handleCloseTable()}
                  disabled={closing}
                  className="px-4 py-3 rounded-xl text-sm font-bold"
                  style={{ background: '#FEF2F2', color: '#DC2626', border: '1.5px solid #FECACA' }}>
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
    return { ...t, session, isMerged, mergeGroupId: session?.merge_group_id ?? null };
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
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm max-w-2xl" style={{ border: '1px solid #E2E8F0' }}>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: '#64748B' }}>Yeni Masa Ekle</h2>
        <div className="flex gap-3">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTable()}
            placeholder="Örn: Masa 1, Bahçe 3, VIP..."
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A' }} />
          <button onClick={addTable}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#0F172A' }}>+ Ekle</button>
        </div>
      </div>

      {/* İstatistikler */}
      {tables.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="px-4 py-2 rounded-xl" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
            <span className="text-xs font-semibold" style={{ color: '#065F46' }}>
              🟢 Boş: {tablesWithSession.filter(t => t.is_active && !t.session).length}
            </span>
          </div>
          <div className="px-4 py-2 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <span className="text-xs font-semibold" style={{ color: '#991B1B' }}>
              🔴 Dolu: {tablesWithSession.filter(t => t.is_active && t.session && !t.isMerged).length}
            </span>
          </div>
          {mergeGroups.size > 0 && (
            <div className="px-4 py-2 rounded-xl" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <span className="text-xs font-semibold" style={{ color: '#1D4ED8' }}>
                🔵 Birleşik: {[...mergeGroups.values()].reduce((s, v) => s + v.length, 0)} masa
              </span>
            </div>
          )}
          {sessions.length > 0 && (
            <div className="px-4 py-2 rounded-xl" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
              <span className="text-xs font-semibold" style={{ color: '#0C4A6E' }}>
                💰 Toplam: {formatPrice(sessions.reduce((sum, s) => sum + s.cached_total_int, 0))}
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
            editing={editingId === table.id}
            editingName={editingName}
            onStartEdit={() => { setEditingId(table.id); setEditingName(table.name); }}
            onChangeEditName={setEditingName}
            onSaveEdit={() => saveTable(table)}
            onCancelEdit={() => { setEditingId(null); setEditingName(''); }}
            onToggleActive={() => toggleActive(table)}
            onDelete={() => askDeleteTable(table)}
            onOpenDetail={() => table.session && openDetail(table.session.id)}
            onCloseSession={() => table.session && tryCloseSession(table.session.id, table.name)}
            onOpenPayment={() => table.session && setPaymentSession({ sessionId: table.session.id, tableName: table.name })}
          />
        ))}

        {tables.length === 0 && (
          <div className="col-span-full text-center py-16 rounded-2xl" style={{ background: 'white', border: '1px dashed #E2E8F0' }}>
            <div className="text-4xl mb-3">🪑</div>
            <p className="text-sm" style={{ color: '#94A3B8' }}>Henüz masa yok</p>
          </div>
        )}
      </div>

      {/* Adisyon Detay Modal */}
      {detailOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.6)', padding: 16 }}
          onClick={() => { setDetailOpen(null); setDetailData(null); }}>
          <div style={{ background: 'white', borderRadius: 20, maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                {detailData?.table?.name ?? 'Masa Detayı'}
              </h3>
              <button onClick={() => { setDetailOpen(null); setDetailData(null); }}
                style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#F1F5F9', color: '#64748B', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto"
                    style={{ borderColor: '#0D9488', borderTopColor: 'transparent' }} />
                </div>
              ) : detailData ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                    {[
                      { label: 'Adisyon', value: formatPrice(detailData.session?.cached_total_int ?? 0), color: '#0D9488', bg: '#F0FDFA' },
                      { label: 'Teslim', value: detailData.orders.filter(o => o.status === 'delivered').length, color: '#0F172A', bg: '#F8FAFC' },
                      { label: 'Bekliyor', value: detailData.orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length, color: '#B45309', bg: '#FFFBEB' },
                    ].map(s => (
                      <div key={s.label} style={{ padding: 10, background: s.bg, borderRadius: 10, textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {detailData.orders.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: 20 }}>Henüz sipariş yok.</p>
                  ) : detailData.orders.map((order, idx) => (
                    <div key={order.id} style={{ marginBottom: 10, border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: order.status === 'delivered' ? '#F0FDF4' : '#FFFBEB', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: order.status === 'delivered' ? '#065F46' : '#B45309' }}>
                          #{idx + 1} · {order.status === 'delivered' ? 'Teslim ✓' : order.status === 'pending' ? 'Bekliyor' : order.status}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748B' }}>
                          {new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ padding: '8px 12px' }}>
                        {order.items.map(item => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
                            <span>{item.quantity}x {item.product_name}</span>
                            <span style={{ color: '#64748B' }}>{formatPrice(item.price_int * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
            {detailData && detailData.session?.status === 'open' && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    setDetailOpen(null);
                    setDetailData(null);
                    if (detailData?.table) setPaymentSession({ sessionId: detailOpen!, tableName: detailData.table.name });
                  }}
                  style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0D9488', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  💳 Ödeme Al
                </button>
                <button
                  onClick={() => tryCloseSession(detailOpen!, detailData?.table?.name ?? 'Masa')}
                  style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#DC2626', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  🔒 Masayı Kapat
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending sipariş modal */}
      {closeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.7)', padding: 16 }}
          onClick={() => setCloseModal(null)}>
          <div style={{ background: 'white', borderRadius: 20, maxWidth: 440, width: '100%', padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>⚠️</div>
            <h3 style={{ fontWeight: 700, fontSize: 17, color: '#0F172A', textAlign: 'center', marginBottom: 8, fontFamily: 'Georgia, serif' }}>
              Teslim Edilmemiş Sipariş Var
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{closeModal.tableName}</strong> masasında <strong>{closeModal.pendingCount}</strong> bekleyen sipariş var.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => tryCloseSession(closeModal.sessionId, closeModal.tableName, 'transfer')}
                style={{ padding: 12, borderRadius: 10, border: '1.5px solid #0D9488', background: 'white', color: '#0D9488', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                🔄 Yeni müşteriye ait — yeni masa aç
              </button>
              <button onClick={() => tryCloseSession(closeModal.sessionId, closeModal.tableName, 'cancel_pending')}
                style={{ padding: 12, borderRadius: 10, border: '1.5px solid #DC2626', background: 'white', color: '#DC2626', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                ❌ Bekleyenleri iptal et ve kapat
              </button>
              <button onClick={() => setCloseModal(null)}
                style={{ padding: 12, borderRadius: 10, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
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
  table, session, isMerged, mergeGroupId,
  editing, editingName,
  onStartEdit, onChangeEditName, onSaveEdit, onCancelEdit,
  onToggleActive, onDelete, onOpenDetail, onCloseSession, onOpenPayment
}: TableCardProps) {
  const isOccupied = !!session;
  const isPassive = !table.is_active;
  const duration = session ? useDuration(session.opened_at) : null;

  // Renk: mavi=birleşik, kırmızı=dolu, yeşil=boş, gri=pasif
  const colors = isPassive
    ? { bg: '#F8FAFC', border: '#E2E8F0', accent: '#94A3B8' }
    : isMerged
    ? { bg: '#EFF6FF', border: '#3B82F6', accent: '#1D4ED8' }
    : isOccupied
    ? { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626' }
    : { bg: '#F0FDF4', border: '#A7F3D0', accent: '#059669' };

  const statusLabel = isPassive ? 'Pasif'
    : isMerged ? '🔵 Birleşik'
    : isOccupied ? '● Dolu'
    : '○ Boş';

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      opacity: isPassive ? 0.7 : 1
    }}>
      {/* Üst şerit */}
      <div style={{
        padding: '8px 14px',
        background: colors.accent,
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
            autoFocus className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
            style={{ border: '1.5px solid #0D9488', background: 'white' }} />
        ) : (
          <h3 style={{ fontWeight: 700, fontSize: 20, color: '#0F172A', fontFamily: 'Georgia, serif', lineHeight: 1.1, marginBottom: 12 }}>
            {table.name}
          </h3>
        )}

        {/* Birleşik masa görseli */}
        {isMerged && (
          <div style={{ marginBottom: 10, padding: '6px 10px', background: '#DBEAFE', borderRadius: 8, fontSize: 11, color: '#1D4ED8', fontWeight: 600, textAlign: 'center' }}>
            🔗 Birleşik Masa Grubu
          </div>
        )}

        {isOccupied && session && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'white', borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Adisyon</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: colors.accent }}>
                {formatPrice(session.cached_total_int)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, padding: '5px 8px', background: 'white', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Teslim</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>{session.delivered_count}</div>
              </div>
              <div style={{ flex: 1, padding: '5px 8px', background: 'white', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Bekliyor</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309' }}>{session.pending_count}</div>
              </div>
            </div>
          </div>
        )}

        {!isOccupied && !editing && !isPassive && (
          <div style={{ padding: '14px 8px', textAlign: 'center', background: 'white', borderRadius: 10, border: '1px dashed #A7F3D0', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#065F46', fontWeight: 600 }}>Müşteri bekleniyor</div>
          </div>
        )}
      </div>

      {/* Butonlar */}
      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isOccupied && !editing && (
          <>
            {/* Ödeme Al butonu */}
            <button onClick={onOpenPayment}
              style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: '#0D9488', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              💳 Ödeme Al
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onOpenDetail}
                style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: '#0F172A', color: 'white', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                💰 Detay
              </button>
              <button onClick={onCloseSession}
                style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: '#DC2626', color: 'white', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                🔒 Kapat
              </button>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button onClick={onSaveEdit} style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: '#0D9488', color: 'white', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Kaydet</button>
              <button onClick={onCancelEdit} style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: '#F1F5F9', color: '#64748B', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>İptal</button>
            </>
          ) : (
            <>
              <button onClick={onStartEdit} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', color: '#0F172A', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>Düzenle</button>
              <button onClick={onToggleActive} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', color: table.is_active ? '#DC2626' : '#16A34A', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                {table.is_active ? 'Pasif' : 'Aktif'}
              </button>
              <button onClick={onDelete} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>Sil</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}