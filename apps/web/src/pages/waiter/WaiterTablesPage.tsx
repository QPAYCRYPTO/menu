// apps/web/src/pages/waiter/WaiterTablesPage.tsx
// CHANGELOG v2:
// - listTables(token, tabId) — yeni API imzası
// - tabId useWaiterAuth'tan alınıyor

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { WaiterTable, listTables } from '../../api/waiterPublicApi';

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

export function WaiterTablesPage() {
  const { waiter, token, tabId, logout } = useWaiterAuth();
  const [tables, setTables] = useState<WaiterTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (!token || !tabId) return;
    loadTables();

    const interval = setInterval(() => {
      loadTables(true);
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (e instanceof Error && e.message.includes('reason')) {
        logout();
        return;
      }
      if (!silent) {
        showToast(e instanceof Error ? e.message : 'Masalar alınamadı.', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  if (!waiter) return null;

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
              style={{ background: '#16A34A' }} disabled>
              ▶️ İşe Giriş
            </button>
            <button className="flex-1 py-2.5 rounded-xl text-xs font-semibold opacity-60 cursor-not-allowed"
              style={{ background: '#FEF3C7', color: '#92400E' }} disabled>
              ☕ Mola
            </button>
            <button className="flex-1 py-2.5 rounded-xl text-xs font-semibold opacity-60 cursor-not-allowed"
              style={{ background: '#FEF2F2', color: '#DC2626' }} disabled>
              ⏹️ Çıkış
            </button>
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
            <span className="text-xs font-semibold" style={{ color: '#065F46' }}>
              🟢 Boş: {emptyCount}
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <span className="text-xs font-semibold" style={{ color: '#991B1B' }}>
              🔴 Dolu: {busyCount}
            </span>
          </div>
          {busyCount > 0 && (
            <div className="px-3 py-1.5 rounded-xl" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
              <span className="text-xs font-semibold" style={{ color: '#0C4A6E' }}>
                💰 Açık Adisyon: {formatPrice(totalOpen)}
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
          <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>
            Yöneticinizden masa eklemesini isteyin.
          </p>
        </div>
      )}

      {tables.length > 0 && (
        <div className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {sortedTables.map(table => (
            <WaiterTableCard key={table.id} table={table} />
          ))}
        </div>
      )}
    </div>
  );
}

function WaiterTableCard({ table }: { table: WaiterTable }) {
  const isOccupied = table.has_active_session;
  const hasCall = table.active_calls > 0;

  const duration = isOccupied && table.opened_at ? useDuration(table.opened_at) : null;

  const colors = hasCall
    ? { bg: '#FEE2E2', border: '#DC2626', accent: '#DC2626' }
    : isOccupied
    ? { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626' }
    : { bg: '#F0FDF4', border: '#A7F3D0', accent: '#059669' };

  return (
    <Link
      to={`/garson/masa/${table.id}`}
      style={{
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        position: 'relative'
      }}>

      {hasCall && (
        <div style={{
          position: 'absolute', top: -8, right: -8,
          width: 28, height: 28, borderRadius: '50%',
          background: '#DC2626', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, animation: 'pulse 1s infinite',
          zIndex: 1
        }}>
          🔔
        </div>
      )}

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
        <span>
          {hasCall ? '🔔 ÇAĞRI' : isOccupied ? '● Dolu' : '○ Boş'}
        </span>
        {isOccupied && duration && (
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>⏱ {duration}</span>
        )}
      </div>

      <div style={{ padding: 16, flex: 1 }}>
        <h3 style={{
          fontWeight: 700, fontSize: 20, color: '#0F172A',
          fontFamily: 'Georgia, serif', lineHeight: 1.1,
          marginBottom: 12
        }}>
          {table.name}
        </h3>

        {isOccupied && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 10px', background: 'white', borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.04)'
            }}>
              <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Adisyon</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: colors.accent }}>
                {formatPrice(table.total_int)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{
                flex: 1, padding: '5px 8px', background: 'white',
                borderRadius: 8, textAlign: 'center',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                  Sipariş
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                  {table.order_count}
                </div>
              </div>
              {hasCall && (
                <div style={{
                  flex: 1, padding: '5px 8px', background: 'white',
                  borderRadius: 8, textAlign: 'center',
                  border: '1px solid rgba(0,0,0,0.04)'
                }}>
                  <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                    Çağrı
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                    {table.active_calls}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!isOccupied && !hasCall && (
          <div style={{
            padding: '14px 8px', textAlign: 'center',
            background: 'white', borderRadius: 10,
            border: '1px dashed #A7F3D0'
          }}>
            <div style={{ fontSize: 11, color: '#065F46', fontWeight: 600 }}>
              Müşteri bekleniyor
            </div>
          </div>
        )}

        {!isOccupied && hasCall && (
          <div style={{
            padding: '14px 8px', textAlign: 'center',
            background: 'white', borderRadius: 10,
            border: '1px dashed #DC2626'
          }}>
            <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>
              🔔 Garson çağrısı!
            </div>
          </div>
        )}
      </div>

      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid rgba(0,0,0,0.04)',
        background: 'rgba(255,255,255,0.5)'
      }}>
        <div style={{
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: isOccupied ? '#0F172A' : '#059669'
        }}>
          {isOccupied ? '📋 Adisyonu Aç' : '➕ Sipariş Al'}
        </div>
      </div>
    </Link>
  );
}