// apps/web/src/components/payment/OpenOrdersDecisionPanel.tsx
// Hesap kapatılırken ödenmemiş, teslim edilmemiş siparişler için karar paneli (Kasa ekranı)
import { AlertTriangle, Lock, RefreshCw, X, type LucideIcon } from 'lucide-react';
import type { OpenOrderDecision, OpenOrderRequiringDecision } from '../../api/paymentApi';

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

// ─── AÇIK SİPARİŞ KARAR PANELİ ───────────────────────────────────────────────
// Ödenmemiş ürünü olan, teslim edilmemiş her sipariş için "İptal Et" veya "Zayi Say"
// seçilmeden masa kapatılamaz (backend de aynı kuralı zorunlu tutar).
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
};

const DECISION_OPTIONS: { value: OpenOrderDecision; label: string; icon: LucideIcon; hint: string; color: string; bg: string }[] = [
  { value: 'customer_left', label: 'İptal Et', icon: X, hint: 'Müşteri kalktı', color: 'var(--state-warn)', bg: 'var(--state-warn-bg)' },
  { value: 'no_payment', label: 'Zayi Say', icon: AlertTriangle, hint: 'Hazırlandı, ödenmedi', color: 'var(--state-danger)', bg: 'var(--state-danger-bg)' },
];

export function OpenOrdersDecisionPanel({ orders, decisions, closing, onDecide, onCancel, onConfirm, onTransfer }: {
  orders: OpenOrderRequiringDecision[];
  decisions: Record<string, OpenOrderDecision>;
  closing: boolean;
  onDecide: (orderId: string, decision: OpenOrderDecision) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** Bekleyen siparişler yeni gelen müşteriye aitse: eski hesap kapanır, bekleyenler yeni hesaba taşınır */
  onTransfer?: () => void;
}) {
  const decidedCount = orders.filter(o => decisions[o.order_id]).length;
  const allDecided = decidedCount === orders.length;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pt-4">
        <div className="mb-3 px-3 py-2.5 rounded-2xl text-xs font-semibold flex gap-2 items-start"
          style={{ background: 'var(--state-danger-bg)', color: 'var(--ink)' }}>
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--state-danger)' }} />
          <span>Masa kapatılmadan önce ödenmemiş açık siparişler için karar verin. Karar verilmeden masa kapatılamaz.</span>
        </div>

        <div className="space-y-3 mb-4">
          {orders.map(order => {
            const selected = decisions[order.order_id];
            const hasPaidItems = order.items.some(i => i.is_paid);
            return (
              <div key={order.order_id} className="p-3 rounded-2xl"
                style={{
                  background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
                  border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--line)'}`
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-ink">
                    {order.table_name} · {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--state-danger)' }}>
                    {formatPrice(order.unpaid_total_int)}
                  </span>
                </div>
                <div className="text-xs mb-2 text-ink-muted">
                  {order.items.map((i, idx) => (
                    <span key={idx} style={i.is_paid ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                      {idx > 0 ? ', ' : ''}{i.quantity}x {i.product_name}
                    </span>
                  ))}
                </div>
                {hasPaidItems && (
                  <div className="text-xs mb-2 text-state-warn font-semibold">
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
                        color: selected === opt.value ? 'var(--bg)' : opt.color,
                        border: `1.5px solid ${opt.color}`
                      }}>
                      <span className="inline-flex items-center gap-1"><opt.icon size={12} strokeWidth={2.5} /> {opt.label}</span>
                      <div style={{ fontWeight: 400, fontSize: 10, opacity: 0.85 }}>{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-4 flex-shrink-0 border-t border-line">
        {onTransfer && (
          <button onClick={onTransfer} disabled={closing}
            className="w-full mb-3 px-3 py-2.5 rounded-2xl text-xs font-semibold spring-btn flex items-center gap-2 text-left"
            style={{ border: '1.5px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' }}>
            <RefreshCw size={14} className="flex-shrink-0" />
            Bekleyenler yeni müşteriye ait — bu hesabı kapat, bekleyenleri yeni hesaba taşı
          </button>
        )}
        <div className="text-xs mb-2 text-center text-ink-muted">
          {decidedCount}/{orders.length} sipariş için karar verildi
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={closing}
            className="ui-chip px-4 py-3 rounded-2xl text-sm font-semibold spring-btn">
            Vazgeç
          </button>
          <button onClick={onConfirm}
            disabled={closing || !allDecided}
            className="btn-primary flex-1 py-3 rounded-2xl text-sm font-bold spring-btn flex items-center justify-center gap-1.5">
            {closing ? '...' : <><Lock size={14} /> Kararları Uygula ve Masayı Kapat</>}
          </button>
        </div>
      </div>
    </>
  );
}
