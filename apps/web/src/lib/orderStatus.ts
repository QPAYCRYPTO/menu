// apps/web/src/lib/orderStatus.ts
// Sipariş durumlarının tek renk/etiket kaynağı — admin, garson, masa ve müşteri ekranları aynı dili konuşur.
//   Bekliyor amber · Hazırlanıyor mavi · Hazır yeşil · Teslim edildi mor · İptal kırmızı
// Eylem düğmeleri, siparişin GEÇECEĞİ durumun rengini taşır (ör. "Hazır" düğmesi yeşil).
// Tailwind yalnızca düz yazılmış sınıfları üretir; bu yüzden sınıflar birleştirilmeden, tam haliyle yazılı.

export type OrderStatusKey = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

type StatusStyle = {
  label: string;
  /** Yazı/ikon rengi (CSS değişkeni) */
  fg: string;
  /** Yumuşak zemin (CSS değişkeni) */
  bg: string;
  /** Rozet: yumuşak zemin + renkli yazı */
  badge: string;
  /** Düğme: dolu renk + sayfa zemini renginde yazı (iki temada okunur) */
  solid: string;
};

export const ORDER_STATUS: Record<OrderStatusKey, StatusStyle> = {
  pending: {
    label: 'Bekliyor', fg: 'var(--state-warn)', bg: 'var(--state-warn-bg)',
    badge: 'bg-state-warn-bg text-state-warn', solid: 'bg-state-warn text-page'
  },
  preparing: {
    label: 'Hazırlanıyor', fg: 'var(--state-info)', bg: 'var(--state-info-bg)',
    badge: 'bg-state-info-bg text-state-info', solid: 'bg-state-info text-page'
  },
  ready: {
    label: 'Hazır', fg: 'var(--state-ok)', bg: 'var(--state-ok-bg)',
    badge: 'bg-state-ok-bg text-state-ok', solid: 'bg-state-ok text-page'
  },
  delivered: {
    label: 'Teslim Edildi', fg: 'var(--state-done)', bg: 'var(--state-done-bg)',
    badge: 'bg-state-done-bg text-state-done', solid: 'bg-state-done text-page'
  },
  cancelled: {
    label: 'İptal Edildi', fg: 'var(--state-danger)', bg: 'var(--state-danger-bg)',
    badge: 'bg-state-danger-bg text-state-danger', solid: 'bg-state-danger text-page'
  }
};

export function orderStatusStyle(status: string): StatusStyle {
  return ORDER_STATUS[status as OrderStatusKey] ?? ORDER_STATUS.pending;
}
