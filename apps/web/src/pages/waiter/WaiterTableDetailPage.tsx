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
  const { token, waiter, logout } = useWaiterAuth();
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
    if (!token || !id) return;
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
  }

  async function loadDetail() {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getTableDetail(token, id);
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
    if (!token) return;
    const newQty = currentQty + delta;
    if (newQty < 1) return;

    try {
      await updateItemQuantity(token, itemId, newQty);
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
    if (!token || !cancelModal) return;

    if (cancelReason === 'other' && cancelText.trim().length < 3) {
      showToast('"Diğer" sebebi için açıklama yazmalısınız (min 3 karakter).', 'error');
      return;
    }

    setCancelling(true);
    try {
      const result = await cancelOrder(
        token,
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
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mb-3"
          style={{ borderColor: '#0D9488', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#64748B' }}>Yükleniyor...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <button onClick={() => navigate('/garson')}
          className="mb-4 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: '#F1F5F9', color: '#64748B' }}>
          ← Masalar
        </button>
        <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #FECACA' }}>
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-sm" style={{ color: '#DC2626' }}>{error ?? 'Masa bulunamadı.'}</p>
        </div>
      </div>
    );
  }

  const canCancelOrders = waiter?.permissions.can_delete_items ?? false;

  return (
    <div style={{ paddingBottom: 100 }}>

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

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate('/garson')}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: '#F1F5F9', color: '#64748B' }}>
          ←
        </button>
        <h2 className="font-bold text-xl flex-1" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
          🍽️ {data.table.name}
        </h2>
        <button onClick={() => loadDetail()}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: '#F1F5F9', color: '#64748B' }}>
          🔄
        </button>
      </div>

      {/* ─────────────────────────────────────────────── */}
      {/* ÇAĞRILAR — call_type ile zenginleştirilmiş      */}
      {/* ─────────────────────────────────────────────── */}
      {data.active_calls.length > 0 && (
        <div className="space-y-2 mb-4">
          {data.active_calls.map(call => {
            const info = getCallInfo(call.call_type);
            const cardBg = info.critical ? '#FEF2F2' : '#FFFBEB';
            const cardBorder = info.critical ? '#FECACA' : '#FDE68A';
            const titleColor = info.critical ? '#991B1B' : '#92400E';
            const accentColor = info.critical ? '#DC2626' : '#B45309';

            return (
              <div key={call.id}
                className="rounded-2xl overflow-hidden"
                style={{
                  background: cardBg,
                  border: `2px solid ${cardBorder}`
                }}>
                <div style={{
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>
                    {info.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      color: accentColor, marginBottom: 2
                    }}>
                      {info.critical ? '⚠️ Acil İstek' : 'Müşteri Çağrısı'}
                    </div>
                    <div style={{
                      fontSize: 16, fontWeight: 800,
                      color: titleColor, lineHeight: 1.2,
                      fontFamily: 'Georgia, serif'
                    }}>
                      {info.label}
                    </div>
                    {call.note && call.note.trim() && (
                      <div style={{
                        fontSize: 13, color: '#0F172A',
                        marginTop: 6, padding: '6px 8px',
                        background: 'white', borderRadius: 6,
                        border: `1px solid ${cardBorder}`
                      }}>
                        📝 {call.note}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  padding: '8px 14px',
                  background: 'rgba(255,255,255,0.5)',
                  borderTop: `1px solid ${cardBorder}`,
                  fontSize: 11,
                  color: '#64748B',
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
          <div className="mb-4 p-4 rounded-2xl bg-white" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
                  Açık Adisyon
                </div>
                <div className="font-bold text-2xl mt-1" style={{ color: '#0D9488', fontFamily: 'Georgia, serif' }}>
                  {formatPrice(data.session.total_int)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs" style={{ color: '#64748B' }}>Açılış</div>
                <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                  {new Date(data.session.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="font-bold text-sm mb-2" style={{ color: '#0F172A' }}>
              📋 Siparişler ({data.orders.length})
            </div>
            {data.orders.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl" style={{ border: '1px dashed #E2E8F0' }}>
                <p className="text-sm" style={{ color: '#94A3B8' }}>Henüz sipariş yok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.orders.map((order, idx) => {
                  const isEditable = ['pending', 'preparing', 'ready'].includes(order.status);
                  const isDelivered = order.status === 'delivered';
                  const orderLabel = `#${idx + 1}`;

                  return (
                    <div key={order.id} className="bg-white rounded-2xl overflow-hidden"
                      style={{ border: '1px solid #E2E8F0' }}>
                      <div className="px-4 py-2 flex items-center justify-between"
                        style={{
                          background: order.status === 'delivered' ? '#F0FDF4' :
                                      order.status === 'cancelled' ? '#FEF2F2' :
                                      order.status === 'ready' ? '#D1FAE5' :
                                      order.status === 'preparing' ? '#E0F2FE' : '#FFFBEB'
                        }}>
                        <span className="text-xs font-bold" style={{
                          color: order.status === 'delivered' ? '#065F46' :
                                 order.status === 'cancelled' ? '#991B1B' :
                                 order.status === 'ready' ? '#065F46' :
                                 order.status === 'preparing' ? '#0369A1' : '#B45309'
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
                          <span className="text-xs font-semibold" style={{ color: '#0D9488' }}>
                            👤 {order.waiter_name}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: '#94A3B8' }}>
                            📱 Müşteri
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-2">
                        {order.items.map(item => (
                          <div key={item.id}
                            className="py-2"
                            style={{ borderBottom: '1px solid #F8FAFC' }}>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                                  {item.product_name}
                                </div>
                                <div className="text-xs" style={{ color: '#64748B' }}>
                                  {formatPrice(item.price_int)} × {item.quantity} = {formatPrice(item.price_int * item.quantity)}
                                </div>
                              </div>

                              {isEditable ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity, -1)}
                                    disabled={item.quantity <= 1}
                                    className="w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center"
                                    style={{
                                      background: '#F1F5F9',
                                      color: '#0F172A',
                                      opacity: item.quantity <= 1 ? 0.3 : 1
                                    }}>−</button>
                                  <span className="font-bold text-sm w-6 text-center" style={{ color: '#0F172A' }}>
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity, 1)}
                                    className="w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center text-white"
                                    style={{ background: '#0D9488' }}>+</button>
                                </div>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded-lg"
                                  style={{ background: '#F1F5F9', color: '#94A3B8' }}>
                                  {item.quantity}x
                                </span>
                              )}
                            </div>

                            {/* ÜRÜN BAŞINA NOT — sarı şerit */}
                            {item.note && item.note.trim() && (
                              <div className="mt-1.5 px-2 py-1 rounded-lg text-xs"
                                style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                                📝 {item.note}
                              </div>
                            )}
                          </div>
                        ))}
                        {order.note && (
                          <div className="mt-2 px-2 py-1 rounded-lg text-xs"
                            style={{ background: '#FEF3C7', color: '#92400E' }}>
                            📋 <strong>Genel:</strong> {order.note}
                          </div>
                        )}
                      </div>

                      {isEditable && canCancelOrders && (
                        <div className="px-4 py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                          <button
                            onClick={() => openCancelModal(order.id, orderLabel)}
                            className="w-full py-2 rounded-xl text-xs font-semibold"
                            style={{ background: '#FEF2F2', color: '#DC2626' }}>
                            ❌ Siparişi İptal Et
                          </button>
                        </div>
                      )}

                      {isDelivered && (
                        <div className="px-4 py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                          <div className="text-xs text-center" style={{ color: '#94A3B8' }}>
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
        <div className="mb-4 p-8 rounded-2xl bg-white text-center" style={{ border: '1px dashed #E2E8F0' }}>
          <div className="text-4xl mb-2">🪑</div>
          <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>Masa boş</p>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
            Sipariş alarak yeni adisyon açın.
          </p>
        </div>
      )}

      <div className="fixed bottom-20 left-4 right-4 z-30 mx-auto" style={{ maxWidth: 480 }}>
        <button
          onClick={() => navigate(`/garson/masa/${id}/menu`)}
          className="w-full py-3 rounded-2xl text-sm font-bold text-white shadow-2xl"
          style={{ background: '#0D9488' }}>
          ➕ Sipariş Al
        </button>
      </div>

      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.7)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
              <h3 className="font-bold text-base" style={{ color: '#DC2626', fontFamily: 'Georgia, serif' }}>
                ❌ Sipariş İptal — {cancelModal.orderLabel}
              </h3>
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                İptal sebebini seç. Bu işlem loglanır.
              </p>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              <div>
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#64748B' }}>
                  İptal Sebebi
                </label>
                <div className="space-y-1.5">
                  {CANCEL_REASON_OPTIONS.map(opt => (
                    <label key={opt.code}
                      className="flex items-center gap-2 p-2.5 rounded-xl cursor-pointer"
                      style={{
                        background: cancelReason === opt.code ? '#FEF2F2' : '#F8FAFC',
                        border: '1px solid ' + (cancelReason === opt.code ? '#FECACA' : '#E2E8F0')
                      }}>
                      <input type="radio"
                        name="reason"
                        value={opt.code}
                        checked={cancelReason === opt.code}
                        onChange={() => setCancelReason(opt.code)}
                        style={{ width: 16, height: 16 }} />
                      <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {cancelReason === 'other' && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>
                    Açıklama (zorunlu, min 3 karakter)
                  </label>
                  <textarea value={cancelText}
                    onChange={e => setCancelText(e.target.value)}
                    placeholder="İptal sebebini açıkla..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                    style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC' }} />
                </div>
              )}
            </div>
            <div className="px-5 py-4 flex gap-2" style={{ borderTop: '1px solid #E2E8F0' }}>
              <button onClick={() => setCancelModal(null)}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#F1F5F9', color: '#64748B' }}>
                Vazgeç
              </button>
              <button onClick={handleCancelOrder}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: cancelling ? '#475569' : '#DC2626' }}>
                {cancelling ? 'İptal ediliyor...' : 'Siparişi İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}