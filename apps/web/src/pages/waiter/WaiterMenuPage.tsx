// apps/web/src/pages/waiter/WaiterMenuPage.tsx
// CHANGELOG v8:
// - Sepet drawer'ındaki HER ÜRÜNÜN altında "📝 Not Ekle" butonu
// - Her ürün için ayrı OrderNoteTemplates paneli
// - Atölye tasarımı: gece/gündüz uyumlu; sepetteki ürün petrol çerçeve, favori yıldızı altın
// - Genel not kalmaya devam ediyor (sipariş geneli)
// - cart[i].note — her item kendi notunu state'te tutuyor

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { OrderNoteTemplates } from '../../components/OrderNoteTemplates';
import { Check, ChevronLeft, ChevronRight, ClipboardList, Info, Minus, NotebookPen, Plus, Search, ShoppingCart, Star, UtensilsCrossed, X } from 'lucide-react';
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
  const { token, tabId, waiter } = useWaiterAuth();
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

      // Yalnızca mutfağın henüz başlamadığı ("Bekliyor") siparişe eklenir; başladıysa yeni sipariş = yeni mutfak fişi
      const activeOrder = tableData.orders.find(o => o.status === 'pending');
      if (activeOrder) {
        setActiveOrderId(activeOrder.id);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('reason')) {
        // Oturum geçersiz: WaiterAuthContext 401 olayıyla zaten kapatır (nedeni giriş ekranında gösterilir)
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
      <div className="ui-card rounded-3xl text-center py-14 text-ink">
        <div className="w-10 h-10 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-ink-muted">Menü yükleniyor...</p>
      </div>
    );
  }

  const showFavoritesTab = favorites.length > 0;
  const isFavoritesView = selectedCatId === FAVORITES_CAT_ID;

  return (
    <div className="text-ink" style={{ paddingBottom: cart.length > 0 ? 100 : 24 }}>

      {toast && (
        <div className="fixed top-24 left-4 right-4 z-[60] px-4 py-3 rounded-2xl text-sm font-bold mx-auto fade-enter shadow-lg max-w-[480px]"
          role="status"
          style={{ background: toast.type === 'error' ? 'var(--state-danger)' : 'var(--state-ok)', color: 'var(--bg)' }}>
          {toast.message}
        </div>
      )}

      <div className="ui-card rounded-3xl p-2.5 flex items-center gap-3 mb-3">
        <button onClick={() => navigate(`/garson/masa/${tableId}`)} aria-label="Geri"
          className="ui-chip w-10 h-10 rounded-2xl text-sm font-bold flex items-center justify-center flex-shrink-0 spring-btn">
          <ChevronLeft size={14} aria-hidden />
        </button>
        <h2 className="font-serif font-bold text-lg flex-1 truncate flex items-center gap-2">
          <UtensilsCrossed size={18} className="shrink-0 text-accent" aria-hidden /> <span className="truncate">{tableName}</span>
        </h2>
      </div>

      {activeOrderId && (
        <div className="mb-3 p-3 rounded-2xl text-xs font-semibold flex items-center gap-1.5 bg-state-info-bg text-state-info">
          <Info size={14} className="shrink-0" aria-hidden /> Açık sipariş var. Eklediğin ürünler mevcut siparişe eklenecek.
        </div>
      )}

      <div className="relative mb-3">
        <Search size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden />
        <input type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Ürün ara..."
          className="ui-input w-full pl-9 pr-4 py-2.5 rounded-2xl text-sm font-medium" />
      </div>

      {!searchQuery && (
        <div className="mb-3 -mx-3.5 px-3.5 overflow-x-auto scrollbar-none pb-1"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-2" style={{ minWidth: 'min-content' }}>
            {showFavoritesTab && (
              <button onClick={() => setSelectedCatId(FAVORITES_CAT_ID)}
                className={`flex-shrink-0 px-4 py-2 min-h-[36px] rounded-2xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 spring-btn ${isFavoritesView ? 'btn-primary' : 'bg-state-warn-bg text-state-warn'}`}>
                <Star size={12} className="fill-current" aria-hidden /> Favoriler ({favorites.length})
              </button>
            )}
            {categories.map(cat => (
              <button key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={`flex-shrink-0 px-4 py-2 min-h-[36px] rounded-2xl text-xs font-semibold whitespace-nowrap spring-btn ${selectedCatId === cat.id ? 'ui-chip-active' : 'ui-chip'}`}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isFavoritesView && filteredProducts.length === 0 && !searchQuery && (
        <div className="ui-card text-center py-10 rounded-3xl">
          <div className="mb-2 flex justify-center text-accent"><Star size={36} className="fill-current" aria-hidden /></div>
          <p className="font-serif text-base font-bold">Favori ürün yok</p>
          <p className="text-xs mt-1 text-ink-muted px-4">
            Bir kategoriden ürün seçip yıldıza basarak favorilere ekle.
          </p>
        </div>
      )}

      {filteredProducts.length === 0 && !(isFavoritesView && !searchQuery) ? (
        <div className="ui-card text-center py-10 rounded-3xl">
          <div className="mb-2 flex justify-center text-ink-muted"><Search size={28} aria-hidden /></div>
          <p className="text-sm text-ink-muted">
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
                className="ui-card rounded-3xl p-3 flex gap-3 relative"
                style={inCart ? { borderColor: 'var(--biz)', boxShadow: '0 0 0 1px var(--biz), var(--shadow)' } : undefined}>

                {/* Görsel alanı */}
                <div className="relative w-24 h-24 flex-shrink-0 rounded-2xl overflow-hidden bg-surface-2">
                  {p.image_url ? (
                    <button onClick={() => addToCart(p)}
                      className="block w-full h-full"
                      style={{
                        background: `var(--surface-2) url(${p.image_url}) center/cover no-repeat`
                      }}
                      aria-label={`${p.name} sepete ekle`}>
                    </button>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-accent"><UtensilsCrossed size={28} aria-hidden /></div>
                  )}

                  {inCart && (
                    <div className="absolute top-1.5 left-1.5 z-10 btn-primary w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold pointer-events-none shadow">
                      {inCart.quantity}
                    </div>
                  )}

                  {inCart && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromCart(p.id);
                      }}
                      className="absolute bottom-1.5 left-1.5 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-surface border border-line text-state-danger shadow text-xs font-bold spring-btn"
                      title="Bu üründen vazgeç" aria-label="Bu üründen vazgeç">
                      <X size={14} strokeWidth={3} aria-hidden />
                    </button>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col">
                  <button onClick={() => addToCart(p)}
                    className="w-full text-left flex-1 flex flex-col">
                    <div className="font-serif font-bold text-[15px] leading-snug pr-9">
                      {p.name}
                    </div>
                    {p.description && (
                      <div className="text-[11px] text-ink-muted leading-tight mt-1 font-medium line-clamp-2 pr-2">
                        {p.description}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-2 w-full">
                      <span className="text-base font-extrabold tracking-tight">
                        {formatPrice(p.price_int)}
                      </span>
                      {!inCart && (
                        <span className="btn-primary w-9 h-9 rounded-full flex items-center justify-center text-sm spring-btn" aria-hidden="true">
                          <Plus size={14} aria-hidden />
                        </span>
                      )}
                    </div>
                  </button>

                  {inCart && (
                    <div className="mt-2 flex items-center justify-between gap-1.5 bg-surface-2 p-1 rounded-xl border border-line">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          decrementCart(p.id);
                        }}
                        className="btn-outline w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center spring-btn" aria-label="Azalt"><Minus size={14} aria-hidden /></button>
                      <span className="font-extrabold text-xs">
                        {inCart.quantity} adet
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(p);
                        }}
                        className="btn-primary w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center spring-btn" aria-label="Artır"><Plus size={14} aria-hidden /></button>
                    </div>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(p.id);
                  }}
                  className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-full flex items-center justify-center text-base spring-btn ${isFav ? '' : 'ui-chip'}`}
                  // Altın dolgu her iki temada benzer; üzerinde koyu petrol yıldız okunur kalır
                  style={isFav ? { background: 'var(--accent)', color: '#073f46' } : undefined}
                  title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  aria-label={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}>
                  {isFav
                    ? <Star size={16} className="fill-current" aria-hidden />
                    : <Star size={16} aria-hidden />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed bottom-[92px] left-4 right-4 z-30 mx-auto" style={{ maxWidth: 480 }}>
          <button onClick={() => setCartOpen(true)}
            className="btn-primary w-full py-3.5 rounded-full flex items-center justify-between px-5 spring-btn">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <ShoppingCart size={14} aria-hidden /> Sepet ({cartItemCount})
            </div>
            <div className="text-sm font-extrabold flex items-center gap-1.5">
              {formatPrice(cartTotal)} <ChevronRight size={12} aria-hidden />
            </div>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center ui-scrim fade-enter"
          onClick={() => setCartOpen(false)}>
          <div className="bg-surface sheet-enter w-full rounded-t-[32px] max-h-[90vh] flex flex-col border border-line text-ink"
            style={{ maxWidth: 600 }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-line rounded-full mx-auto mt-3" />

            <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b border-line">
              <h3 className="font-serif font-bold text-xl flex items-center gap-2">
                <ShoppingCart size={18} className="text-accent" aria-hidden /> Sepet — {tableName}
              </h3>
              <button onClick={() => setCartOpen(false)} aria-label="Kapat"
                className="ui-chip w-9 h-9 rounded-full flex items-center justify-center text-xs spring-btn">
                <X size={12} aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {cart.length === 0 ? (
                <p className="text-center py-12 text-sm text-ink-muted">Sepet boş</p>
              ) : (
                <div className="space-y-2.5">
                  {cart.map(item => {
                    const isNoteOpen = openNoteFor === item.product_id;
                    const hasNote = item.note && item.note.trim().length > 0;

                    return (
                      <div key={item.product_id}
                        className="bg-surface-2 border border-line rounded-2xl overflow-hidden"
                        style={hasNote ? { borderColor: 'var(--state-warn)' } : undefined}>

                        {/* Ürün satırı */}
                        <div className="p-3">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm">
                                {item.product_name}
                              </div>
                              <div className="text-xs mt-0.5 text-ink-muted">
                                {formatPrice(item.price_int)} / adet
                              </div>
                            </div>
                            <button onClick={() => removeFromCart(item.product_id)}
                              className="text-xs font-bold px-2 py-1.5 rounded-lg spring-btn inline-flex items-center gap-1"
                              style={{ color: 'var(--state-danger)' }}>
                              <X size={12} aria-hidden /> Çıkar
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 bg-surface p-1 rounded-xl border border-line">
                              <button onClick={() => changeQuantity(item.product_id, -1)}
                                className="btn-outline w-9 h-9 rounded-lg font-bold text-lg flex items-center justify-center spring-btn" aria-label="Azalt"><Minus size={18} aria-hidden /></button>
                              <span className="font-extrabold text-sm w-7 text-center">{item.quantity}</span>
                              <button onClick={() => changeQuantity(item.product_id, 1)}
                                className="btn-primary w-9 h-9 rounded-lg font-bold text-lg flex items-center justify-center spring-btn" aria-label="Artır"><Plus size={18} aria-hidden /></button>
                            </div>
                            <div className="font-extrabold text-sm">
                              {formatPrice(item.price_int * item.quantity)}
                            </div>
                          </div>
                        </div>

                        {/* Mevcut not özeti — kapalıyken göster */}
                        {hasNote && !isNoteOpen && (
                          <div className="px-3 py-2 bg-state-warn-bg border-t border-line flex items-center justify-between gap-2">
                            <div className="text-xs text-state-warn flex-1 min-w-0 flex items-center gap-1.5">
                              <NotebookPen size={12} className="shrink-0" aria-hidden /> <strong>{item.note}</strong>
                            </div>
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-bold text-ink underline underline-offset-2 whitespace-nowrap px-1 py-1.5">
                              Düzenle
                            </button>
                          </div>
                        )}

                        {/* Not yok ve kapalıyken: "Not Ekle" butonu */}
                        {!hasNote && !isNoteOpen && (
                          <div className="px-3 pb-2.5">
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-semibold flex items-center gap-1 text-ink-muted hover:text-ink py-1">
                              <NotebookPen size={12} className="text-accent" aria-hidden /> + Bu ürüne özel not ekle
                            </button>
                          </div>
                        )}

                        {/* Not paneli açıkken: OrderNoteTemplates */}
                        {isNoteOpen && (
                          <div className="px-3 pb-3 pt-2.5 bg-surface border-t border-line">
                            <OrderNoteTemplates
                              value={item.note ?? ''}
                              onChange={(newNote) => updateItemNote(item.product_id, newNote)}
                              label={`${item.product_name} İçin Not`}
                              placeholder="Bu ürüne özel istek (örn: sıcak olsun)..."
                              rows={2}
                            />
                            <button onClick={() => setOpenNoteFor(null)}
                              className="mt-2 w-full py-2 rounded-xl btn-outline text-sm font-bold spring-btn flex items-center justify-center gap-1.5">
                              <Check size={14} aria-hidden /> Tamam
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
                <div className="mt-4 pt-4 border-t border-dashed border-line">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1">
                    <ClipboardList size={12} aria-hidden /> Sipariş Geneli Not (opsiyonel)
                  </div>
                  <p className="text-[11px] mb-2 text-ink-muted">
                    Tüm sipariş için geçerli notlar (örn: "acele edin", "kapı kenarındaki masa")
                  </p>
                  <textarea value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Genel not..."
                    rows={2}
                    className="ui-input w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none" />
                </div>
              )}

              {activeOrderId && (
                <div className="mt-3 p-3 rounded-2xl text-xs font-semibold flex items-center gap-1.5 bg-state-info-bg text-state-info">
                  <Info size={14} className="shrink-0" aria-hidden /> Eklediğin ürünler mevcut siparişe iliştirilecek. Her ürünün kendi notu kaydedilir.
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="px-5 pt-3 pb-6 border-t border-line">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-ink-muted">Toplam</span>
                  <span className="font-serif text-2xl font-bold">
                    {formatPrice(cartTotal)}
                  </span>
                </div>
                <button onClick={handleSendOrder}
                  disabled={sending}
                  className="btn-primary w-full py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 spring-btn">
                  {sending ? 'Gönderiliyor...' : <><Check size={14} aria-hidden /> {activeOrderId ? 'Siparişe Ekle' : 'Mutfağa Gönder'}</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
