// apps/web/src/pages/waiter/WaiterMenuPage.tsx
// CHANGELOG v8:
// - Sepet drawer'ındaki HER ÜRÜNÜN altında "📝 Not Ekle" butonu
// - Her ürün için ayrı OrderNoteTemplates paneli
// - Genel not kalmaya devam ediyor (sipariş geneli)
// - cart[i].note — her item kendi notunu state'te tutuyor

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { OrderNoteTemplates } from '../../components/OrderNoteTemplates';
import {
  WaiterMenuCategory,
  WaiterMenuProduct,
  CartItem,
  getMenu,
  getTableDetail,
  createOrder,
  addItemsToOrder
} from '../../api/waiterPublicApi';

type ToastState = { message: string; type: 'error' | 'success' } | null;

function getFavoritesKey(waiterId: string, businessId: string): string {
  return `atlasqr:waiter:${businessId}:${waiterId}:favorites`;
}

function loadFavorites(waiterId: string, businessId: string): string[] {
  try {
    const raw = localStorage.getItem(getFavoritesKey(waiterId, businessId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x: any): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function saveFavorites(waiterId: string, businessId: string, favorites: string[]): void {
  try {
    localStorage.setItem(getFavoritesKey(waiterId, businessId), JSON.stringify(favorites));
  } catch {}
}

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

const FAVORITES_CAT_ID = '__favorites__';

export function WaiterMenuPage() {
  const { id: tableId } = useParams<{ id: string }>();
  const { token, waiter, logout } = useWaiterAuth();
  const navigate = useNavigate();

  const [tableName, setTableName] = useState<string>('');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const [categories, setCategories] = useState<WaiterMenuCategory[]>([]);
  const [products, setProducts] = useState<WaiterMenuProduct[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState('');  // GENEL not (sipariş geneli)
  const [sending, setSending] = useState(false);

  // Hangi ürünün not paneli açık? (product_id veya null)
  const [openNoteFor, setOpenNoteFor] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<string[]>([]);

  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (!waiter) return;
    setFavorites(loadFavorites(waiter.id, waiter.business_id));
  }, [waiter]);

  useEffect(() => {
    if (!token || !tableId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tableId]);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 1500);
  }

  async function loadData() {
    if (!token || !tableId) return;
    setLoading(true);
    try {
      const [menuData, tableData] = await Promise.all([
        getMenu(token),
        getTableDetail(token, tableId)
      ]);

      setCategories(menuData.categories);
      setProducts(menuData.products);
      setTableName(tableData.table.name);

      const favs = waiter ? loadFavorites(waiter.id, waiter.business_id) : [];
      if (favs.length > 0) {
        setSelectedCatId(FAVORITES_CAT_ID);
      } else if (menuData.categories.length > 0) {
        setSelectedCatId(menuData.categories[0].id);
      }

      const activeOrder = tableData.orders.find(
        o => o.status === 'pending' || o.status === 'preparing'
      );
      if (activeOrder) {
        setActiveOrderId(activeOrder.id);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('reason')) {
        logout();
        return;
      }
      showToast(e instanceof Error ? e.message : 'Menü alınamadı.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleFavorite(productId: string) {
    if (!waiter) return;
    setFavorites(prev => {
      let next: string[];
      if (prev.includes(productId)) {
        next = prev.filter(id => id !== productId);
      } else {
        next = [productId, ...prev];
      }
      saveFavorites(waiter.id, waiter.business_id, next);
      return next;
    });
  }

  const filteredProducts = useMemo(() => {
    let result = products;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    } else if (selectedCatId === FAVORITES_CAT_ID) {
      const favSet = new Set(favorites);
      result = products.filter(p => favSet.has(p.id));
      result.sort((a, b) => {
        const ai = favorites.indexOf(a.id);
        const bi = favorites.indexOf(b.id);
        return ai - bi;
      });
    } else if (selectedCatId) {
      result = result.filter(p => p.category_id === selectedCatId);
    }

    return result;
  }, [products, selectedCatId, searchQuery, favorites]);

  function addToCart(product: WaiterMenuProduct) {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        price_int: product.price_int,
        quantity: 1
      }];
    });
  }

  function decrementCart(productId: string) {
    setCart(prev => {
      return prev.map(i => {
        if (i.product_id !== productId) return i;
        return { ...i, quantity: i.quantity - 1 };
      }).filter(i => i.quantity > 0);
    });
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.product_id !== productId));
    if (openNoteFor === productId) setOpenNoteFor(null);
    showToast('Üründen vazgeçildi', 'success');
  }

  function changeQuantity(productId: string, delta: number) {
    setCart(prev => {
      return prev.map(i => {
        if (i.product_id !== productId) return i;
        return { ...i, quantity: i.quantity + delta };
      }).filter(i => i.quantity > 0);
    });
  }

  // Bir ürünün notunu güncelle
  function updateItemNote(productId: string, newNote: string) {
    setCart(prev => prev.map(i =>
      i.product_id === productId ? { ...i, note: newNote } : i
    ));
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price_int * i.quantity, 0);
  const cartItemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  async function handleSendOrder() {
    if (!token || !tableId || cart.length === 0 || sending) return;
    setSending(true);

    try {
      // Her ürünün notunu da gönderiyoruz (backend kabul ediyor)
      const items = cart.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        note: i.note?.trim() || undefined
      }));

      if (activeOrderId) {
        await addItemsToOrder(token, activeOrderId, items);
      } else {
        await createOrder(token, tableId, items, note.trim() || undefined);
      }

      setCartOpen(false);

      setTimeout(() => {
        navigate(`/garson/masa/${tableId}`, { replace: true });
      }, 0);
    } catch (e) {
      setSending(false);
      showToast(e instanceof Error ? e.message : 'Sipariş gönderilemedi.', 'error');
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mb-3"
          style={{ borderColor: '#0D9488', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#64748B' }}>Menü yükleniyor...</p>
      </div>
    );
  }

  const showFavoritesTab = favorites.length > 0;
  const isFavoritesView = selectedCatId === FAVORITES_CAT_ID;

  return (
    <div style={{ paddingBottom: cart.length > 0 ? 100 : 24 }}>

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

      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(`/garson/masa/${tableId}`)}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: '#F1F5F9', color: '#64748B' }}>
          ←
        </button>
        <h2 className="font-bold text-lg flex-1" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
          🍽️ {tableName}
        </h2>
      </div>

      {activeOrderId && (
        <div className="mb-3 p-3 rounded-xl text-xs"
          style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF' }}>
          ℹ️ Açık sipariş var. Eklediğin ürünler mevcut siparişe eklenecek.
        </div>
      )}

      <div className="mb-3">
        <input type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="🔍 Ürün ara..."
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ border: '1.5px solid #E2E8F0', background: 'white' }} />
      </div>

      {!searchQuery && (
        <div className="mb-3 -mx-4 px-4 overflow-x-auto"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-2" style={{ minWidth: 'min-content' }}>
            {showFavoritesTab && (
              <button onClick={() => setSelectedCatId(FAVORITES_CAT_ID)}
                className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap flex items-center gap-1.5"
                style={{
                  background: isFavoritesView ? '#F59E0B' : 'white',
                  color: isFavoritesView ? 'white' : '#92400E',
                  border: '1px solid ' + (isFavoritesView ? '#F59E0B' : '#FED7AA')
                }}>
                ⭐ Favoriler ({favorites.length})
              </button>
            )}
            {categories.map(cat => (
              <button key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"
                style={{
                  background: selectedCatId === cat.id ? '#0D9488' : 'white',
                  color: selectedCatId === cat.id ? 'white' : '#64748B',
                  border: '1px solid ' + (selectedCatId === cat.id ? '#0D9488' : '#E2E8F0')
                }}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isFavoritesView && filteredProducts.length === 0 && !searchQuery && (
        <div className="text-center py-12 bg-white rounded-2xl" style={{ border: '1px dashed #FED7AA' }}>
          <div className="text-4xl mb-2">⭐</div>
          <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Favori ürün yok</p>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
            Bir kategoriden ürün seçip yıldıza basarak favorilere ekle.
          </p>
        </div>
      )}

      {filteredProducts.length === 0 && !(isFavoritesView && !searchQuery) ? (
        <div className="text-center py-12 bg-white rounded-2xl" style={{ border: '1px dashed #E2E8F0' }}>
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-sm" style={{ color: '#94A3B8' }}>
            {searchQuery ? 'Ürün bulunamadı' : 'Bu kategoride ürün yok'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {filteredProducts.map(p => {
            const inCart = cart.find(i => i.product_id === p.id);
            const isFav = favorites.includes(p.id);
            return (
              <div key={p.id}
                className="bg-white rounded-2xl overflow-hidden relative"
                style={{ border: inCart ? '2px solid #0D9488' : '1px solid #E2E8F0' }}>

                {inCart && (
                  <div className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: '#0D9488', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                    {inCart.quantity}
                  </div>
                )}

                {inCart && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromCart(p.id);
                    }}
                    className="absolute top-10 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold active:scale-90 transition-transform"
                    style={{ background: '#DC2626', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
                    title="Bu üründen vazgeç">
                    ✕
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(p.id);
                  }}
                  className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-base"
                  style={{
                    background: isFav ? '#F59E0B' : 'rgba(255,255,255,0.9)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    border: isFav ? 'none' : '1px solid #E2E8F0'
                  }}
                  title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}>
                  {isFav ? '⭐' : '☆'}
                </button>

                {p.image_url && (
                  <button onClick={() => addToCart(p)}
                    className="block w-full"
                    style={{
                      background: `#F8FAFC url(${p.image_url}) center/cover no-repeat`,
                      height: 110,
                      borderBottom: '1px solid #F1F5F9'
                    }}
                    aria-label={`${p.name} sepete ekle`}>
                  </button>
                )}

                <button onClick={() => addToCart(p)}
                  className="w-full p-3 text-left">
                  <div className="font-semibold text-sm mb-1 pr-6" style={{ color: '#0F172A' }}>
                    {p.name}
                  </div>
                  {p.description && (
                    <div className="text-xs mb-2 line-clamp-2" style={{ color: '#94A3B8' }}>
                      {p.description}
                    </div>
                  )}
                  <div className="text-sm font-bold" style={{ color: '#0D9488' }}>
                    {formatPrice(p.price_int)}
                  </div>
                </button>

                {inCart && (
                  <div className="px-2 pb-2 flex items-center justify-between"
                    style={{ background: '#F0FDFA', borderTop: '1px solid #99F6E4' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        decrementCart(p.id);
                      }}
                      className="w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center text-white active:scale-90 transition-transform"
                      style={{ background: '#0D9488' }}>−</button>
                    <span className="font-bold text-sm" style={{ color: '#0D9488' }}>
                      {inCart.quantity} adet
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(p);
                      }}
                      className="w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center text-white active:scale-90 transition-transform"
                      style={{ background: '#0D9488' }}>+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-30 mx-auto" style={{ maxWidth: 480 }}>
          <button onClick={() => setCartOpen(true)}
            className="w-full py-3 rounded-2xl text-white shadow-2xl flex items-center justify-between px-5"
            style={{ background: '#0D9488' }}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              🛒 Sepet ({cartItemCount})
            </div>
            <div className="text-base font-bold">
              {formatPrice(cartTotal)} ▶
            </div>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(15,23,42,0.6)' }}
          onClick={() => setCartOpen(false)}>
          <div className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
            style={{ maxWidth: 600 }}
            onClick={e => e.stopPropagation()}>

            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid #E2E8F0' }}>
              <h3 className="font-bold text-base" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                🛒 Sepet — {tableName}
              </h3>
              <button onClick={() => setCartOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: '#F1F5F9', color: '#64748B' }}>✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {cart.length === 0 ? (
                <p className="text-center py-12 text-sm" style={{ color: '#94A3B8' }}>Sepet boş</p>
              ) : (
                <div className="space-y-2">
                  {cart.map(item => {
                    const isNoteOpen = openNoteFor === item.product_id;
                    const hasNote = item.note && item.note.trim().length > 0;

                    return (
                      <div key={item.product_id}
                        className="bg-white rounded-2xl overflow-hidden"
                        style={{ border: hasNote ? '1.5px solid #F59E0B' : '1px solid #E2E8F0' }}>

                        {/* Ürün satırı */}
                        <div className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                                {item.product_name}
                              </div>
                              <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                                {formatPrice(item.price_int)} / adet
                              </div>
                            </div>
                            <button onClick={() => removeFromCart(item.product_id)}
                              className="text-xs"
                              style={{ color: '#DC2626' }}>
                              ✕ Çıkar
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button onClick={() => changeQuantity(item.product_id, -1)}
                                className="w-8 h-8 rounded-xl font-bold text-lg flex items-center justify-center"
                                style={{ background: '#F1F5F9', color: '#0F172A' }}>−</button>
                              <span className="font-bold text-sm w-8 text-center">{item.quantity}</span>
                              <button onClick={() => changeQuantity(item.product_id, 1)}
                                className="w-8 h-8 rounded-xl font-bold text-lg flex items-center justify-center text-white"
                                style={{ background: '#0D9488' }}>+</button>
                            </div>
                            <div className="font-bold text-sm" style={{ color: '#0D9488' }}>
                              {formatPrice(item.price_int * item.quantity)}
                            </div>
                          </div>
                        </div>

                        {/* Mevcut not özeti — kapalıyken göster */}
                        {hasNote && !isNoteOpen && (
                          <div className="px-3 py-2 flex items-center justify-between gap-2"
                            style={{ background: '#FFFBEB', borderTop: '1px solid #FDE68A' }}>
                            <div className="text-xs flex-1 min-w-0" style={{ color: '#92400E' }}>
                              📝 <strong>{item.note}</strong>
                            </div>
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-semibold whitespace-nowrap"
                              style={{ color: '#B45309' }}>
                              Düzenle
                            </button>
                          </div>
                        )}

                        {/* Not yok ve kapalıyken: "Not Ekle" butonu */}
                        {!hasNote && !isNoteOpen && (
                          <div className="px-3 pb-3">
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-semibold flex items-center gap-1"
                              style={{ color: '#0D9488' }}>
                              📝 + Bu ürüne özel not ekle
                            </button>
                          </div>
                        )}

                        {/* Not paneli açıkken: OrderNoteTemplates */}
                        {isNoteOpen && (
                          <div className="px-3 pb-3 pt-2"
                            style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                            <OrderNoteTemplates
                              value={item.note ?? ''}
                              onChange={(newNote) => updateItemNote(item.product_id, newNote)}
                              label={`📝 ${item.product_name} İçin Not`}
                              placeholder="Bu ürüne özel istek (örn: sıcak olsun)..."
                              rows={2}
                            />
                            <button onClick={() => setOpenNoteFor(null)}
                              className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: '#0F172A', color: 'white' }}>
                              ✓ Tamam
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* GENEL not — sipariş geneli */}
              {cart.length > 0 && !activeOrderId && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px dashed #CBD5E1' }}>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>
                    📋 Sipariş Geneli Not (opsiyonel)
                  </div>
                  <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>
                    Tüm sipariş için geçerli notlar (örn: "acele edin", "kapı kenarındaki masa")
                  </p>
                  <textarea value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Genel not..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                    style={{ border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
                </div>
              )}

              {activeOrderId && (
                <div className="mt-3 p-2.5 rounded-lg text-xs"
                  style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF' }}>
                  ℹ️ Eklediğin ürünler mevcut siparişe iliştirilecek. Her ürünün kendi notu kaydedilir.
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="px-5 py-4" style={{ borderTop: '1px solid #E2E8F0' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold" style={{ color: '#64748B' }}>Toplam</span>
                  <span className="text-xl font-bold" style={{ color: '#0D9488', fontFamily: 'Georgia, serif' }}>
                    {formatPrice(cartTotal)}
                  </span>
                </div>
                <button onClick={handleSendOrder}
                  disabled={sending}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white shadow-lg"
                  style={{ background: sending ? '#475569' : '#0D9488' }}>
                  {sending ? 'Gönderiliyor...' : (activeOrderId ? '✓ Siparişe Ekle' : '✓ Mutfağa Gönder')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}