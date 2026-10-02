// apps/web/src/pages/waiter/WaiterTableDetailPage.tsx
// CHANGELOG v6:
// - Çağrı kartı artık call_type kullanıyor (tür ikonu + label, lib/callTypes)
// - Kritik türler kırmızı kart
// - "Diğer" türü için müşteri açıklaması gösteriliyor
// - Birden fazla çağrı varsa hepsi ayrı kart
// - Atölye tasarımı: gece/gündüz uyumlu (ui-card, durum renkleri --state-*); iptal butonu temaya uyan kırmızı
// - Ürün bazlı iptal: İptal penceresinde ürünler (adetleriyle) seçilir; hepsi seçiliyse sipariş bütünüyle iptal.
//   "−" yalnızca mutfak başlamadan (Bekliyor) — sonrası iptal sayılır, pencereden sebep seçilerek yapılır.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { useLiveRefresh } from '../../context/WaiterCallsContext';
import { getCallType } from '../../lib/callTypes';
import { CallTypeBadge } from '../../components/CallTypeBadge';
import { AlertTriangle, Eye, Hourglass, ArrowLeft, Armchair, Check, ChevronLeft, ClipboardList, Lightbulb, Minus, NotebookPen, Plus, RefreshCw, Smartphone, User, UtensilsCrossed, XCircle } from 'lucide-react';
import { orderStatusStyle } from '../../lib/orderStatus';
import {
  WaiterTableDetail,
  CANCEL_REASON_OPTIONS,
  CancelReasonCode,
  getTableDetail,
  updateItemQuantity,
  cancelOrder,
  cancelOrderItems,
  type WaiterOrder
} from '../../api/waiterPublicApi';

type ToastState = { message: string; type: 'error' | 'success' } | null;

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

