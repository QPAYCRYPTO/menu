// apps/web/src/pages/TablesPage.tsx
// CHANGELOG v4:
// - Birleşik masalar mavi gösterim + grup bağlantı çizgisi
// - merge_group_id ile birleşik masalar gruplanır
// - Ödeme ve hesap kapatma Kasa ekranına taşındı (/admin/kasa): dolu masada "Kasaya Git".

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Armchair, Check, Clock, Link2, Receipt, Timer, Wallet, X } from 'lucide-react';
import { orderStatusStyle } from '../lib/orderStatus';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { ConfirmModal, type ConfirmState } from '../components/ConfirmModal';

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

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────
export function TablesPage() {
  const { accessToken } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newName, setNewName] = useState('');
  // Panel kısayolu: /admin/tables?yeni=1 → "Yeni Masa Ekle" alanına odaklan
  const [searchParams, setSearchParams] = useSearchParams();
  const newTableInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchParams.get('yeni') !== '1') return;
    newTableInputRef.current?.focus();
    newTableInputRef.current?.scrollIntoView({ block: 'center' });
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('yeni'); return p; }, { replace: true });
  }, [searchParams, setSearchParams]);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [detailOpen, setDetailOpen] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const navigate = useNavigate();
  const goToCashier = (tableId: string) => navigate(`/admin/kasa?masa=${tableId}`);

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
          <input ref={newTableInputRef} value={newName} onChange={e => setNewName(e.target.value)}
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
            onGoToCashier={() => goToCashier(table.id)}
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
          <div className="ui-card rounded-3xl text-ink sheet-max-85" style={{ maxWidth: 560, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
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
                      { label: 'Teslim', value: detailData.orders.filter(o => o.status === 'delivered').length, color: 'var(--state-done)', bg: 'var(--state-done-bg)' },
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
                      <div style={{ padding: '8px 12px', background: orderStatusStyle(order.status).bg, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: orderStatusStyle(order.status).fg, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          #{idx + 1} · {order.status === 'delivered' ? <>Teslim <Check size={12} strokeWidth={3} /></> : orderStatusStyle(order.status).label}
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
                  onClick={() => detailData?.table && goToCashier(detailData.table.id)}
                  className="bg-cash text-on-cash spring-btn flex items-center justify-center gap-1.5"
                  style={{ flex: 1, padding: 12, borderRadius: 16, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  <Wallet size={16} /> Kasaya Git
                </button>
              </div>
            )}
          </div>
        </div>
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
  onGoToCashier: () => void;
};

function TableCard({
  table, session, isMerged, mergeGroupId, mergedInto, onGoToTable,
  editing, editingName,
  onStartEdit, onChangeEditName, onSaveEdit, onCancelEdit,
  onToggleActive, onDelete, onOpenDetail, onGoToCashier
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
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--state-done)' }}>{session.delivered_count}</div>
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
            {/* Ödeme ve hesap kapatma Kasa ekranında */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onGoToCashier}
                className="bg-cash text-on-cash spring-btn flex items-center justify-center gap-1.5"
                style={{ flex: 1, padding: '9px', borderRadius: 12, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                <Wallet size={13} /> Kasaya Git
              </button>
              <button onClick={onOpenDetail}
                className="btn-outline spring-btn flex items-center justify-center gap-1"
                style={{ flex: 1, padding: '9px', borderRadius: 12, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                <Receipt size={12} /> Detay
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