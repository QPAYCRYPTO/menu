// apps/web/src/pages/TablesPage.tsx
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

type Table = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type SessionInfo = {
  id: string;
  table_id: string;
  opened_at: string;
  cached_total_int: number;
  status: 'open' | 'closed';
  table_name: string;
  order_count: number;
  delivered_count: number;
  pending_count: number;
};

type SessionDetail = {
  session: any;
  table: { id: string; name: string } | null;
  orders: Array<{
    id: string;
    status: string;
    note: string | null;
    created_at: string;
    customer_token: string | null;
    items: Array<{ id: string; product_name: string; quantity: number; price_int: number }>;
  }>;
};

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

export function TablesPage() {
  const { accessToken } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Detay modal
  const [detailOpen, setDetailOpen] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Masa kapatma modal (pending var durumunda seçenek)
  const [closeModal, setCloseModal] = useState<{ sessionId: string; tableName: string; pendingCount: number } | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
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
    } catch {
      // Sessiz geç, polling tekrar dener
    }
  }

  useEffect(() => {
    loadTables();
    loadSessions();
    // 10 saniyede bir session bilgilerini tazele
    pollingRef.current = setInterval(loadSessions, 10000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
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
      setEditingName('');
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

  async function deleteTable(id: string) {
    if (!confirm('Bu masayı silmek istediğinize emin misiniz?')) return;
    try {
      await apiRequest(`/admin/tables/${id}`, { method: 'DELETE', token: accessToken });
      await loadTables();
      showToast('Masa silindi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Silinemedi.', 'error');
    }
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
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });

      if (res.status === 409) {
        // Pending siparişler var, kullanıcıya sor
        const body = await res.json();
        setCloseModal({ sessionId, tableName, pendingCount: body.pending_count });
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Hata' }));
        throw new Error(body.message || 'Masa kapatılamadı.');
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

  // Masaları session bilgisiyle birleştir
  const tablesWithSession = tables.map(t => {
    const session = sessions.find(s => s.table_id === t.id);
    return { ...t, session };
  });

  return (
    <div>
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: toast.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`}}>
          {toast.message}
        </div>
      )}

      {/* Yeni Masa Ekle */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm max-w-2xl" style={{border: '1px solid #E2E8F0'}}>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{color: '#64748B'}}>Yeni Masa Ekle</h2>
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTable()}
            placeholder="Örn: Masa 1, Bahçe 3, VIP..."
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A'}}
          />
          <button onClick={addTable}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{background: '#0F172A'}}>
            + Ekle
          </button>
        </div>
      </div>

      {/* Özet sayaçlar */}
      {tables.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="px-4 py-2 rounded-xl" style={{background: '#ECFDF5', border: '1px solid #A7F3D0'}}>
            <span className="text-xs font-semibold" style={{color: '#065F46'}}>
              🟢 Boş: {tablesWithSession.filter(t => t.is_active && !t.session).length}
            </span>
          </div>
          <div className="px-4 py-2 rounded-xl" style={{background: '#FEF2F2', border: '1px solid #FECACA'}}>
            <span className="text-xs font-semibold" style={{color: '#991B1B'}}>
              🔴 Dolu: {tablesWithSession.filter(t => t.is_active && t.session).length}
            </span>
          </div>
          {tablesWithSession.filter(t => t.session).length > 0 && (
            <div className="px-4 py-2 rounded-xl" style={{background: '#F0F9FF', border: '1px solid #BAE6FD'}}>
              <span className="text-xs font-semibold" style={{color: '#0C4A6E'}}>
                💰 Toplam Açık Adisyon: {formatPrice(sessions.reduce((sum, s) => sum + s.cached_total_int, 0))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Masa Kartları — Grid */}
      <div className="grid gap-4"
        style={{gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))'}}>
        {tablesWithSession.map(table => (
          <TableCard
            key={table.id}
            table={table}
            session={table.session}
            editing={editingId === table.id}
            editingName={editingName}
            onStartEdit={() => { setEditingId(table.id); setEditingName(table.name); }}
            onChangeEditName={setEditingName}
            onSaveEdit={() => saveTable(table)}
            onCancelEdit={() => { setEditingId(null); setEditingName(''); }}
            onToggleActive={() => toggleActive(table)}
            onDelete={() => deleteTable(table.id)}
            onOpenDetail={() => table.session && openDetail(table.session.id)}
            onCloseSession={() => table.session && tryCloseSession(table.session.id, table.name)}
          />
        ))}

        {tables.length === 0 && (
          <div className="col-span-full text-center py-16 rounded-2xl" style={{background: 'white', border: '1px dashed #E2E8F0'}}>
            <div className="text-4xl mb-3">🪑</div>
            <p className="text-sm" style={{color: '#94A3B8'}}>Henüz masa yok</p>
            <p className="text-xs mt-1" style={{color: '#CBD5E1'}}>Yukarıdan yeni masa ekleyin</p>
          </div>
        )}
      </div>

      {/* Detay Modalı */}
      {detailOpen && (
        <div style={{position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.6)', padding: 16}}
          onClick={() => { setDetailOpen(null); setDetailData(null); }}>
          <div style={{background: 'white', borderRadius: 20, maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}
            onClick={e => e.stopPropagation()}>

            <div style={{padding: '20px 24px 12px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h3 style={{fontWeight: 700, fontSize: 18, color: '#0F172A', fontFamily: 'Georgia, serif'}}>
                {detailData?.table?.name ?? 'Masa Detayı'}
              </h3>
              <button onClick={() => { setDetailOpen(null); setDetailData(null); }}
                style={{width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#F1F5F9', color: '#64748B', cursor: 'pointer', fontSize: 14}}>✕</button>
            </div>

            <div style={{flex: 1, overflowY: 'auto', padding: '16px 24px'}}>
              {detailLoading ? (
                <div style={{textAlign: 'center', padding: 40}}>
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{borderColor: '#0D9488', borderTopColor: 'transparent'}}></div>
                </div>
              ) : detailData ? (
                <>
                  {/* Özet */}
                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16}}>
                    <div style={{padding: 10, background: '#F0FDFA', borderRadius: 10, textAlign: 'center'}}>
                      <div style={{fontSize: 10, color: '#0F766E', textTransform: 'uppercase', fontWeight: 600}}>Adisyon</div>
                      <div style={{fontSize: 14, fontWeight: 700, color: '#0D9488', marginTop: 2}}>
                        {formatPrice(detailData.session?.cached_total_int ?? 0)}
                      </div>
                    </div>
                    <div style={{padding: 10, background: '#F8FAFC', borderRadius: 10, textAlign: 'center'}}>
                      <div style={{fontSize: 10, color: '#64748B', textTransform: 'uppercase', fontWeight: 600}}>Teslim</div>
                      <div style={{fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 2}}>
                        {detailData.orders.filter(o => o.status === 'delivered').length}
                      </div>
                    </div>
                    <div style={{padding: 10, background: '#FFFBEB', borderRadius: 10, textAlign: 'center'}}>
                      <div style={{fontSize: 10, color: '#B45309', textTransform: 'uppercase', fontWeight: 600}}>Bekliyor</div>
                      <div style={{fontSize: 14, fontWeight: 700, color: '#B45309', marginTop: 2}}>
                        {detailData.orders.filter(o => ['pending','preparing','ready'].includes(o.status)).length}
                      </div>
                    </div>
                  </div>

                  {/* Siparişler */}
                  {detailData.orders.length === 0 ? (
                    <p style={{textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: 20}}>Henüz sipariş yok.</p>
                  ) : (
                    detailData.orders.map((order, idx) => (
                      <div key={order.id} style={{marginBottom: 10, border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden'}}>
                        <div style={{padding: '8px 12px', background: order.status === 'delivered' ? '#F0FDF4' : order.status === 'cancelled' ? '#FEF2F2' : '#FFFBEB', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <span style={{fontSize: 12, fontWeight: 700, color: order.status === 'delivered' ? '#065F46' : order.status === 'cancelled' ? '#991B1B' : '#B45309'}}>
                            #{idx + 1} · {
                              order.status === 'pending' ? 'Bekliyor' :
                              order.status === 'preparing' ? 'Hazırlanıyor' :
                              order.status === 'ready' ? 'Hazır' :
                              order.status === 'delivered' ? 'Teslim Edildi ✓' :
                              order.status === 'cancelled' ? 'İptal Edildi' : order.status
                            }
                          </span>
                          <span style={{fontSize: 11, color: '#64748B'}}>
                            {new Date(order.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}
                          </span>
                        </div>
                        <div style={{padding: '8px 12px'}}>
                          {order.items.map(item => (
                            <div key={item.id} style={{display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: '#0F172A'}}>
                              <span>{item.quantity}x {item.product_name}</span>
                              <span style={{color: '#64748B'}}>{formatPrice(item.price_int * item.quantity)}</span>
                            </div>
                          ))}
                          {order.note && (
                            <div style={{marginTop: 6, fontSize: 11, color: '#92400E', background: '#FEF3C7', padding: '4px 8px', borderRadius: 6}}>
                              📝 {order.note}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              ) : null}
            </div>

            {detailData && detailData.session?.status === 'open' && (
              <div style={{padding: '12px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 10}}>
                <button
                  onClick={() => detailData.session && tryCloseSession(detailData.session.id, detailData.table?.name ?? 'Masa')}
                  style={{flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#DC2626', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer'}}>
                  Masayı Kapat & Tahsil Et
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Sipariş Uyarı Modalı */}
      {closeModal && (
        <div style={{position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.7)', padding: 16}}
          onClick={() => setCloseModal(null)}>
          <div style={{background: 'white', borderRadius: 20, maxWidth: 440, width: '100%', padding: 24}}
            onClick={e => e.stopPropagation()}>
            <div style={{fontSize: 32, textAlign: 'center', marginBottom: 8}}>⚠️</div>
            <h3 style={{fontWeight: 700, fontSize: 17, color: '#0F172A', textAlign: 'center', marginBottom: 8, fontFamily: 'Georgia, serif'}}>
              Teslim Edilmemiş Sipariş Var
            </h3>
            <p style={{fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20, lineHeight: 1.5}}>
              <strong>{closeModal.tableName}</strong> masasında <strong>{closeModal.pendingCount}</strong> tane teslim edilmemiş sipariş var. Ne yapılsın?
            </p>

            <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
              <button
                onClick={() => tryCloseSession(closeModal.sessionId, closeModal.tableName, 'transfer')}
                style={{padding: '12px', borderRadius: 10, border: '1.5px solid #0D9488', background: 'white', color: '#0D9488', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left'}}>
                🔄 Yeni müşteriye ait — yeni masa aç
                <div style={{fontSize: 11, fontWeight: 400, marginTop: 4, color: '#64748B'}}>Bekleyen siparişler yeni oturuma taşınır.</div>
              </button>
              <button
                onClick={() => tryCloseSession(closeModal.sessionId, closeModal.tableName, 'cancel_pending')}
                style={{padding: '12px', borderRadius: 10, border: '1.5px solid #DC2626', background: 'white', color: '#DC2626', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left'}}>
                ❌ Bekleyenleri iptal et ve masayı kapat
                <div style={{fontSize: 11, fontWeight: 400, marginTop: 4, color: '#64748B'}}>Bekleyen siparişler iptal edilir.</div>
              </button>
              <button
                onClick={() => setCloseModal(null)}
                style={{padding: '12px', borderRadius: 10, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', fontWeight: 700, fontSize: 13, cursor: 'pointer'}}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Masa Kart Komponenti ---

type TableCardProps = {
  table: Table;
  session: SessionInfo | undefined;
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
};

function TableCard({
  table, session, editing, editingName,
  onStartEdit, onChangeEditName, onSaveEdit, onCancelEdit,
  onToggleActive, onDelete, onOpenDetail, onCloseSession
}: TableCardProps) {

  const isOccupied = !!session;
  const isPassive = !table.is_active;

  // Kronometre — sadece dolu ise
  const duration = session ? useDuration(session.opened_at) : null;

  // Renk paleti
  const colors = isPassive
    ? { bg: '#F8FAFC', border: '#E2E8F0', accent: '#94A3B8', chipBg: '#F1F5F9', chipText: '#64748B' }
    : isOccupied
    ? { bg: '#FEF2F2', border: '#FECACA', accent: '#DC2626', chipBg: '#FEE2E2', chipText: '#991B1B' }
    : { bg: '#F0FDF4', border: '#A7F3D0', accent: '#059669', chipBg: '#D1FAE5', chipText: '#065F46' };

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      opacity: isPassive ? 0.7 : 1,
      display: 'flex',
      flexDirection: 'column'
    }}>

      {/* Üst şerit — durum */}
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
          {isPassive ? 'Pasif' : isOccupied ? '● Dolu' : '○ Boş'}
        </span>
        {isOccupied && duration && (
          <span style={{fontFamily: 'monospace', fontWeight: 700}}>⏱ {duration}</span>
        )}
      </div>

      {/* Ana içerik */}
      <div style={{padding: 16, flex: 1}}>
        {editing ? (
          <input
            value={editingName}
            onChange={e => onChangeEditName(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
            style={{border: '1.5px solid #0D9488', background: 'white'}}
          />
        ) : (
          <div style={{marginBottom: 12}}>
            <h3 style={{fontWeight: 700, fontSize: 20, color: '#0F172A', fontFamily: 'Georgia, serif', lineHeight: 1.1}}>
              {table.name}
            </h3>
          </div>
        )}

        {/* Dolu ise session bilgileri */}
        {isOccupied && session && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'white', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)'}}>
              <span style={{fontSize: 11, color: '#64748B', fontWeight: 600}}>Adisyon</span>
              <span style={{fontSize: 15, fontWeight: 800, color: colors.accent}}>
                {formatPrice(session.cached_total_int)}
              </span>
            </div>
            <div style={{display: 'flex', gap: 6}}>
              <div style={{flex: 1, padding: '5px 8px', background: 'white', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(0,0,0,0.04)'}}>
                <div style={{fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase'}}>Teslim</div>
                <div style={{fontSize: 13, fontWeight: 700, color: '#065F46'}}>{session.delivered_count}</div>
              </div>
              <div style={{flex: 1, padding: '5px 8px', background: 'white', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(0,0,0,0.04)'}}>
                <div style={{fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase'}}>Bekliyor</div>
                <div style={{fontSize: 13, fontWeight: 700, color: '#B45309'}}>{session.pending_count}</div>
              </div>
            </div>
          </div>
        )}

        {/* Boş ise minimal bilgi */}
        {!isOccupied && !editing && !isPassive && (
          <div style={{padding: '14px 8px', textAlign: 'center', background: 'white', borderRadius: 10, border: '1px dashed #A7F3D0', marginBottom: 12}}>
            <div style={{fontSize: 11, color: '#065F46', fontWeight: 600}}>Müşteri bekleniyor</div>
          </div>
        )}
      </div>

      {/* Alt butonlar */}
      <div style={{padding: '10px 14px 14px', borderTop: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 6}}>

        {/* Dolu masa için hesap butonları */}
        {isOccupied && !editing && (
          <div style={{display: 'flex', gap: 6}}>
            <button onClick={onOpenDetail}
              style={{flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#0F172A', color: 'white', fontWeight: 700, fontSize: 11, cursor: 'pointer'}}>
              💰 Hesabı Gör
            </button>
            <button onClick={onCloseSession}
              style={{flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#DC2626', color: 'white', fontWeight: 700, fontSize: 11, cursor: 'pointer'}}>
              🔒 Masa Kapat
            </button>
          </div>
        )}

        {/* Yönetim butonları */}
        <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
          {editing ? (
            <>
              <button onClick={onSaveEdit}
                style={{flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: '#0D9488', color: 'white', fontWeight: 700, fontSize: 11, cursor: 'pointer'}}>
                Kaydet
              </button>
              <button onClick={onCancelEdit}
                style={{flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: '#F1F5F9', color: '#64748B', fontWeight: 700, fontSize: 11, cursor: 'pointer'}}>
                İptal
              </button>
            </>
          ) : (
            <>
              <button onClick={onStartEdit}
                style={{flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', color: '#0F172A', fontWeight: 600, fontSize: 11, cursor: 'pointer'}}>
                Düzenle
              </button>
              <button onClick={onToggleActive}
                style={{flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', color: table.is_active ? '#DC2626' : '#16A34A', fontWeight: 600, fontSize: 11, cursor: 'pointer'}}>
                {table.is_active ? 'Pasif' : 'Aktif'}
              </button>
              <button onClick={onDelete}
                style={{flex: 1, padding: '6px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 600, fontSize: 11, cursor: 'pointer'}}>
                Sil
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}