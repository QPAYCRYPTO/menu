// apps/web/src/pages/PublicMenuPage.tsx
import type { PublicMenuCategory, PublicMenuResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';
const BRAND_NAME = 'AtlasQR';

type CartItem = {
  product_id: string;
  name: string;
  price_int: number;
  quantity: number;
};

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

function buildContactLink(menu: PublicMenuResponse | null): string {
  if (!menu) return '#';
  const whatsapp = (menu.business as any).contact_whatsapp?.trim();
  if (whatsapp) return `https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`;
  const phone = (menu.business as any).contact_phone?.trim();
  if (phone) return `tel:${phone}`;
  const email = (menu.business as any).contact_email?.trim();
  if (email) return `mailto:${email}`;
  return '#';
}

export function PublicMenuPage() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('masa');

  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Sepet
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [orderSent, setOrderSent] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);

  // Garson çağır
  const [callSent, setCallSent] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiRequest<PublicMenuResponse>(`/public/menu/${slug}`, { retryOn401: false })
      .then(data => {
        if (!mounted) return;
        setMenu(data);
        setActiveCategoryId(data.categories[0]?.id ?? '');
        setLoading(false);
      })
      .catch(() => { if (!mounted) return; setMenu(null); setLoading(false); });
    return () => { mounted = false; };
  }, [slug]);

  const activeCategory = useMemo<PublicMenuCategory | null>(() => {
    if (!menu) return null;
    return menu.categories.find(c => c.id === activeCategoryId) ?? menu.categories[0] ?? null;
  }, [menu, activeCategoryId]);

  const themeColor = menu?.business.theme_color ?? '#0D9488';
  const bgColor = menu?.business.bg_color ?? '#F8FAFC';
  const darkMode = menu?.business.dark_mode ?? false;
  const textColor = darkMode ? '#F8FAFC' : '#0F172A';
  const textMuted = darkMode ? '#94A3B8' : '#64748B';
  const cardBg = darkMode ? '#1E293B' : '#FFFFFF';
  const cardBorder = darkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const contactLink = buildContactLink(menu);

  const cartTotal = cart.reduce((sum, item) => sum + item.price_int * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addToCart(product: any) {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product_id: product.id, name: product.name, price_int: product.price_int, quantity: 1 }];
    });
    setSelectedProduct(null);
  }

  function removeFromCart(productId: string) {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.product_id === productId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.product_id !== productId);
    });
  }

  async function sendOrder() {
    if (!tableId || cart.length === 0) return;
    setOrderLoading(true);
    try {
      await fetch(`${API_BASE_URL}/public/order/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_id: tableId,
          note: orderNote || undefined,
          type: 'order',
          items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
        })
      });
      setOrderSent(true);
      setCart([]);
      setCartOpen(false);
      setOrderNote('');
      setTimeout(() => setOrderSent(false), 4000);
    } catch {
      alert('Sipariş gönderilemedi. Tekrar deneyin.');
    } finally {
      setOrderLoading(false);
    }
  }

  async function callWaiter() {
    if (!tableId) return;
    try {
      await fetch(`${API_BASE_URL}/public/call/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId })
      });
      setCallSent(true);
      setTimeout(() => setCallSent(false), 4000);
    } catch {
      alert('İstek gönderilemedi. Tekrar deneyin.');
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background: bgColor}}>
      <div className="text-center">
        <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4" style={{borderColor: themeColor, borderTopColor: 'transparent'}}></div>
        <p className="text-sm" style={{color: textMuted}}>Menü yükleniyor...</p>
      </div>
    </div>
  );

  if (!menu) return (
    <div className="min-h-screen flex items-center justify-center" style={{background: bgColor}}>
      <div className="text-center p-8">
        <div className="text-6xl mb-4">🍽️</div>
        <h1 className="font-bold text-xl mb-2" style={{color: textColor}}>Menü Bulunamadı</h1>
        <p className="text-sm" style={{color: textMuted}}>Bu menü mevcut değil veya kaldırılmış olabilir.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{background: bgColor, color: textColor}}>

      {/* Sipariş gönderildi bildirimi */}
      {orderSent && (
        <div style={{position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: '#0D9488', color: 'white', padding: '12px 24px', borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.2)'}}>
          ✅ Siparişiniz alındı!
        </div>
      )}

      {/* Garson çağrıldı bildirimi */}
      {callSent && (
        <div style={{position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: '#F59E0B', color: 'white', padding: '12px 24px', borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.2)'}}>
          🔔 Garson çağrıldı!
        </div>
      )}

      {/* Header */}
      <div style={{background: '#0F172A', position: 'sticky', top: 0, zIndex: 10}}>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3 mb-4">
            {menu.business.logo_url ? (
              <img src={menu.business.logo_url} alt={menu.business.name}
                className="flex-shrink-0 rounded-xl object-cover"
                style={{width: 48, height: 48, border: `2px solid ${themeColor}`}} />
            ) : (
              <div className="flex-shrink-0 rounded-xl flex items-center justify-center font-bold text-lg text-white"
                style={{width: 48, height: 48, background: themeColor}}>
                {menu.business.name?.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-base leading-tight text-white" style={{fontFamily: 'Georgia, serif'}}>
                {menu.business.name}
              </h1>
              {tableId && (
                <p className="text-xs mt-0.5" style={{color: 'rgba(255,255,255,0.5)'}}>
                  🪑 Masa: {tableId.slice(0, 8)}...
                </p>
              )}
            </div>

            {/* Sepet butonu */}
            {tableId && (
              <button onClick={() => setCartOpen(true)}
                style={{position: 'relative', width: 40, height: 40, borderRadius: 10, background: themeColor, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                {cartCount > 0 && (
                  <span style={{position: 'absolute', top: -6, right: -6, background: '#DC2626', color: 'white', width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Kategori sekmeleri */}
          <div style={{display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4}}>
            {menu.categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategoryId(cat.id)}
                style={{flexShrink: 0, padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: activeCategory?.id === cat.id ? themeColor : 'rgba(255,255,255,0.1)', color: activeCategory?.id === cat.id ? 'white' : 'rgba(255,255,255,0.6)', border: `1px solid ${activeCategory?.id === cat.id ? themeColor : 'rgba(255,255,255,0.15)'}`}}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ürünler */}
      <div className="px-4 py-6" style={{paddingBottom: tableId ? 100 : 24}}>
        {activeCategory && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-bold text-base" style={{color: textColor, fontFamily: 'Georgia, serif'}}>{activeCategory.name}</h2>
              <div className="flex-1 h-px" style={{background: cardBorder}}></div>
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{background: `${themeColor}20`, color: themeColor}}>
                {activeCategory.products?.length ?? 0} ürün
              </span>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
              {(activeCategory.products ?? []).map(product => (
                <div key={product.id} onClick={() => setSelectedProduct(product)}
                  style={{background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, overflow: 'hidden', cursor: 'pointer'}}>
                  <div style={{width: '100%', paddingTop: '100%', position: 'relative', background: darkMode ? '#334155' : '#F1F5F9'}}>
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name}
                        style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
                    ) : (
                      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32}}>🍽️</div>
                    )}
                    {/* Sepetteki miktar */}
                    {cart.find(i => i.product_id === product.id) && (
                      <div style={{position: 'absolute', top: 8, right: 8, background: themeColor, color: 'white', width: 24, height: 24, borderRadius: '50%', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        {cart.find(i => i.product_id === product.id)?.quantity}
                      </div>
                    )}
                  </div>
                  <div style={{padding: '10px 12px'}}>
                    <div style={{fontWeight: 600, fontSize: 13, color: textColor, marginBottom: 2, lineHeight: 1.3}}>{product.name}</div>
                    {product.description && (
                      <div style={{fontSize: 11, color: textMuted, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical'}}>{product.description}</div>
                    )}
                    <div style={{fontWeight: 700, fontSize: 14, color: themeColor}}>{formatPrice(product.price_int)}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Alt bar — Garson çağır + Sepet (sadece masa varsa) */}
      {tableId && (
        <div style={{position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, padding: '12px 16px', background: cardBg, borderTop: `1px solid ${cardBorder}`, display: 'flex', gap: 10}}>
          <button onClick={callWaiter}
            style={{flex: 1, padding: '12px', borderRadius: 12, border: `1.5px solid ${themeColor}`, background: 'transparent', color: themeColor, fontWeight: 700, fontSize: 14, cursor: 'pointer'}}>
            🔔 Garson Çağır
          </button>
          <button onClick={() => setCartOpen(true)}
            style={{flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: themeColor, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}>
            🛒 Sepet {cartCount > 0 && `(${cartCount})`} {cartTotal > 0 && `— ${formatPrice(cartTotal)}`}
          </button>
        </div>
      )}

      {/* Footer */}
      {!tableId && (
        <div className="text-center px-4 py-6" style={{borderTop: `1px solid ${cardBorder}`}}>
          <a href={contactLink} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold mb-4" style={{background: themeColor, color: 'white'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            İletişim
          </a>
          <p className="text-xs" style={{color: textMuted}}>
            Powered by <span style={{fontWeight: 600, color: themeColor}}>{BRAND_NAME}</span>
          </p>
        </div>
      )}

      {/* Ürün Detay Modal */}
      {selectedProduct && (
        <div style={{position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(15,23,42,0.7)'}}
          onClick={() => setSelectedProduct(null)}>
          <div style={{width: '100%', maxWidth: 480, background: cardBg, borderRadius: '24px 24px 0 0', overflow: 'hidden'}}
            onClick={e => e.stopPropagation()}>
            {selectedProduct.image_url && (
              <div style={{width: '100%', paddingTop: '56.25%', position: 'relative', background: darkMode ? '#334155' : '#F1F5F9'}}>
                <img src={selectedProduct.image_url} alt={selectedProduct.name}
                  style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
              </div>
            )}
            <div style={{padding: 24}}>
              <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8}}>
                <h3 style={{fontWeight: 700, fontSize: 20, color: textColor, fontFamily: 'Georgia, serif', flex: 1}}>{selectedProduct.name}</h3>
                <button onClick={() => setSelectedProduct(null)}
                  style={{width: 32, height: 32, borderRadius: '50%', border: 'none', background: darkMode ? '#334155' : '#F1F5F9', color: textMuted, cursor: 'pointer', marginLeft: 12, flexShrink: 0, fontSize: 14}}>✕</button>
              </div>
              {selectedProduct.description && (
                <p style={{fontSize: 14, color: textMuted, marginBottom: 16, lineHeight: 1.6}}>{selectedProduct.description}</p>
              )}
              <div style={{borderTop: `1px solid ${cardBorder}`, paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <span style={{fontWeight: 700, fontSize: 24, color: themeColor}}>{formatPrice(selectedProduct.price_int)}</span>
                {tableId && (
                  <button onClick={() => addToCart(selectedProduct)}
                    style={{padding: '10px 20px', borderRadius: 10, border: 'none', background: themeColor, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer'}}>
                    + Sepete Ekle
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sepet Modal */}
      {cartOpen && (
        <div style={{position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(15,23,42,0.7)'}}
          onClick={() => setCartOpen(false)}>
          <div style={{width: '100%', maxWidth: 480, background: cardBg, borderRadius: '24px 24px 0 0', overflow: 'hidden', maxHeight: '85vh', display: 'flex', flexDirection: 'column'}}
            onClick={e => e.stopPropagation()}>

            {/* Sepet header */}
            <div style={{padding: '20px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${cardBorder}`}}>
              <h3 style={{fontWeight: 700, fontSize: 18, color: textColor, fontFamily: 'Georgia, serif'}}>Siparişim</h3>
              <button onClick={() => setCartOpen(false)}
                style={{width: 32, height: 32, borderRadius: '50%', border: 'none', background: darkMode ? '#334155' : '#F1F5F9', color: textMuted, cursor: 'pointer', fontSize: 14}}>✕</button>
            </div>

            {/* Sepet içeriği */}
            <div style={{flex: 1, overflowY: 'auto', padding: '12px 20px'}}>
              {cart.length === 0 ? (
                <div style={{textAlign: 'center', padding: '40px 0'}}>
                  <div style={{fontSize: 40, marginBottom: 12}}>🛒</div>
                  <p style={{color: textMuted, fontSize: 14}}>Sepetiniz boş</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.product_id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${cardBorder}`}}>
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: 600, fontSize: 14, color: textColor}}>{item.name}</div>
                      <div style={{fontSize: 12, color: themeColor, fontWeight: 700}}>{formatPrice(item.price_int * item.quantity)}</div>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                      <button onClick={() => removeFromCart(item.product_id)}
                        style={{width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${cardBorder}`, background: 'transparent', color: textColor, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>−</button>
                      <span style={{fontWeight: 700, fontSize: 15, color: textColor, minWidth: 20, textAlign: 'center'}}>{item.quantity}</span>
                      <button onClick={() => addToCart({id: item.product_id, name: item.name, price_int: item.price_int})}
                        style={{width: 28, height: 28, borderRadius: '50%', border: 'none', background: themeColor, color: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>+</button>
                    </div>
                  </div>
                ))
              )}

              {/* Not alanı */}
              {cart.length > 0 && (
                <div style={{marginTop: 12}}>
                  <label style={{fontSize: 12, fontWeight: 600, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Not (opsiyonel)</label>
                  <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)}
                    placeholder="Örn: Soğansız olsun, az baharatlı..."
                    rows={2}
                    style={{width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${cardBorder}`, background: darkMode ? '#334155' : '#F8FAFC', color: textColor, fontSize: 13, resize: 'none', outline: 'none', boxSizing: 'border-box'}} />
                </div>
              )}
            </div>

            {/* Sipariş gönder */}
            {cart.length > 0 && (
              <div style={{padding: '12px 20px 24px', borderTop: `1px solid ${cardBorder}`}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 12}}>
                  <span style={{fontWeight: 600, color: textMuted}}>Toplam</span>
                  <span style={{fontWeight: 700, fontSize: 18, color: themeColor}}>{formatPrice(cartTotal)}</span>
                </div>
                <button onClick={sendOrder} disabled={orderLoading}
                  style={{width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: orderLoading ? '#94A3B8' : themeColor, color: 'white', fontWeight: 700, fontSize: 16, cursor: orderLoading ? 'not-allowed' : 'pointer'}}>
                  {orderLoading ? 'Gönderiliyor...' : '✅ Sipariş Ver'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}