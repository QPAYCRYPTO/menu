// apps/web/src/components/MyOrdersTab.tsx
// Müşterinin kendi siparişlerini gösteren sekme
// PublicMenuPage içinden kullanılır

import { useEffect, useState } from 'react';
import { ChefHat, ClipboardList, Clock, NotebookPen, Sparkles, type LucideIcon } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  price_int: number;
};

type MyOrder = {
  id: string;
  table_name: string;
  status: 'pending' | 'preparing' | 'ready';
  note: string | null;
  created_at: string;
  items: OrderItem[];
};

type Props = {
  slug: string;
  tableId: string;
  token: string;
  themeColor: string;
  textColor: string;
  textMuted: string;
  cardBg: string;
  cardBorder: string;
  darkMode: boolean;
};

const STATUS_META: Record<string, { label: string; icon: LucideIcon; bg: string; color: string }> = {
  pending: { label: 'Bekliyor', icon: Clock, bg: 'var(--warning-bg)', color: 'var(--warning)' },
  preparing: { label: 'Hazırlanıyor', icon: ChefHat, bg: 'var(--info-bg)', color: 'var(--info)' },
  ready: { label: 'Hazır', icon: Sparkles, bg: 'var(--success-bg)', color: 'var(--success)' }
};

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

function orderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price_int * item.quantity, 0);
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff} saniye önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dakika önce`;
  return `${Math.floor(diff / 3600)} saat önce`;
}

export function MyOrdersTab({ slug, tableId, token, themeColor, textColor, textMuted, cardBg, cardBorder, darkMode }: Props) {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadOrders() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/public/my-orders/${slug}/${tableId}?token=${encodeURIComponent(token)}`
      );
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch {
      // Sessiz geç, bir sonraki polling'de tekrar dener
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    // Her 15 saniyede bir yenile (backend'de SSE yok bu tarafta, polling yeterli)
    const interval = setInterval(loadOrders, 15000);
    return () => clearInterval(interval);
  }, [slug, tableId, token]);

  if (loading) {
    return (
      <div className="glass-card rounded-3xl" style={{ padding: 40, textAlign: 'center' }}>
        <div className="w-10 h-10 rounded-full border-2 border-white/30 animate-spin mx-auto"
          style={{ borderTopColor: themeColor }}></div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="glass-card rounded-3xl fade-enter" style={{ padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', color: textMuted }}><ClipboardList size={48} strokeWidth={1.5} /></div>
        <h3 className="font-serif" style={{ fontWeight: 700, fontSize: 17, color: textColor, marginBottom: 8 }}>
          Henüz aktif siparişiniz yok
        </h3>
        <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.5 }}>
          Menüden bir şeyler seçip sipariş verdiğinizde<br />
          durumunu buradan takip edebilirsiniz.
        </p>
      </div>
    );
  }

  const totalOfAll = orders.reduce((sum, o) => sum + orderTotal(o.items), 0);

  return (
    <div style={{ padding: '0 0 24px' }}>
      {orders.map(order => {
        const meta = STATUS_META[order.status] || STATUS_META.pending;
        const total = orderTotal(order.items);

        return (
          <div key={order.id} className="glass-dark rounded-3xl fade-enter" style={{
            overflow: 'hidden',
            marginBottom: 12
          }}>
            {/* Header */}
            <div style={{
              padding: '12px 14px',
              background: meta.bg,
              borderBottom: '1px solid rgba(255,255,255,0.14)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="glass-pill w-9 h-9 rounded-xl flex items-center justify-center" style={{ fontSize: 18, color: meta.color }}><meta.icon size={18} /></span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: meta.color }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: 11, color: textMuted }}>
                    {timeAgo(order.created_at)}
                  </div>
                </div>
              </div>
              <div className="glass-pill font-mono" style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, fontWeight: 700 }}>
                {new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {/* Items */}
            <div style={{ padding: '10px 14px' }}>
              {order.items.map(item => (
                <div key={item.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.12)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="btn-accent" style={{
                      width: 26,
                      height: 26,
                      borderRadius: 9,
                      fontSize: 11,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {item.quantity}
                    </span>
                    <span style={{ fontSize: 13, color: textColor, fontWeight: 600 }}>
                      {item.product_name}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: textMuted }}>
                    {formatPrice(item.price_int * item.quantity)}
                  </span>
                </div>
              ))}

              {order.note && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  borderRadius: 12,
                  background: 'rgba(245,158,11,0.2)',
                  border: '1px solid rgba(251,191,36,0.35)',
                  fontSize: 12,
                  color: '#FDE68A',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6
                }}>
                  <NotebookPen size={12} style={{ flexShrink: 0, marginTop: 2 }} /><span>{order.note}</span>
                </div>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 10,
                paddingTop: 8
              }}>
                <span style={{ fontSize: 12, color: textMuted, fontWeight: 600 }}>Toplam</span>
                <span className="text-amber-300" style={{ fontSize: 16, fontWeight: 800 }}>
                  {formatPrice(total)}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Tüm siparişlerin toplamı */}
      {orders.length > 1 && (
        <div className="btn-accent" style={{
          borderRadius: 24,
          padding: 16,
          marginTop: 12,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4, fontWeight: 600 }}>
            Aktif Siparişlerinizin Toplamı
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {formatPrice(totalOfAll)}
          </div>
        </div>
      )}
    </div>
  );
}
