// apps/web/src/components/MyOrdersTab.tsx
// Müşterinin kendi siparişlerini gösteren sekme
// PublicMenuPage içinden kullanılır

import { useEffect, useState } from 'react';

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

const STATUS_META: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  pending: { label: 'Bekliyor', icon: '⏱', bg: '#FEF3C7', color: '#B45309' },
  preparing: { label: 'Hazırlanıyor', icon: '👨‍🍳', bg: '#E0F2FE', color: '#0369A1' },
  ready: { label: 'Hazır', icon: '✨', bg: '#D1FAE5', color: '#065F46' }
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
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" 
          style={{ borderColor: themeColor, borderTopColor: 'transparent' }}></div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h3 style={{ fontWeight: 700, fontSize: 16, color: textColor, marginBottom: 8 }}>
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
    <div style={{ padding: '12px 16px 100px' }}>
      {orders.map(order => {
        const meta = STATUS_META[order.status] || STATUS_META.pending;
        const total = orderTotal(order.items);

        return (
          <div key={order.id} style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 12
          }}>
            {/* Header */}
            <div style={{
              padding: '12px 14px',
              background: meta.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{meta.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: meta.color }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: 11, color: meta.color, opacity: 0.7 }}>
                    {timeAgo(order.created_at)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: meta.color, opacity: 0.7 }}>
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
                  padding: '6px 0',
                  borderBottom: `1px solid ${cardBorder}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      background: themeColor,
                      color: 'white',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {item.quantity}
                    </span>
                    <span style={{ fontSize: 13, color: textColor, fontWeight: 500 }}>
                      {item.product_name}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: textMuted }}>
                    {formatPrice(item.price_int * item.quantity)}
                  </span>
                </div>
              ))}

              {order.note && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: darkMode ? '#334155' : '#FEF3C7',
                  fontSize: 12,
                  color: darkMode ? '#FCD34D' : '#92400E'
                }}>
                  📝 {order.note}
                </div>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 10,
                paddingTop: 8,
                borderTop: `1px solid ${cardBorder}`
              }}>
                <span style={{ fontSize: 12, color: textMuted, fontWeight: 600 }}>Toplam</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: themeColor }}>
                  {formatPrice(total)}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Tüm siparişlerin toplamı */}
      {orders.length > 1 && (
        <div style={{
          background: themeColor,
          borderRadius: 16,
          padding: 16,
          marginTop: 12,
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
            Aktif Siparişlerinizin Toplamı
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {formatPrice(totalOfAll)}
          </div>
        </div>
      )}
    </div>
  );
}