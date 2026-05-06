// apps/web/src/pages/waiter/WaiterTablesPage.tsx
// CHANGELOG v3:
// - Masa taşıma modal (can_transfer_table yetkisi varsa)
// - Masa birleştirme modal (can_merge_tables yetkisi varsa)
// - Her iki işlem waiterTableOperationsApi ile yapılır

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { WaiterTable, listTables } from '../../api/waiterPublicApi';
import {
  waiterMoveSession,
  waiterMergeSessions,
} from '../../api/tableOperationsApi';

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

  // Boş masalar — kendisi hariç
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
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(15,23,42,0.7)' }}
      onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 max-w-lg"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-base mb-1" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
          🔄 Masa Taşı
        </h3>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          <strong>{table.name}</strong> masasını boş bir masaya taşı
        </p>

        {emptyTables.length === 0 ? (
          <div className="text-center py-6 rounded-xl mb-4" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <p className="text-sm font-semibold" style={{ color: '#DC2626' }}>Boş masa yok</p>
            <p className="text-xs mt-1" style={{ color: '#64748B' }}>Tüm masalar dolu.</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {emptyTables.map(t => (
              <label key={t.id}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                style={{
                  background: targetTableId === t.id ? '#F0FDFA' : '#F8FAFC',
                  border: `1.5px solid ${targetTableId === t.id ? '#0D9488' : '#E2E8F0'}`
                }}>
                <input type="radio" name="target" value={t.id}
                  checked={targetTableId === t.id}
                  onChange={() => setTargetTableId(t.id)}
                  style={{ width: 18, height: 18 }} />
                <span className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                  🟢 {t.name}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-semibold"
            style={{ background: '#F1F5F9', color: '#64748B' }}>
            İptal
          </button>
          <button onClick={handleMove} disabled={loading || !targetTableId || emptyTables.length === 0}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: loading || !targetTableId ? '#94A3B8' : '#0D9488' }}>
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

  // Dolu masalar — kendisi hariç
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
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(15,23,42,0.7)' }}
      onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 max-w-lg"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-base mb-1" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
          🔗 Masa Birleştir
        </h3>
        <p className="text-xs mb-4" style={{ color: '#64748B' }}>
          <strong>{table.name}</strong> masasını başka bir masayla birleştir.
          Kaynak kapanır, hedefte toplanır.
        </p>

        {occupiedTables.length === 0 ? (
          <div className="text-center py-6 rounded-xl mb-4" style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Birleştirilecek masa yok</p>
            <p className="text-xs mt-1" style={{ color: '#64748B' }}>Başka açık masa bulunmuyor.</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {occupiedTables.map(t => (
              <label key={t.id}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                style={{
                  background: targetSessionId === t.session_id ? '#FFFBEB' : '#F8FAFC',
                  border: `1.5px solid ${targetSessionId === t.session_id ? '#F59E0B' : '#E2E8F0'}`
                }}>
                <input type="radio" name="target" value={t.session_id ?? ''}
                  checked={targetSessionId === t.session_id}
                  onChange={() => setTargetSessionId(t.session_id ?? '')}
                  style={{ width: 18, height: 18 }} />
                <div className="flex-1">
                  <span className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                    🔴 {t.name}
                  </span>
                  <span className="text-xs ml-2" style={{ color: '#64748B' }}>
                    {formatPrice(t.total_int)} · {t.order_count} sipariş
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="p-3 rounded-xl mb-4 text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>
          ⚠️ <strong>{table.name}</strong> kapanır, tüm siparişleri seçilen masaya taşınır.
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-semibold"
            style={{ background: '#F1F5F9', color: '#64748B' }}>
            İptal
          </button>
          <button onClick={handleMerge} disabled={loading || !targetSessionId || occupiedTables.length === 0}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: loading || !targetSessionId ? '#94A3B8' : '#F59E0B' }}>
            {loading ? 'Birleştiriliyor...' : 'Birleştir'}
          </button>
        </div>
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

  // Modal state
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

  const sortedTables = [...tables].sort((a, b) => {
    if (a.active_calls > 0 && b.active_calls === 0) return -1;
    if (a.active_calls === 0 && b.active_calls > 0) return 1;
    if (a.has_active_session && !b.has_active_session) return -1;
    if (!a.has_active_session && b.has_active_session) return 1;
    return a.sort_order - b.sort_order;
  });

  const busyCount = tables.filter(t => t.has_active_session).length;
  const emptyCount = tables.filter(t => !t.has_active_session).length;
  const totalOpen = tables.reduce((sum, t) => sum + (t.total_int || 0), 0);

  return (
    <div>
      {toast && (
        <div className="fixed top-20 left-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg mx-auto"
          style={{
            background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4',
            color: toast.type === 'error' ? '#DC2626' : '#16A34A',
            border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`,
            maxWidth: 480
          }}>
          {toast.message}
        </div>
      )}

      {waiter.permissions.can_use_break && (
        <div className="mb-4 bg-white rounded-2xl p-3" style={{ border: '1px solid #E2E8F0' }}>
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white opacity-60 cursor-not-allowed"
              style={{ background: '#16A34A' }} disabled>▶️ İşe Giriş</button>
            <button className="flex-1 py-2.5 rounded-xl text-xs font-semibold opacity-60 cursor-not-allowed"
              style={{ background: '#FEF3C7', color: '#92400E' }} disabled>☕ Mola</button>
            <button className="flex-1 py-2.5 rounded-xl text-xs font-semibold opacity-60 cursor-not-allowed"
              style={{ background: '#FEF2F2', color: '#DC2626' }} disabled>⏹️ Çıkış</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
          🍽️ Masalar
        </h2>
        <button onClick={() => loadTables()}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: '#F1F5F9', color: '#64748B' }}>
          🔄 Yenile
        </button>
      </div>

      {tables.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="px-3 py-1.5 rounded-xl" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
            <span className="text-xs font-semibold" style={{ color: '#065F46' }}>🟢 Boş: {emptyCount}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <span className="text-xs font-semibold" style={{ color: '#991B1B' }}>🔴 Dolu: {busyCount}</span>
          </div>
          {busyCount > 0 && (
            <div className="px-3 py-1.5 rounded-xl" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
              <span className="text-xs font-semibold" style={{ color: '#0C4A6E' }}>
                💰 Açık: {formatPrice(totalOpen)}
              </span>
            </div>
          )}
        </div>
      )}

      {loading && tables.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mb-3"
            style={{ borderColor: '#0D9488', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: '#64748B' }}>Masalar yükleniyor...</p>
        </div>
      )}

      {!loading && tables.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px dashed #E2E8F0' }}>
          <div className="text-4xl mb-3">🪑</div>
          <p className="text-sm" style={{ color: '#94A3B8' }}>Henüz masa yok</p>
        </div>
      )}

      {tables.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {sortedTables.map(table => (
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

// ─── MASA KARTI ───────────────────────────────────────────────────────────────
function WaiterTableCard({
  table,
  canTransfer,
  canMerge,
  onMove,
  onMerge
}: {
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
    ? { bg: '#FEE2E2', border: '#DC2626', accent: '#DC2626' }
    : isOccupied
    ? { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626' }
    : { bg: '#F0FDF4', border: '#A7F3D0', accent: '#059669' };

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {hasCall && (
        <div style={{
          position: 'absolute', top: -8, right: -8,
          width: 28, height: 28, borderRadius: '50%',
          background: '#DC2626', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, zIndex: 1
        }}>🔔</div>
      )}

      <div style={{
        padding: '8px 14px',
        background: colors.accent, color: 'white',
        fontWeight: 700, fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span>{hasCall ? '🔔 ÇAĞRI' : isOccupied ? '● Dolu' : '○ Boş'}</span>
        {isOccupied && duration && (
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>⏱ {duration}</span>
        )}
      </div>

      {/* Ana içerik — tıklanınca masa detayına git */}
      <Link to={`/garson/masa/${table.id}`} style={{ textDecoration: 'none', flex: 1 }}>
        <div style={{ padding: 16 }}>
          <h3 style={{ fontWeight: 700, fontSize: 20, color: '#0F172A', fontFamily: 'Georgia, serif', lineHeight: 1.1, marginBottom: 12 }}>
            {table.name}
          </h3>

          {isOccupied && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'white', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Adisyon</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: colors.accent }}>{formatPrice(table.total_int)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, padding: '5px 8px', background: 'white', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Sipariş</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{table.order_count}</div>
                </div>
              </div>
            </div>
          )}

          {!isOccupied && (
            <div style={{ padding: '14px 8px', textAlign: 'center', background: 'white', borderRadius: 10, border: '1px dashed #A7F3D0' }}>
              <div style={{ fontSize: 11, color: '#065F46', fontWeight: 600 }}>Müşteri bekleniyor</div>
            </div>
          )}
        </div>
      </Link>

      {/* Operasyon butonları — sadece dolu masada ve yetki varsa */}
      {isOccupied && (canTransfer || canMerge) && (
        <div style={{ padding: '8px 14px 12px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 6 }}>
          {canTransfer && (
            <button
              onClick={e => { e.preventDefault(); onMove(); }}
              className="flex-1 py-2 rounded-xl text-xs font-semibold"
              style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
              🔄 Taşı
            </button>
          )}
          {canMerge && (
            <button
              onClick={e => { e.preventDefault(); onMerge(); }}
              className="flex-1 py-2 rounded-xl text-xs font-semibold"
              style={{ background: '#FFFBEB', color: '#B45309' }}>
              🔗 Birleştir
            </button>
          )}
        </div>
      )}

      {/* Alt kısım — sipariş al veya adisyon */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(0,0,0,0.04)', background: 'rgba(255,255,255,0.5)' }}>
        <Link to={`/garson/masa/${table.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: isOccupied ? '#0F172A' : '#059669' }}>
            {isOccupied ? '📋 Adisyonu Aç' : '➕ Sipariş Al'}
          </div>
        </Link>
      </div>
    </div>
  );
}