export function WaiterTableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, tabId, waiter } = useWaiterAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<WaiterTableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const [cancelModal, setCancelModal] = useState<{
    order: WaiterOrder;
    orderLabel: string;
    /** 'cancel': mutfak başlamadı (serbest) · 'refund': mutfak başladı (iade) · 'refund_request': iade → onaya */
    mode: 'cancel' | 'refund' | 'refund_request';
  } | null>(null);
  /** İptal edilecek adet (kalem id → adet); 0 = seçili değil */
  const [cancelQty, setCancelQty] = useState<Record<string, number>>({});
  const [cancelReason, setCancelReason] = useState<CancelReasonCode>('customer_cancelled');
  const [cancelText, setCancelText] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!token || !tabId || !id) return;
    loadDetail();
    // Yedek: canlı bağlantı kopuk kalsa bile 15 sn'de bir sessiz yenile
    const interval = setInterval(() => loadDetail(true), 15000);
    return () => clearInterval(interval);
  }, [token, tabId, id]);

  // Başka garson/admin bu masada bir şey değiştirince anında yenile
  useLiveRefresh(() => loadDetail(true));

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
  }

  async function loadDetail(silent = false) {
    if (!token || !tabId || !id) return;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await getTableDetail(token, tabId, id);
      setData(result);
    } catch (e) {
      if (e instanceof Error && e.message.includes('reason')) {
        // Oturum geçersiz: WaiterAuthContext 401 olayıyla zaten kapatır (nedeni giriş ekranında gösterilir)
        return;
      }
      if (!silent) setError(e instanceof Error ? e.message : 'Masa detayı alınamadı.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleQuantityChange(itemId: string, currentQty: number, delta: number) {
    if (!token || !tabId) return;
    const newQty = currentQty + delta;
    if (newQty < 1) return;

    try {
      const r = await updateItemQuantity(token, tabId, itemId, newQty);
      showToast(r.pending ? r.message : 'Adet güncellendi', 'success');
      await loadDetail();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Hata', 'error');
    }
  }

  function openCancelModal(order: WaiterOrder, orderLabel: string, mode: 'cancel' | 'refund' | 'refund_request') {
    setCancelModal({ order, orderLabel, mode });
    setCancelQty({});
    setCancelReason('customer_cancelled');
    setCancelText('');
  }

  async function handleCancelOrder() {
    if (!token || !tabId || !cancelModal) return;

    if (cancelReason === 'other' && cancelText.trim().length < 3) {
      showToast('"Diğer" sebebi için açıklama yazmalısınız (min 3 karakter).', 'error');
      return;
    }

    const items = cancelModal.order.items
      .filter(i => (cancelQty[i.id] ?? 0) > 0)
      .map(i => ({ order_item_id: i.id, quantity: cancelQty[i.id] }));
    if (items.length === 0) {
      showToast('İptal edilecek ürünü seçin.', 'error');
      return;
    }
    const whole = cancelModal.order.items.every(i => (cancelQty[i.id] ?? 0) >= i.quantity);

    setCancelling(true);
    try {
      // Tamamı seçildiyse mevcut sipariş iptali; değilse ürün bazlı iptal
      const result = whole
        ? await cancelOrder(token, tabId, cancelModal.order.id, cancelReason, cancelText.trim() || undefined)
        : await cancelOrderItems(token, tabId, cancelModal.order.id, items, cancelReason, cancelText.trim() || undefined);

      showToast(
        result.pending
          ? result.message
          : result.session_auto_closed
            ? 'Sipariş iptal edildi · Masa boş'
            : whole ? 'Sipariş iptal edildi' : 'Seçilen ürünler iptal edildi',
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
      <div className="ui-card rounded-3xl text-center py-14 text-ink">
        <div className="w-10 h-10 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-ink-muted">Yükleniyor...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-ink">
        <button onClick={() => navigate('/garson')}
          className="btn-outline mb-3 min-h-[36px] px-3.5 py-2 rounded-2xl text-xs font-bold spring-btn inline-flex items-center gap-1">
          <ArrowLeft size={12} aria-hidden /> Masalar
        </button>
        <div className="ui-card text-center py-14 rounded-3xl" style={{ borderColor: 'var(--state-danger)' }}>
          <div className="mb-3 flex justify-center" style={{ color: 'var(--state-danger)' }}><AlertTriangle size={36} aria-hidden /></div>
          <p className="text-sm font-semibold" style={{ color: 'var(--state-danger)' }}>{error ?? 'Masa bulunamadı.'}</p>
        </div>
      </div>
    );
  }

  // Piyasa modeli: mutfak başlamadan ("Bekliyor") iptal herkese serbest; başladıktan sonra İADE →
  // "iade" yetkisi yoksa admin onayına düşer. Başka personelin masasında işlem yetkisi yoksa salt okunur.
  const canRefund = waiter?.permissions.can_refund ?? false;
  const canEdit = data.can_edit !== false;
  const cancelModeFor = (status: string): 'cancel' | 'refund' | 'refund_request' =>
    status === 'pending' ? 'cancel' : canRefund ? 'refund' : 'refund_request';
  const CANCEL_TEXT = {
    cancel: { button: 'Siparişi İptal Et', title: 'Sipariş İptal', hint: 'Mutfak henüz başlamadı; iptal hemen uygulanır. Sebep kaydedilir.', submit: 'Siparişi İptal Et' },
    refund: { button: 'İade Et', title: 'İade', hint: 'Mutfak bu siparişe başladı; işlem iade olarak kaydedilir.', submit: 'İade Et' },
    refund_request: { button: 'İade Talebi Gönder', title: 'İade Talebi', hint: 'Mutfak bu siparişe başladı. İade yetkin yok: talep admin onayına gider, onaylanana kadar sipariş aynen kalır.', submit: 'Talebi Gönder' }
  } as const;

  return (
    <div className="text-ink" style={{ paddingBottom: 100 }}>

      {toast && (
        <div className="fixed top-24 left-4 right-4 z-50 px-4 py-3 rounded-2xl text-sm font-bold mx-auto fade-enter shadow-lg max-w-[480px]"
          role="status"
          style={{ background: toast.type === 'error' ? 'var(--state-danger)' : 'var(--state-ok)', color: 'var(--bg)' }}>
          {toast.message}
        </div>
      )}

      <div className="ui-card rounded-3xl p-2.5 flex items-center gap-2 mb-3">
        <button onClick={() => navigate('/garson')} aria-label="Masalar"
          className="ui-chip w-10 h-10 rounded-2xl text-sm font-bold flex items-center justify-center flex-shrink-0 spring-btn">
          <ChevronLeft size={14} aria-hidden />
        </button>
        <h2 className="font-serif font-bold text-xl flex-1 truncate flex items-center gap-2">
          <UtensilsCrossed size={20} className="shrink-0 text-accent" aria-hidden /> <span className="truncate">{data.table.name}</span>
        </h2>
        <button onClick={() => loadDetail()} aria-label="Yenile"
          className="ui-chip w-10 h-10 rounded-2xl text-sm flex items-center justify-center flex-shrink-0 spring-btn">
          <RefreshCw size={14} aria-hidden />
        </button>
      </div>

      {!canEdit && data.owner && (
        <div className="ui-card rounded-2xl px-4 py-3 mb-3 flex items-start gap-2.5 bg-surface-2">
          <Eye size={16} className="shrink-0 mt-0.5 text-ink-muted" aria-hidden />
          <p className="text-sm">
            Bu masa <strong>{data.owner.name}</strong> personelinde. <span className="text-ink-muted">Sadece görüntüleyebilirsin; başkasının masasında işlem yetkin yok.</span>
          </p>
        </div>
      )}

      {/* ─────────────────────────────────────────────── */}
      {/* ÇAĞRILAR — call_type ile zenginleştirilmiş      */}
      {/* ─────────────────────────────────────────────── */}
      {data.active_calls.length > 0 && (
        <div className="space-y-2 mb-3">
          {data.active_calls.map(call => {
            const info = getCallType(call.call_type);
            const tone = info.critical ? 'var(--state-danger)' : 'var(--state-warn)';

            return (
              <div key={call.id}
                className="ui-card rounded-3xl overflow-hidden fade-enter"
                style={{ borderLeft: `5px solid ${tone}` }}>
                <div className={`p-3.5 flex items-center gap-3 ${info.critical ? 'bg-state-danger-bg' : 'bg-state-warn-bg'}`}>
                  <CallTypeBadge callType={call.call_type} size={48} filled />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: tone, marginBottom: 2
                    }}>
                      {info.critical ? <span className="inline-flex items-center gap-1"><AlertTriangle size={11} aria-hidden /> Acil İstek</span> : 'Müşteri Çağrısı'}
                    </div>
                    <div className="font-serif font-bold text-ink" style={{ fontSize: 16, lineHeight: 1.2 }}>
                      {info.label}
                    </div>
                    {call.note && call.note.trim() && (
                      <div className="bg-surface border border-line" style={{
                        fontSize: 13,
                        marginTop: 6, padding: '6px 9px',
                        borderRadius: 10,
                        display: 'flex', alignItems: 'center', gap: 6
                      }}>
                        <NotebookPen size={13} style={{ flexShrink: 0 }} aria-hidden /> {call.note}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  padding: '8px 14px',
                  background: 'var(--surface-2)',
                  borderTop: '1px solid var(--line)',
                  fontSize: 11,
                  color: 'var(--ink-muted)',
                  textAlign: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                }}>
                  <Lightbulb size={12} aria-hidden /> İlgilenmek için Çağrılar sekmesine git
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.session ? (
        <>
          <div className="ui-card mb-3 p-4 rounded-3xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Açık Adisyon
                </div>
                <div className="font-serif font-bold text-3xl mt-1">
                  {formatPrice(data.session.total_int)}
                </div>
              </div>
              <div className="bg-surface-2 border border-line text-right rounded-2xl px-3 py-1.5">
                <div className="text-[10px] text-ink-muted font-medium">Açılış</div>
                <div className="text-sm font-extrabold">
                  {new Date(data.session.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="font-serif font-bold text-base flex items-center gap-2">
                <ClipboardList size={16} className="text-accent" aria-hidden /> Siparişler ({data.orders.length})
              </div>
              <div className="flex-1 h-px bg-line" />
            </div>
            {data.orders.length === 0 ? (
              <div className="ui-card text-center py-8 rounded-3xl">
                <p className="text-sm text-ink-muted">Henüz sipariş yok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.orders.map((order, idx) => {
                  const isEditable = ['pending', 'preparing', 'ready'].includes(order.status);
                  const isDelivered = order.status === 'delivered';
                  const orderLabel = `#${idx + 1}`;
                  const pendingCancel = order.pending_requests?.find(p => p.kind === 'order_cancel' || p.kind === 'items_cancel');
                  const pendingDecrease = (itemId: string) =>
                    order.pending_requests?.find(p => p.kind === 'item_decrease' && p.order_item_id === itemId);

                  return (
                    <div key={order.id} className="ui-card rounded-3xl overflow-hidden">
                      <div className="px-4 py-2.5 flex items-center justify-between"
                        style={{
                          borderBottom: '1px solid var(--line)',
                          background: orderStatusStyle(order.status).bg
                        }}>
                        <span className="text-xs font-extrabold" style={{
                          color: orderStatusStyle(order.status).fg
                        }}>
                          {orderLabel} · {
                            order.status === 'pending' ? 'Bekliyor' :
                            order.status === 'preparing' ? 'Hazırlanıyor' :
                            order.status === 'ready' ? 'Hazır' :
                            order.status === 'delivered' ? <span className="inline-flex items-center gap-1">Teslim <Check size={12} aria-hidden /></span> :
                            order.status === 'cancelled' ? 'İptal' : order.status
                          }
                        </span>
                        {order.waiter_name ? (
                          <span className="text-xs font-bold inline-flex items-center gap-1 text-accent">
                            <User size={12} aria-hidden /> {order.waiter_name}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted inline-flex items-center gap-1">
                            <Smartphone size={12} aria-hidden /> Müşteri
                          </span>
                        )}
                      </div>
                      {pendingCancel && (
                        <div className="px-4 py-2 text-xs font-bold bg-state-danger-bg text-state-danger flex items-center gap-1.5 border-b border-line">
                          <Hourglass size={13} aria-hidden />
                          {pendingCancel.kind === 'items_cancel'
                            ? <>İptal talebi admin onayında: {(pendingCancel.items ?? []).map(i => `${i.quantity}× ${i.product_name}`).join(', ')} · {pendingCancel.waiter_name}</>
                            : <>İade talebi admin onayında · {pendingCancel.waiter_name}</>}
                        </div>
                      )}
                      <div className="px-4 py-2">
                        {order.items.map(item => (
                          <div key={item.id}
                            className="py-2"
                            style={{ borderBottom: '1px solid var(--line)' }}>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold">
                                  {item.product_name}
                                </div>
                                <div className="text-xs text-ink-muted">
                                  {formatPrice(item.price_int)} × {item.quantity} = <span className="font-bold text-ink">{formatPrice(item.price_int * item.quantity)}</span>
                                </div>
                                {pendingDecrease(item.id) && (
                                  <div className="text-[11px] font-bold text-state-danger mt-0.5 flex items-center gap-1">
                                    <Hourglass size={11} aria-hidden /> {item.quantity} → {pendingDecrease(item.id)!.requested_quantity} adet · onay bekliyor
                                  </div>
                                )}
                              </div>

                              {order.status === 'pending' && canEdit ? (
                                <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-xl border border-line">
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity, -1)}
                                    disabled={item.quantity <= 1 || !!pendingDecrease(item.id)}
                                    className="btn-outline w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center spring-btn"
                                    style={{
                                      opacity: item.quantity <= 1 || pendingDecrease(item.id) ? 0.3 : 1
                                    }}
                                    aria-label="Azalt"><Minus size={14} aria-hidden /></button>
                                  <span className="font-extrabold text-sm w-6 text-center">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => handleQuantityChange(item.id, item.quantity, 1)}
                                    className="btn-primary w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center spring-btn" aria-label="Artır"><Plus size={14} aria-hidden /></button>
                                </div>
                              ) : (
                                <span className="bg-surface-2 border border-line text-xs font-bold px-2.5 py-1 rounded-lg text-ink-muted">
                                  {item.quantity}x
                                </span>
                              )}
                            </div>

                            {/* ÜRÜN BAŞINA NOT — sarı şerit */}
                            {item.note && item.note.trim() && (
                              <div className="mt-1.5 px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 bg-state-warn-bg text-state-warn font-semibold">
                                <NotebookPen size={12} className="shrink-0" aria-hidden /> {item.note}
                              </div>
                            )}
                          </div>
                        ))}
                        {order.note && (
                          <div className="mt-2 mb-1 px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 bg-state-warn-bg text-state-warn font-semibold">
                            <ClipboardList size={12} className="shrink-0" aria-hidden /> <span><strong>Genel:</strong> {order.note}</span>
                          </div>
                        )}
                      </div>

                      {isEditable && canEdit && !pendingCancel && (
                        <div className="px-4 py-2.5 border-t border-line">
                          <button
                            onClick={() => openCancelModal(order, orderLabel, cancelModeFor(order.status))}
                            className="w-full min-h-[38px] py-2 rounded-full text-xs font-bold spring-btn flex items-center justify-center gap-1.5 bg-state-danger-bg text-state-danger">
                            <XCircle size={14} aria-hidden /> {CANCEL_TEXT[cancelModeFor(order.status)].button}
                          </button>
                        </div>
                      )}

                      {isDelivered && (
                        <div className="px-4 py-2 border-t border-line">
                          <div className="text-xs text-center text-ink-muted">
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
        <div className="ui-card mb-3 p-8 rounded-3xl text-center">
          <div className="mb-2 flex justify-center text-accent"><Armchair size={36} aria-hidden /></div>
          <p className="font-serif font-bold text-base">Masa boş</p>
          <p className="text-xs mt-1 text-ink-muted">
            Sipariş alarak yeni adisyon açın.
          </p>
        </div>
      )}

      {canEdit && <div className="fixed bottom-[92px] left-4 right-4 z-30 mx-auto" style={{ maxWidth: 480 }}>
        <button
          onClick={() => navigate(`/garson/masa/${id}/menu`)}
          className="btn-primary w-full py-3.5 rounded-full text-sm font-extrabold flex items-center justify-center gap-2 spring-btn">
          <Plus size={14} aria-hidden /> Sipariş Al
        </button>
      </div>}

      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center ui-scrim fade-enter">
          <div className="bg-surface sheet-enter w-full max-w-[520px] rounded-t-[32px] flex flex-col overflow-hidden sheet-max-90 border border-line text-ink">
            <div className="w-10 h-1 bg-line rounded-full mx-auto mt-3" />
            <div className="px-5 pt-3 pb-3 border-b border-line">
              <h3 className="font-serif font-bold text-lg flex items-center gap-2" style={{ color: 'var(--state-danger)' }}>
                <XCircle size={18} aria-hidden /> {CANCEL_TEXT[cancelModal.mode].title} — {cancelModal.orderLabel}
              </h3>
              <p className="text-xs mt-1 text-ink-muted">
                {CANCEL_TEXT[cancelModal.mode].hint}
              </p>
            </div>
            <div className="p-5 space-y-3 flex-1 min-h-0 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">İptal edilecek ürünler</span>
                  <button type="button"
                    onClick={() => {
                      const all = cancelModal.order.items.every(i => (cancelQty[i.id] ?? 0) >= i.quantity);
                      setCancelQty(all ? {} : Object.fromEntries(cancelModal.order.items.map(i => [i.id, i.quantity])));
                    }}
                    className="text-xs font-bold px-2 py-1" style={{ color: 'var(--state-danger)' }}>
                    {cancelModal.order.items.every(i => (cancelQty[i.id] ?? 0) >= i.quantity) ? 'Seçimi kaldır' : 'Tümünü seç'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {cancelModal.order.items.map(item => {
                    const q = cancelQty[item.id] ?? 0;
                    const on = q > 0;
                    const setQ = (v: number) => setCancelQty(prev => ({ ...prev, [item.id]: Math.max(0, Math.min(item.quantity, v)) }));
                    return (
                      <div key={item.id} className="flex items-center gap-2.5 p-2.5 min-h-[48px] rounded-2xl"
                        style={{
                          background: on ? 'var(--state-danger-bg)' : 'var(--surface-2)',
                          border: '1px solid ' + (on ? 'var(--state-danger)' : 'var(--line)')
                        }}>
                        <button type="button" onClick={() => setQ(on ? 0 : item.quantity)} aria-pressed={on}
                          className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                          <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: on ? 'var(--state-danger)' : 'var(--surface)', border: `1.5px solid ${on ? 'var(--state-danger)' : 'var(--ink-muted)'}` }}>
                            {on && <Check size={12} strokeWidth={3} style={{ color: 'var(--bg)' }} aria-hidden />}
                          </span>
                          <span className="text-sm font-semibold truncate">{item.quantity}× {item.product_name}</span>
                        </button>
                        {item.quantity > 1 && (
                          <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-line flex-shrink-0">
                            <button type="button" onClick={() => setQ(q - 1)} disabled={q <= 0} aria-label={`${item.product_name} iptal adedini azalt`}
                              className="w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-30"><Minus size={13} aria-hidden /></button>
                            <span className="w-5 text-center text-sm font-extrabold tabular-nums">{q}</span>
                            <button type="button" onClick={() => setQ(q + 1)} disabled={q >= item.quantity} aria-label={`${item.product_name} iptal adedini artır`}
                              className="w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-30"><Plus size={13} aria-hidden /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-2 uppercase tracking-wider text-ink-muted">
                  İptal Sebebi
                </label>
                <div className="space-y-1.5">
                  {CANCEL_REASON_OPTIONS.map(opt => (
                    <label key={opt.code}
                      className="flex items-center gap-2.5 p-3 min-h-[44px] rounded-2xl cursor-pointer transition-colors"
                      style={{
                        background: cancelReason === opt.code ? 'var(--state-danger-bg)' : 'var(--surface-2)',
                        border: '1px solid ' + (cancelReason === opt.code ? 'var(--state-danger)' : 'var(--line)')
                      }}>
                      <input type="radio"
                        name="reason"
                        value={opt.code}
                        checked={cancelReason === opt.code}
                        onChange={() => setCancelReason(opt.code)}
                        style={{ width: 16, height: 16, accentColor: 'var(--state-danger)' }} />
                      <span className="text-sm font-semibold">
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {cancelReason === 'other' && (
                <div>
                  <label className="block text-[11px] font-bold mb-1.5 uppercase tracking-wider text-ink-muted">
                    Açıklama (zorunlu, min 3 karakter)
                  </label>
                  <textarea value={cancelText}
                    onChange={e => setCancelText(e.target.value)}
                    placeholder="İptal sebebini açıkla..."
                    rows={2}
                    className="ui-input w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none" />
                </div>
              )}
            </div>
            <div className="px-5 pt-3 sheet-footer-safe flex gap-2 border-t border-line flex-shrink-0">
              <button onClick={() => setCancelModal(null)}
                disabled={cancelling}
                className="btn-outline flex-1 py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-50">
                Vazgeç
              </button>
              <button onClick={handleCancelOrder}
                disabled={cancelling || !cancelModal.order.items.some(i => (cancelQty[i.id] ?? 0) > 0)}
                className="flex-1 py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-50"
                style={{ background: 'var(--state-danger)', color: 'var(--bg)' }}>
                {cancelling ? 'Gönderiliyor...' : CANCEL_TEXT[cancelModal.mode].submit}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
