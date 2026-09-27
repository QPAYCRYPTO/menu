// apps/web/src/pages/waiter/WaiterTablesPage.tsx
// CHANGELOG v4:
// - Birleşik masalar mavi MergeGroupCard olarak gösterilir
// - merge_group_id olan masalar normal listeden çıkar, grup kartına girer
// - Taşı/Birleştir yetki kontrolü korundu

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { WaiterTable, listTables } from '../../api/waiterPublicApi';
import { waiterMoveSession, waiterMergeSessions } from '../../api/tableOperationsApi';

type ToastState = { message: string; type: 'error' | 'success' } | null;

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

// ─── MASA TAŞIMA MODAL ───────────────────────────────────────────────────────
type MoveModalProps = {
  table: WaiterTable;
  allTables: WaiterTable[];
  token: string;
  tabId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
};

function MoveModal({ table, allTables, token, tabId, onClose, onSuccess, onError }: MoveModalProps) {
  const [targetTableId, setTargetTableId] = useState('');
  const [loading, setLoading] = useState(false);

  const emptyTables = allTables.filter(t => !t.has_active_session && t.id !== table.id);

  async function handleMove() {
    if (!targetTableId) { onError('Hedef masa seçin.'); return; }
    setLoading(true);
    try {
      const result = await waiterMoveSession(token, tabId, table.session_id!, targetTableId);
      onSuccess(`${result.from_table.name} → ${result.to_table.name} taşındı.`);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Taşıma başarısız.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-md fade-enter"
      onClick={onClose}>
      <div className="glass-dark sheet-enter w-full max-w-[520px] rounded-t-[32px] border-t border-white/60 text-white px-5 pb-6"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/40 rounded-full mx-auto mt-3 mb-3" />
        <h3 className="font-serif font-bold text-lg mb-1 flex items-center gap-2">
          🔄 Masa Taşı
        </h3>
        <p className="text-xs mb-4 text-white/65">
          <strong className="text-white">{table.name}</strong> masasını boş bir masaya taşı
        </p>

        {emptyTables.length === 0 ? (
          <div className="text-center py-6 rounded-2xl mb-4"
            style={{ background: 'var(--danger-bg)', border: '1px solid rgba(251,113,133,0.45)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--danger)' }}>Boş masa yok</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {emptyTables.map(t => (
              <label key={t.id}
                className="flex items-center gap-3 p-3 min-h-[48px] rounded-2xl cursor-pointer transition-colors"
                style={{
                  background: targetTableId === t.id ? 'var(--accent-soft)' : 'rgba(255,255,255,0.1)',
                  border: `1.5px solid ${targetTableId === t.id ? 'var(--accent)' : 'rgba(255,255,255,0.22)'}`
                }}>
                <input type="radio" name="target" value={t.id}
                  checked={targetTableId === t.id}
                  onChange={() => setTargetTableId(t.id)}
                  style={{ width: 18, height: 18, accentColor: '#FF7A29' }} />
                <span className="font-bold text-sm">
                  🟢 {t.name}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="glass-pill flex-1 py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-50">İptal</button>
          <button onClick={handleMove}
            disabled={loading || !targetTableId || emptyTables.length === 0}
            className="btn-accent flex-1 py-3 rounded-full text-sm font-bold spring-btn">
            {loading ? 'Taşınıyor...' : 'Taşı'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MASA BİRLEŞTİRME MODAL ──────────────────────────────────────────────────
type MergeModalProps = {
  table: WaiterTable;
  allTables: WaiterTable[];
  token: string;
  tabId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
};

function MergeModal({ table, allTables, token, tabId, onClose, onSuccess, onError }: MergeModalProps) {
  const [targetSessionId, setTargetSessionId] = useState('');
  const [loading, setLoading] = useState(false);

  // Dolu masalar — kendisi hariç (session_id olanlar)
  const occupiedTables = allTables.filter(t => t.has_active_session && t.id !== table.id);

  async function handleMerge() {
    if (!targetSessionId) { onError('Hedef masa seçin.'); return; }
    setLoading(true);
    try {
      const result = await waiterMergeSessions(token, tabId, table.session_id!, targetSessionId);
      onSuccess(`${result.source.table_name} → ${result.target.table_name} birleştirildi.`);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Birleştirme başarısız.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-md fade-enter"
      onClick={onClose}>
      <div className="glass-dark sheet-enter w-full max-w-[520px] rounded-t-[32px] border-t border-white/60 text-white px-5 pb-6"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/40 rounded-full mx-auto mt-3 mb-3" />
        <h3 className="font-serif font-bold text-lg mb-1 flex items-center gap-2">
          🔗 Masa Birleştir
        </h3>
        <p className="text-xs mb-4 text-white/65">
          <strong className="text-white">{table.name}</strong> masasını başka bir masayla birleştir.
        </p>

        {occupiedTables.length === 0 ? (
          <div className="text-center py-6 rounded-2xl mb-4"
            style={{ background: 'var(--warning-bg)', border: '1px solid rgba(251,191,36,0.45)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--warning)' }}>Birleştirilecek masa yok</p>
            <p className="text-xs mt-1 text-white/65">Başka açık masa bulunmuyor.</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {occupiedTables.map(t => (
              <label key={t.id}
                className="flex items-center gap-3 p-3 min-h-[48px] rounded-2xl cursor-pointer transition-colors"
                style={{
                  background: targetSessionId === t.session_id ? 'var(--accent-soft)' : 'rgba(255,255,255,0.1)',
                  border: `1.5px solid ${targetSessionId === t.session_id ? 'var(--accent)' : 'rgba(255,255,255,0.22)'}`
                }}>
                <input type="radio" name="target" value={t.session_id ?? ''}
                  checked={targetSessionId === t.session_id}
                  onChange={() => setTargetSessionId(t.session_id ?? '')}
                  style={{ width: 18, height: 18, accentColor: '#FF7A29' }} />
                <div className="flex-1">
                  <span className="font-bold text-sm">
                    🔴 {t.name}
                  </span>
                  <span className="text-xs ml-2 text-white/65">
                    {formatPrice(t.total_int)} · {t.order_count} sipariş
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="p-3 rounded-2xl mb-4 text-xs"
          style={{ background: 'var(--warning-bg)', color: '#FDE68A', border: '1px solid rgba(251,191,36,0.35)' }}>
          ⚠️ <strong className="text-white">{table.name}</strong> kapanır, siparişleri seçilen masaya taşınır.
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="glass-pill flex-1 py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-50">İptal</button>
          <button onClick={handleMerge}
            disabled={loading || !targetSessionId || occupiedTables.length === 0}
            className="btn-accent flex-1 py-3 rounded-full text-sm font-bold spring-btn">
            {loading ? 'Birleştiriliyor...' : 'Birleştir'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BİRLEŞİK MASA GRUP KARTI ────────────────────────────────────────────────
function MergeGroupCard({ tables, canTransfer, canMerge, onMove, onMerge }: {
  tables: WaiterTable[];
  canTransfer: boolean;
  canMerge: boolean;
  onMove: (t: WaiterTable) => void;
  onMerge: (t: WaiterTable) => void;
}) {
  const totalInt = tables.reduce((sum, t) => sum + t.total_int, 0);
  const orderCount = tables.reduce((sum, t) => sum + t.order_count, 0);

  return (
    <div className="glass-card rounded-3xl text-white" style={{
      background: 'rgba(14,165,233,0.2)',
      borderColor: 'rgba(125,211,252,0.6)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 14px',
        background: 'rgba(14,165,233,0.35)',
        borderBottom: '1px solid rgba(125,211,252,0.4)',
        color: '#E0F2FE',
        fontWeight: 800,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        🔵 BİRLEŞİK MASA GRUBU
      </div>

      <div style={{ padding: 14 }}>
        {/* Masa isimleri */}
        {tables.map(t => (
          <div key={t.id} className="font-serif" style={{
            fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1.3
          }}>
            {t.name}
          </div>
        ))}

        <div style={{ height: 1, background: 'rgba(125,211,252,0.35)', margin: '10px 0' }} />

        {/* Adisyon */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '7px 10px', background: 'rgba(0,0,0,0.28)', borderRadius: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Toplam Adisyon</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--info)' }}>
            {formatPrice(totalInt)}
          </span>
        </div>

        <div style={{ padding: '5px 8px', background: 'rgba(0,0,0,0.28)', borderRadius: 12,
          textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Toplam Sipariş
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{orderCount}</div>
        </div>

        {/* Her masaya git linkleri */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tables.map(t => (
            <Link key={t.id} to={`/garson/masa/${t.id}`}
              className="glass-pill spring-btn"
              style={{
                textDecoration: 'none', padding: '9px 10px',
                borderRadius: 14, minHeight: 36,
                fontSize: 12, fontWeight: 700, textAlign: 'center',
                display: 'block'
              }}>
              📋 {t.name} — Adisyon Aç
            </Link>
          ))}
        </div>
      </div>

      {/* Operasyon butonları */}
      {(canTransfer || canMerge) && tables[0] && (
        <div style={{ padding: '8px 14px 12px', borderTop: '1px solid rgba(125,211,252,0.35)', display: 'flex', gap: 6 }}>
          {canTransfer && (
            <button onClick={() => onMove(tables[0])}
              className="glass-pill flex-1 min-h-[36px] py-2 rounded-2xl text-xs font-bold spring-btn">
              🔄 Taşı
            </button>
          )}
          {canMerge && (
            <button onClick={() => onMerge(tables[0])}
              className="glass-pill flex-1 min-h-[36px] py-2 rounded-2xl text-xs font-bold spring-btn"
              style={{ background: 'var(--warning-bg)', color: '#FDE68A', borderColor: 'rgba(251,191,36,0.45)' }}>
              🔗 Ekle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NORMAL MASA KARTI ────────────────────────────────────────────────────────
function WaiterTableCard({ table, canTransfer, canMerge, onMove, onMerge }: {
  table: WaiterTable;
  canTransfer: boolean;
  canMerge: boolean;
  onMove: () => void;
  onMerge: () => void;
}) {
  const isOccupied = table.has_active_session;
  const hasCall = table.active_calls > 0;
  const duration = isOccupied && table.opened_at ? useDuration(table.opened_at) : null;

  const colors = hasCall
    ? { bg: 'rgba(244,63,94,0.3)', border: 'rgba(251,113,133,0.9)', accent: 'var(--danger)', header: 'rgba(225,29,72,0.55)' }
    : isOccupied
    ? { bg: 'rgba(244,63,94,0.18)', border: 'rgba(251,113,133,0.5)', accent: 'var(--danger)', header: 'rgba(244,63,94,0.3)' }
    : { bg: 'rgba(16,185,129,0.18)', border: 'rgba(52,211,153,0.5)', accent: 'var(--success)', header: 'rgba(16,185,129,0.3)' };

  return (
    <div className="glass-card glass-card-hover rounded-3xl text-white" style={{
      background: colors.bg,
      borderColor: colors.border,
      borderWidth: hasCall ? 2 : 1,
      overflow: 'visible',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {hasCall && (
        <div className="animate-pulse" style={{
          position: 'absolute', top: -8, right: -8,
          width: 30, height: 30, borderRadius: '50%',
          background: 'linear-gradient(135deg, #FB7185, #E11D48)', color: 'white',
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 6px 14px rgba(225,29,72,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, zIndex: 1
        }}>🔔</div>
      )}

      <div style={{
        padding: '8px 14px', background: colors.header, color: 'white',
        borderBottom: `1px solid ${colors.border}`,
        borderTopLeftRadius: 23, borderTopRightRadius: 23,
        fontWeight: 800, fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.06em',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span>{hasCall ? '🔔 ÇAĞRI' : isOccupied ? '● Dolu' : '○ Boş'}</span>
        {isOccupied && duration && (
          <span className="font-mono text-white/90">⏱ {duration}</span>
        )}
      </div>

      <Link to={`/garson/masa/${table.id}`} style={{ textDecoration: 'none', flex: 1, color: 'inherit' }}>
        <div style={{ padding: 14 }}>
          <h3 className="font-serif" style={{ fontWeight: 700, fontSize: 20, color: '#fff',
            lineHeight: 1.1, marginBottom: 12 }}>
            {table.name}
          </h3>

          {isOccupied && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '7px 10px', background: 'rgba(0,0,0,0.28)', borderRadius: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Adisyon</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#FCD34D' }}>
                  {formatPrice(table.total_int)}
                </span>
              </div>
              <div style={{ padding: '5px 8px', background: 'rgba(0,0,0,0.28)', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sipariş
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{table.order_count}</div>
              </div>
            </div>
          )}

          {!isOccupied && (
            <div style={{ padding: '14px 8px', textAlign: 'center',
              background: 'rgba(0,0,0,0.2)', borderRadius: 14, border: '1px dashed rgba(52,211,153,0.6)' }}>
              <div style={{ fontSize: 11, color: colors.accent, fontWeight: 700 }}>Müşteri bekleniyor</div>
            </div>
          )}
        </div>
      </Link>

      {/* Operasyon butonları */}
      {isOccupied && (canTransfer || canMerge) && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.16)', display: 'flex', gap: 6 }}>
          {canTransfer && (
            <button onClick={e => { e.preventDefault(); onMove(); }}
              className="glass-pill flex-1 min-h-[36px] py-2 rounded-2xl text-xs font-bold spring-btn"
              style={{ background: 'var(--info-bg)', color: '#E0F2FE', borderColor: 'rgba(125,211,252,0.45)' }}>
              🔄 Taşı
            </button>
          )}
          {canMerge && (
            <button onClick={e => { e.preventDefault(); onMerge(); }}
              className="glass-pill flex-1 min-h-[36px] py-2 rounded-2xl text-xs font-bold spring-btn"
              style={{ background: 'var(--warning-bg)', color: '#FDE68A', borderColor: 'rgba(251,191,36,0.45)' }}>
              🔗 Birleştir
            </button>
          )}
        </div>
      )}

      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.16)' }}>
        <Link to={`/garson/masa/${table.id}`} style={{ textDecoration: 'none' }}
          className={`${isOccupied ? 'glass-pill' : 'btn-accent'} spring-btn flex items-center justify-center min-h-[38px] rounded-full`}>
          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>
            {isOccupied ? '📋 Adisyonu Aç' : '➕ Sipariş Al'}
          </div>
        </Link>
      </div>
    </div>
  );
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────
export function WaiterTablesPage() {
  const { waiter, token, tabId, logout } = useWaiterAuth();
  const [tables, setTables] = useState<WaiterTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [moveTarget, setMoveTarget] = useState<WaiterTable | null>(null);
  const [mergeTarget, setMergeTarget] = useState<WaiterTable | null>(null);

  useEffect(() => {
    if (!token || !tabId) return;
    loadTables();
    const interval = setInterval(() => loadTables(true), 10000);
    return () => clearInterval(interval);
  }, [token, tabId]);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
  }

  async function loadTables(silent = false) {
    if (!token || !tabId) return;
    if (!silent) setLoading(true);
    try {
      const data = await listTables(token, tabId);
      setTables(data);
    } catch (e) {
      if (e instanceof Error && e.message.includes('reason')) { logout(); return; }
      if (!silent) showToast(e instanceof Error ? e.message : 'Masalar alınamadı.', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleOperationSuccess(msg: string) {
    showToast(msg, 'success');
    await loadTables(true);
  }

  if (!waiter) return null;

  const canTransfer = waiter.permissions.can_transfer_table;
  const canMerge = waiter.permissions.can_merge_tables;

  // Birleşik masa gruplarını hesapla
  const mergeGroupMap = new Map<string, WaiterTable[]>();
  tables.forEach(t => {
    if (t.merge_group_id) {
      const group = mergeGroupMap.get(t.merge_group_id) ?? [];
      group.push(t);
      mergeGroupMap.set(t.merge_group_id, group);
    }
  });

  // Normal masalar (birleşik olmayanlar) — sıralı
  const normalTables = [...tables]
    .filter(t => !t.merge_group_id)
    .sort((a, b) => {
      if (a.active_calls > 0 && b.active_calls === 0) return -1;
      if (a.active_calls === 0 && b.active_calls > 0) return 1;
      if (a.has_active_session && !b.has_active_session) return -1;
      if (!a.has_active_session && b.has_active_session) return 1;
      return a.sort_order - b.sort_order;
    });

  const busyCount = tables.filter(t => t.has_active_session && !t.merge_group_id).length;
  const emptyCount = tables.filter(t => !t.has_active_session).length;
  const mergedCount = mergeGroupMap.size;
  const totalOpen = tables.reduce((sum, t) => sum + (t.total_int || 0), 0);

  return (
    <div className="text-white">
      {toast && (
        <div className="fixed top-24 left-4 right-4 z-50 glass-panel px-4 py-3 rounded-2xl text-sm font-bold mx-auto fade-enter"
          style={{
            background: toast.type === 'error' ? 'rgba(225,29,72,0.85)' : 'rgba(5,150,105,0.85)',
            color: '#fff',
            maxWidth: 480
          }}>
          {toast.message}
        </div>
      )}

      <div className="glass-panel rounded-3xl px-4 py-3 flex items-center justify-between mb-3">
        <h2 className="font-serif font-bold text-lg flex items-center gap-2">
          🍽️ Masalar
        </h2>
        <button onClick={() => loadTables()}
          className="glass-pill min-h-[36px] px-3.5 py-2 rounded-2xl text-xs font-bold spring-btn">
          🔄 Yenile
        </button>
      </div>

      {/* İstatistikler */}
      {tables.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-none pb-1">
          <div className="glass-pill flex-shrink-0 px-3 py-1.5 rounded-2xl" style={{ background: 'var(--success-bg)', borderColor: 'rgba(52,211,153,0.5)' }}>
            <span className="text-xs font-bold" style={{ color: '#A7F3D0' }}>🟢 Boş: {emptyCount}</span>
          </div>
          <div className="glass-pill flex-shrink-0 px-3 py-1.5 rounded-2xl" style={{ background: 'var(--danger-bg)', borderColor: 'rgba(251,113,133,0.5)' }}>
            <span className="text-xs font-bold" style={{ color: '#FECDD3' }}>🔴 Dolu: {busyCount}</span>
          </div>
          {mergedCount > 0 && (
            <div className="glass-pill flex-shrink-0 px-3 py-1.5 rounded-2xl" style={{ background: 'var(--info-bg)', borderColor: 'rgba(125,211,252,0.5)' }}>
              <span className="text-xs font-bold" style={{ color: '#E0F2FE' }}>🔵 Birleşik: {mergedCount} grup</span>
            </div>
          )}
          {totalOpen > 0 && (
            <div className="btn-accent flex-shrink-0 px-3 py-1.5 rounded-2xl">
              <span className="text-xs font-extrabold">💰 {formatPrice(totalOpen)}</span>
            </div>
          )}
        </div>
      )}

      {loading && tables.length === 0 && (
        <div className="glass-panel rounded-3xl text-center py-14">
          <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-white/80">Masalar yükleniyor...</p>
        </div>
      )}

      {!loading && tables.length === 0 && (
        <div className="glass-card text-center py-14 rounded-3xl">
          <div className="text-4xl mb-3">🪑</div>
          <p className="text-sm text-white/70">Henüz masa yok</p>
        </div>
      )}

      {tables.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {/* Birleşik masa grupları — tek kart */}
          {[...mergeGroupMap.entries()].map(([groupId, groupTables]) => (
            <MergeGroupCard
              key={groupId}
              tables={groupTables}
              canTransfer={canTransfer}
              canMerge={canMerge}
              onMove={(t) => setMoveTarget(t)}
              onMerge={(t) => setMergeTarget(t)}
            />
          ))}

          {/* Normal masalar */}
          {normalTables.map(table => (
            <WaiterTableCard
              key={table.id}
              table={table}
              canTransfer={canTransfer}
              canMerge={canMerge}
              onMove={() => setMoveTarget(table)}
              onMerge={() => setMergeTarget(table)}
            />
          ))}
        </div>
      )}

      {/* Taşıma Modal */}
      {moveTarget && token && tabId && (
        <MoveModal
          table={moveTarget}
          allTables={tables}
          token={token}
          tabId={tabId}
          onClose={() => setMoveTarget(null)}
          onSuccess={handleOperationSuccess}
          onError={msg => showToast(msg, 'error')}
        />
      )}

      {/* Birleştirme Modal */}
      {mergeTarget && token && tabId && (
        <MergeModal
          table={mergeTarget}
          allTables={tables}
          token={token}
          tabId={tabId}
          onClose={() => setMergeTarget(null)}
          onSuccess={handleOperationSuccess}
          onError={msg => showToast(msg, 'error')}
        />
      )}
    </div>
  );
}