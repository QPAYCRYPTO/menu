// apps/web/src/pages/waiter/WaiterTableDetailPage.tsx
// CHANGELOG v6:
// - Çağrı kartı artık call_type kullanıyor (büyük emoji + label)
// - Kritik türler kırmızı kart
// - "Diğer" türü için müşteri açıklaması gösteriliyor
// - Birden fazla çağrı varsa hepsi ayrı kart

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { getCallInfo } from '../../context/WaiterCallsContext';
import {
  WaiterTableDetail,
  CANCEL_REASON_OPTIONS,
  CancelReasonCode,
  getTableDetail,
  updateItemQuantity,
  cancelOrder
} from '../../api/waiterPublicApi';

type ToastState = { message: string; type: 'error' | 'success' } | null;

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

export function WaiterTableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, tabId, waiter, logout } = useWaiterAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<WaiterTableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const [cancelModal, setCancelModal] = useState<{
    orderId: string;
    orderLabel: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState<CancelReasonCode>('customer_cancelled');
  const [cancelText, setCancelText] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!token || !tabId || !id) return;
    loadDetail();
  }, [token, tabId, id]);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
  }

  async function loadDetail() {
    if (!token || !tabId || !id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getTableDetail(token, tabId, id);
      setData(result);
    } catch (e) {
      if (e instanceof Error && e.message.includes('reason')) {
        logout();
        return;
      }
      setError(e instanceof Error ? e.message : 'Masa detayı alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  async function handleQuantityChange(itemId: string, currentQty: number, delta: number) {
    if (!token || !tabId) return;
    const newQty = currentQty + delta;
    if (newQty < 1) return;

    try {
      await updateItemQuantity(token, tabId, itemId, newQty);
      showToast('Adet güncellendi', 'success');
      await loadDetail();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata', 'error');
    }
  }

  function openCancelModal(orderId: string, orderLabel: string) {
    setCancelModal({ orderId, orderLabel });
    setCancelReason('customer_cancelled');
    setCancelText('');
  }

  async function handleCancelOrder() {
    if (!token || !tabId || !cancelModal) return;

    if (cancelReason === 'other' && cancelText.trim().length < 3) {
      showToast('"Diğer" sebebi için açıklama yazmalısınız (min 3 karakter).', 'error');
      return;
    }

    setCancelling(true);
    try {
      const result = await cancelOrder(
        token,
        tabId,
        cancelModal.orderId,
        cancelReason,
        cancelText.trim() || undefined
      );

      showToast(
        result.session_auto_closed
          ? 'Sipariş iptal edildi · Masa boş'
          : 'Sipariş iptal edildi',
        'success'
      );

      setCancelModal(null);
      await loadDetail();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'İptal edilemedi', 'error');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-panel rounded-3xl text-center py-14 text-white">
        <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-white/80">Yükleniyor...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-white">
        <button onClick={() => navigate('/garson')}
          className="glass-pill mb-3 min-h-[36px] px-3.5 py-2 rounded-2xl text-xs font-bold spring-btn">
          ← Masalar
        </button>
        <div className="glass-card text-center py-14 rounded-3xl" style={{ borderColor: 'rgba(251,113,133,0.55)' }}>
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>{error ?? 'Masa bulunamadı.'}</p>
        </div>
      </div>
    );
  }

  const canCancelOrders = waiter?.permissions.can_delete_items ?? false;

  return (
    <div className="text-white" style={{ paddingBottom: 100 }}>

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

      <div className="glass-panel rounded-3xl p-2.5 flex items-center gap-2 mb-3">
        <button onClick={() => navigate('/garson')} aria-label="Masalar"
          className="glass-pill w-10 h-10 rounded-2xl text-sm font-bold flex items-center justify-center flex-shrink-0 spring-btn">
          <i className="fa-solid fa-chevron-left" />
        </button>
        <h2 className="font-serif font-bold text-xl flex-1 truncate">
          🍽️ {data.table.name}
        </h2>
        <button onClick={() => loadDetail()} aria-label="Yenile"
          className="glass-pill w-10 h-10 rounded-2xl text-sm flex items-center justify-center flex-shrink-0 spring-btn">
          🔄
        </button>
      </div>

      {/* ─────────────────────────────────────────────── */}
      {/* ÇAĞRILAR — call_type ile zenginleştirilmiş      */}
      {/* ─────────────────────────────────────────────── */}
      {data.active_calls.length > 0 && (
        <div className="space-y-2 mb-3">
          {data.active_calls.map(call => {
            const info = getCallInfo(call.call_type);
            const edgeColor = info.critical ? '#FB7185' : '#FBBF24';
            const accentColor = info.critical ? 'var(--danger)' : 'var(--warning)';

            return (
              <div key={call.id}
                className="glass-dark rounded-3xl overflow-hidden fade-enter"
                style={{
                  background: info.critical ? 'rgba(60,14,22,0.66)' : 'rgba(40,28,12,0.64)',
                  borderLeft: `5px solid ${edgeColor}`
                }}>
                <div style={{
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <div className="glass-pill w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ fontSize: 28, lineHeight: 1 }}>
                    {info.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: accentColor, marginBottom: 2
                    }}>
                      {info.critical ? '⚠️ Acil İstek' : 'Müşteri Çağrısı'}
                    </div>
                    <div className="font-serif font-bold text-white" style={{ fontSize: 16, lineHeight: 1.2 }}>
                      {info.label}
                    </div>
                    {call.note && call.note.trim() && (
                      <div className="glass-pill" style={{
                        fontSize: 13,
                        marginTop: 6, padding: '6px 9px',
                        borderRadius: 10
                      }}>
                        📝 {call.note}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  padding: '8px 14px',
                  background: 'rgba(0,0,0,0.2)',
                  borderTop: '1px solid rgba(255,255,255,0.14)',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textAlign: 'center'
                }}>
                  💡 İlgilenmek için Çağrılar sekmesine git
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.session ? (
        <>
          <div className="glass-panel mb-3 p-4 rounded-3xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                  Açık Adisyon
                </div>
                <div className="font-serif font-bold text-3xl mt-1 text-amber-300">
                  {formatPrice(data.session.total_int)}
                </div>
              </div>
              <div className="glass-pill text-right rounded-2xl px-3 py-1.5">
                <div className="text-[10px] text-white/70 font-medium">Açılış</div>
                <div className="text-sm font-extrabold">
                  {new Date(data.session.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="font-serif font-bold text-base">
                📋 Siparişler ({data.orders.length})
              </div>
              <div className="flex-1 h-px bg-white/20" />
            </div>
            {data.orders.length === 0 ? (
              <div className="glass-card text-center py-8 rounded-3xl">
                <p className="text-sm text-white/70">Henüz sipariş yok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.orders.map((order, idx) => {
                  const isEditable = ['pending', 'preparing', 'ready'].includes(order.status);
                  const isDelivered = order.status === 'delivered';
                  const orderLabel = `#${idx + 1}`;

                  return (
                    <div key={order.id} className="glass-dark rounded-3xl overflow-hidden">
                      <div className="px-4 py-2.5 flex items-center justify-between"
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.14)',
                          background: order.status === 'delivered' ? 'var(--success-bg)' :
                                      order.status === 'cancelled' ? 'var(--danger-bg)' :
                                      order.status === 'ready' ? 'var(--success-bg)' :
                                      order.status === 'preparing' ? 'var(--info-bg)' : 'var(--warning-bg)'
                        }}>
                        <span className="text-xs font-extrabold" style={{
                          color: order.status === 'delivered' ? 'var(--success)' :
                                 order.status === 'cancelled' ? 'var(--danger)' :
                                 order.status === 'ready' ? 'var(--success)' :
                                 order.status === 'preparing' ? 'var(--info)' : 'var(--warning)'
                        }}>
                          {orderLabel} · {
                            order.status === 'pending' ? 'Bekliyor' :
                            order.status === 'preparing' ? 'Hazırlanıyor' :
                            order.status === 'ready' ? 'Hazır' :
                            order.status === 'delivered' ? 'Teslim ✓' :
                            order.status === 'cancelled' ? 'İptal' : order.status
                          }
                        </span>
                        {order.waiter_name ? (
                          <span className="text-xs font-bold" style={{ color: '#FDBA74' }}>
                            👤 {order.waiter_name}
                          </span>
                        ) : (
                          <span className="text-xs text-white/60">
                            📱 Müşteri
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-2">
                        {order.items.map(item => (
                          <div key={item.id}
                            className="py-2"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold">
                                  {item.product_name}
                                </div>
                                <div className="text-xs text-white/65">
                                  {formatPrice(item.price_int)} × {item.quantity} = <span className="font-bold text-amber-300">{formatPrice(item.price_int * item.quantity)}</span>
                                </div>
                              </div>

                              {isEditable ? (
                                <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/20">
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity, -1)}
                                    disabled={item.quantity <= 1}
                                    className="w-9 h-9 rounded-lg bg-white/20 font-bold text-sm flex items-center justify-center spring-btn"
                                    style={{
                                      opacity: item.quantity <= 1 ? 0.3 : 1
                                    }}>−</button>
                                  <span className="font-extrabold text-sm w-6 text-center">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity, 1)}
                                    className="btn-accent w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center spring-btn">+</button>
                                </div>
                              ) : (
                                <span className="glass-pill text-xs font-bold px-2.5 py-1 rounded-lg text-white/75">
                                  {item.quantity}x
                                </span>
                              )}
                            </div>

                            {/* ÜRÜN BAŞINA NOT — sarı şerit */}
                            {item.note && item.note.trim() && (
                              <div className="mt-1.5 px-2.5 py-1.5 rounded-xl text-xs"
                                style={{ background: 'rgba(245,158,11,0.2)', color: '#FDE68A', border: '1px solid rgba(251,191,36,0.35)' }}>
                                📝 {item.note}
                              </div>
                            )}
                          </div>
                        ))}
                        {order.note && (
                          <div className="mt-2 mb-1 px-2.5 py-1.5 rounded-xl text-xs"
                            style={{ background: 'rgba(245,158,11,0.2)', color: '#FDE68A', border: '1px solid rgba(251,191,36,0.35)' }}>
                            📋 <strong>Genel:</strong> {order.note}
                          </div>
                        )}
                      </div>

                      {isEditable && canCancelOrders && (
                        <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                          <button
                            onClick={() => openCancelModal(order.id, orderLabel)}
                            className="w-full min-h-[38px] py-2 rounded-full text-xs font-bold spring-btn"
                            style={{ background: 'var(--danger-bg)', color: '#FECDD3', border: '1px solid rgba(251,113,133,0.45)' }}>
                            ❌ Siparişi İptal Et
                          </button>
                        </div>
                      )}

                      {isDelivered && (
                        <div className="px-4 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                          <div className="text-xs text-center text-white/55">
                            Teslim edildi · Adisyon kasada kapatılır
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="glass-card mb-3 p-8 rounded-3xl text-center">
          <div className="text-4xl mb-2">🪑</div>
          <p className="font-serif font-bold text-base">Masa boş</p>
          <p className="text-xs mt-1 text-white/65">
            Sipariş alarak yeni adisyon açın.
          </p>
        </div>
      )}

      <div className="fixed bottom-[92px] left-4 right-4 z-30 mx-auto" style={{ maxWidth: 480 }}>
        <button
          onClick={() => navigate(`/garson/masa/${id}/menu`)}
          className="btn-accent w-full py-3.5 rounded-full text-sm font-extrabold flex items-center justify-center gap-2 spring-btn">
          <i className="fa-solid fa-plus" /> Sipariş Al
        </button>
      </div>

      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-md fade-enter">
          <div className="glass-dark sheet-enter w-full max-w-[520px] rounded-t-[32px] flex flex-col border-t border-white/60 text-white"
            style={{ maxHeight: '90vh' }}>
            <div className="w-10 h-1 bg-white/40 rounded-full mx-auto mt-3" />
            <div className="px-5 pt-3 pb-3 border-b border-white/20">
              <h3 className="font-serif font-bold text-lg" style={{ color: 'var(--danger)' }}>
                ❌ Sipariş İptal — {cancelModal.orderLabel}
              </h3>
              <p className="text-xs mt-1 text-white/65">
                İptal sebebini seç. Bu işlem loglanır.
              </p>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              <div>
                <label className="block text-[11px] font-bold mb-2 uppercase tracking-wider text-white/70">
                  İptal Sebebi
                </label>
                <div className="space-y-1.5">
                  {CANCEL_REASON_OPTIONS.map(opt => (
                    <label key={opt.code}
                      className="flex items-center gap-2.5 p-3 min-h-[44px] rounded-2xl cursor-pointer transition-colors"
                      style={{
                        background: cancelReason === opt.code ? 'var(--danger-bg)' : 'rgba(255,255,255,0.1)',
                        border: '1px solid ' + (cancelReason === opt.code ? 'rgba(251,113,133,0.7)' : 'rgba(255,255,255,0.22)')
                      }}>
                      <input type="radio"
                        name="reason"
                        value={opt.code}
                        checked={cancelReason === opt.code}
                        onChange={() => setCancelReason(opt.code)}
                        style={{ width: 16, height: 16, accentColor: '#FB7185' }} />
                      <span className="text-sm font-semibold">
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {cancelReason === 'other' && (
                <div>
                  <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-white/70">
                    Açıklama (zorunlu, min 3 karakter)
                  </label>
                  <textarea value={cancelText}
                    onChange={e => setCancelText(e.target.value)}
                    placeholder="İptal sebebini açıkla..."
                    rows={2}
                    className="glass-input w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none" />
                </div>
              )}
            </div>
            <div className="px-5 pt-3 pb-6 flex gap-2 border-t border-white/20">
              <button onClick={() => setCancelModal(null)}
                disabled={cancelling}
                className="glass-pill flex-1 py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-50">
                Vazgeç
              </button>
              <button onClick={handleCancelOrder}
                disabled={cancelling}
                className="flex-1 py-3 rounded-full text-sm font-bold text-white spring-btn disabled:opacity-60"
                style={{
                  background: cancelling ? 'rgba(255,255,255,0.18)' : 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)',
                  border: '1px solid rgba(255,255,255,0.55)',
                  boxShadow: cancelling ? 'none' : '0 8px 20px rgba(225,29,72,0.4), inset 0 1px 1px rgba(255,255,255,0.7)'
                }}>
                {cancelling ? 'İptal ediliyor...' : 'Siparişi İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
