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
  const { token, tabId, waiter, logout } = useWaiterAuth();
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
    if (!token || !tabId || !tableId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tabId, tableId]);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 1500);
  }

  async function loadData() {
    if (!token || !tabId || !tableId) return;
    setLoading(true);
    try {
      const [menuData, tableData] = await Promise.all([
        getMenu(token, tabId),
        getTableDetail(token, tabId, tableId)
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
    if (!token || !tabId || !tableId || cart.length === 0 || sending) return;
    setSending(true);

    try {
      // Her ürünün notunu da gönderiyoruz (backend kabul ediyor)
      const items = cart.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        note: i.note?.trim() || undefined
      }));

      if (activeOrderId) {
        await addItemsToOrder(token, tabId, activeOrderId, items);
      } else {
        await createOrder(token, tabId, tableId, items, note.trim() || undefined);
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
      <div className="glass-panel rounded-3xl text-center py-14 text-white">
        <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-white/80">Menü yükleniyor...</p>
      </div>
    );
  }

  const showFavoritesTab = favorites.length > 0;
  const isFavoritesView = selectedCatId === FAVORITES_CAT_ID;

  return (
    <div className="text-white" style={{ paddingBottom: cart.length > 0 ? 100 : 24 }}>

      {toast && (
        <div className="fixed top-24 left-4 right-4 z-[60] glass-panel px-4 py-3 rounded-2xl text-sm font-bold mx-auto fade-enter"
          style={{
            background: toast.type === 'error' ? 'rgba(225,29,72,0.85)' : 'rgba(5,150,105,0.85)',
            color: '#fff',
            maxWidth: 480
          }}>
          {toast.message}
        </div>
      )}

      <div className="glass-panel rounded-3xl p-2.5 flex items-center gap-3 mb-3">
        <button onClick={() => navigate(`/garson/masa/${tableId}`)} aria-label="Geri"
          className="glass-pill w-10 h-10 rounded-2xl text-sm font-bold flex items-center justify-center flex-shrink-0 spring-btn">
          <i className="fa-solid fa-chevron-left" />
        </button>
        <h2 className="font-serif font-bold text-lg flex-1 truncate">
          🍽️ {tableName}
        </h2>
      </div>

      {activeOrderId && (
        <div className="mb-3 p-3 rounded-2xl text-xs font-semibold"
          style={{ background: 'var(--info-bg)', border: '1px solid rgba(125,211,252,0.45)', color: '#E0F2FE' }}>
          ℹ️ Açık sipariş var. Eklediğin ürünler mevcut siparişe eklenecek.
        </div>
      )}

      <div className="relative mb-3">
        <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-white/60 text-xs pointer-events-none" />
        <input type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Ürün ara..."
          className="glass-input w-full pl-9 pr-4 py-2.5 rounded-2xl text-sm font-medium" />
      </div>

      {!searchQuery && (
        <div className="mb-3 -mx-3.5 px-3.5 overflow-x-auto scrollbar-none pb-1"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-2" style={{ minWidth: 'min-content' }}>
            {showFavoritesTab && (
              <button onClick={() => setSelectedCatId(FAVORITES_CAT_ID)}
                className={`flex-shrink-0 px-4 py-2 min-h-[36px] rounded-2xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 spring-btn ${isFavoritesView ? 'btn-accent' : 'glass-pill'}`}
                style={isFavoritesView ? undefined : { background: 'var(--warning-bg)', color: '#FDE68A', borderColor: 'rgba(251,191,36,0.45)' }}>
                ⭐ Favoriler ({favorites.length})
              </button>
            )}
            {categories.map(cat => (
              <button key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={`flex-shrink-0 px-4 py-2 min-h-[36px] rounded-2xl text-xs font-semibold whitespace-nowrap spring-btn ${selectedCatId === cat.id ? 'btn-accent' : 'glass-pill'}`}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isFavoritesView && filteredProducts.length === 0 && !searchQuery && (
        <div className="glass-card text-center py-10 rounded-3xl" style={{ borderColor: 'rgba(251,191,36,0.5)' }}>
          <div className="text-4xl mb-2">⭐</div>
          <p className="text-sm font-bold text-amber-300">Favori ürün yok</p>
          <p className="text-xs mt-1 text-white/65 px-4">
            Bir kategoriden ürün seçip yıldıza basarak favorilere ekle.
          </p>
        </div>
      )}

      {filteredProducts.length === 0 && !(isFavoritesView && !searchQuery) ? (
        <div className="glass-card text-center py-10 rounded-3xl">
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-sm text-white/70">
            {searchQuery ? 'Ürün bulunamadı' : 'Bu kategoride ürün yok'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredProducts.map(p => {
            const inCart = cart.find(i => i.product_id === p.id);
            const isFav = favorites.includes(p.id);
            return (
              <div key={p.id}
                className="glass-card rounded-3xl p-3 flex gap-3 relative"
                style={inCart ? { borderColor: 'rgba(255,140,56,0.95)', boxShadow: '0 0 0 1px rgba(255,122,41,0.6), var(--glass-shadow-sm)' } : undefined}>

                {/* Görsel alanı */}
                <div className="relative w-24 h-24 flex-shrink-0 rounded-2xl overflow-hidden bg-white/10 shadow-md">
                  {p.image_url ? (
                    <button onClick={() => addToCart(p)}
                      className="block w-full h-full"
                      style={{
                        background: `rgba(255,255,255,0.1) url(${p.image_url}) center/cover no-repeat`
                      }}
                      aria-label={`${p.name} sepete ekle`}>
                    </button>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
                  )}

                  {inCart && (
                    <div className="absolute top-1.5 left-1.5 z-10 btn-accent w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold pointer-events-none">
                      {inCart.quantity}
                    </div>
                  )}

                  {inCart && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromCart(p.id);
                      }}
                      className="absolute bottom-1.5 left-1.5 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold spring-btn"
                      style={{
                        background: 'linear-gradient(135deg, #FB7185, #E11D48)',
                        border: '1px solid rgba(255,255,255,0.7)',
                        boxShadow: '0 4px 10px rgba(225,29,72,0.45)'
                      }}
                      title="Bu üründen vazgeç">
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col">
                  <button onClick={() => addToCart(p)}
                    className="w-full text-left flex-1 flex flex-col">
                    <div className="font-serif font-bold text-sm leading-snug pr-9">
                      {p.name}
                    </div>
                    {p.description && (
                      <div className="text-[11px] text-white/75 leading-tight mt-1 font-medium line-clamp-2 pr-2">
                        {p.description}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-2 w-full">
                      <span className="text-sm font-extrabold tracking-tight">
                        {formatPrice(p.price_int)}
                      </span>
                      {!inCart && (
                        <span className="btn-accent w-9 h-9 rounded-full flex items-center justify-center text-sm spring-btn" aria-hidden="true">
                          <i className="fa-solid fa-plus" />
                        </span>
                      )}
                    </div>
                  </button>

                  {inCart && (
                    <div className="mt-2 flex items-center justify-between gap-1.5 bg-black/30 p-1 rounded-xl border border-white/20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          decrementCart(p.id);
                        }}
                        className="w-9 h-9 rounded-lg bg-white/20 font-bold text-sm flex items-center justify-center spring-btn">−</button>
                      <span className="font-extrabold text-xs">
                        {inCart.quantity} adet
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(p);
                        }}
                        className="btn-accent w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center spring-btn">+</button>
                    </div>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(p.id);
                  }}
                  className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-full flex items-center justify-center text-base spring-btn ${isFav ? '' : 'glass-pill'}`}
                  style={isFav ? {
                    background: 'linear-gradient(135deg, #FCD34D, #F59E0B)',
                    border: '1px solid rgba(255,255,255,0.7)',
                    boxShadow: '0 4px 12px rgba(245,158,11,0.45)'
                  } : undefined}
                  title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}>
                  {isFav ? '⭐' : '☆'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed bottom-[92px] left-4 right-4 z-30 mx-auto" style={{ maxWidth: 480 }}>
          <button onClick={() => setCartOpen(true)}
            className="btn-accent w-full py-3.5 rounded-full flex items-center justify-between px-5 spring-btn">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <i className="fa-solid fa-cart-shopping" /> Sepet ({cartItemCount})
            </div>
            <div className="text-sm font-extrabold flex items-center gap-1.5">
              {formatPrice(cartTotal)} <i className="fa-solid fa-chevron-right text-[10px] text-white/80" />
            </div>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-md fade-enter"
          onClick={() => setCartOpen(false)}>
          <div className="glass-dark sheet-enter w-full rounded-t-[32px] max-h-[90vh] flex flex-col border-t border-white/60 text-white"
            style={{ maxWidth: 600 }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/40 rounded-full mx-auto mt-3" />

            <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b border-white/20">
              <h3 className="font-serif font-bold text-lg">
                🛒 Sepet — {tableName}
              </h3>
              <button onClick={() => setCartOpen(false)} aria-label="Kapat"
                className="glass-pill w-9 h-9 rounded-full flex items-center justify-center text-xs spring-btn">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {cart.length === 0 ? (
                <p className="text-center py-12 text-sm text-white/65">Sepet boş</p>
              ) : (
                <div className="space-y-2.5">
                  {cart.map(item => {
                    const isNoteOpen = openNoteFor === item.product_id;
                    const hasNote = item.note && item.note.trim().length > 0;

                    return (
                      <div key={item.product_id}
                        className={`glass-card rounded-2xl overflow-hidden ${hasNote ? 'border-amber-300/70' : ''}`}>

                        {/* Ürün satırı */}
                        <div className="p-3">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm">
                                {item.product_name}
                              </div>
                              <div className="text-xs mt-0.5 text-white/65">
                                {formatPrice(item.price_int)} / adet
                              </div>
                            </div>
                            <button onClick={() => removeFromCart(item.product_id)}
                              className="text-xs font-bold px-2 py-1.5 rounded-lg spring-btn"
                              style={{ color: 'var(--danger)' }}>
                              ✕ Çıkar
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/20">
                              <button onClick={() => changeQuantity(item.product_id, -1)}
                                className="w-9 h-9 rounded-lg bg-white/20 font-bold text-lg flex items-center justify-center spring-btn">−</button>
                              <span className="font-extrabold text-sm w-7 text-center">{item.quantity}</span>
                              <button onClick={() => changeQuantity(item.product_id, 1)}
                                className="btn-accent w-9 h-9 rounded-lg font-bold text-lg flex items-center justify-center spring-btn">+</button>
                            </div>
                            <div className="font-extrabold text-sm text-amber-300">
                              {formatPrice(item.price_int * item.quantity)}
                            </div>
                          </div>
                        </div>

                        {/* Mevcut not özeti — kapalıyken göster */}
                        {hasNote && !isNoteOpen && (
                          <div className="px-3 py-2 bg-amber-500/20 border-t border-amber-300/30 flex items-center justify-between gap-2">
                            <div className="text-xs text-amber-100 flex-1 min-w-0">
                              📝 <strong>{item.note}</strong>
                            </div>
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-bold text-amber-300 whitespace-nowrap px-1 py-1.5">
                              Düzenle
                            </button>
                          </div>
                        )}

                        {/* Not yok ve kapalıyken: "Not Ekle" butonu */}
                        {!hasNote && !isNoteOpen && (
                          <div className="px-3 pb-2.5">
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-semibold flex items-center gap-1 text-amber-300 py-1">
                              📝 + Bu ürüne özel not ekle
                            </button>
                          </div>
                        )}

                        {/* Not paneli açıkken: OrderNoteTemplates */}
                        {isNoteOpen && (
                          <div className="px-3 pb-3 pt-2.5 bg-black/25 border-t border-white/20">
                            <OrderNoteTemplates
                              value={item.note ?? ''}
                              onChange={(newNote) => updateItemNote(item.product_id, newNote)}
                              label={`📝 ${item.product_name} İçin Not`}
                              placeholder="Bu ürüne özel istek (örn: sıcak olsun)..."
                              rows={2}
                            />
                            <button onClick={() => setOpenNoteFor(null)}
                              className="mt-2 w-full py-2 rounded-xl glass-pill text-sm font-bold spring-btn">
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
                <div className="mt-4 pt-4 border-t border-dashed border-white/25">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/70">
                    📋 Sipariş Geneli Not (opsiyonel)
                  </div>
                  <p className="text-[11px] mb-2 text-white/55">
                    Tüm sipariş için geçerli notlar (örn: "acele edin", "kapı kenarındaki masa")
                  </p>
                  <textarea value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Genel not..."
                    rows={2}
                    className="glass-input w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none" />
                </div>
              )}

              {activeOrderId && (
                <div className="mt-3 p-3 rounded-2xl text-xs font-semibold"
                  style={{ background: 'var(--info-bg)', border: '1px solid rgba(125,211,252,0.45)', color: '#E0F2FE' }}>
                  ℹ️ Eklediğin ürünler mevcut siparişe iliştirilecek. Her ürünün kendi notu kaydedilir.
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="px-5 pt-3 pb-6 border-t border-white/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-white/75">Toplam</span>
                  <span className="text-xl font-extrabold text-amber-300">
                    {formatPrice(cartTotal)}
                  </span>
                </div>
                <button onClick={handleSendOrder}
                  disabled={sending}
                  className="btn-accent w-full py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 spring-btn">
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
