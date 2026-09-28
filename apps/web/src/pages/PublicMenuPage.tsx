// apps/web/src/pages/PublicMenuPage.tsx
// CHANGELOG:
// - Warm glassmorphism tasarım (cam kartlar, turuncu vurgu, alttan açılan sheet'ler)
// - Menüde arama (tüm kategorilerde), ürün kartında hızlı "+" ile sepete ekleme
// - "Garson Çağır" butonu artık modal açıyor (12 çağrı türü)
// - "Diğer" seçilirse serbest text alanı çıkıyor (zorunlu min 3 karakter)
// - Çağrı ikonları (lucide) + türe özel renk; gönderince "Garsonunuz haberdar edildi" ekranı
//   (localStorage'da saklanır, sayfa yenilense de kalır; Tamam'a basınca veya 15 dk sonra kapanır)

import type { PublicMenuCategory, PublicMenuResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { getCustomerToken } from '../utils/customerToken';
import { MyOrdersTab } from '../components/MyOrdersTab';
import { OrderNoteTemplates } from '../components/OrderNoteTemplates';
import { Bell, Check, CheckCircle2, Clock, X } from 'lucide-react';
import { CALL_TYPES, type CallTypeCode } from '../lib/callTypes';
import { withAlpha } from '../lib/color';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';
const BRAND_NAME = 'AtlasQR';

type CartItem = {
  product_id: string;
  name: string;
  price_int: number;
  quantity: number;
  note?: string;
};

type MainTab = 'menu' | 'orders';

// Son çağrı durumu — masa bazında localStorage'da (sayfa yenilenince "haberdar edildi" ekranı kalsın)
type StoredCall = { code: CallTypeCode; already: boolean; at: number; dismissed: boolean };
const CALL_MEMORY_MS = 15 * 60 * 1000;
const callStorageKey = (slug: string, tableId: string) => `atlasqr:call:${slug}:${tableId}`;

function readStoredCall(slug: string, tableId: string): StoredCall | null {
  try {
    const raw = localStorage.getItem(callStorageKey(slug, tableId));
    if (!raw) return null;
    const call = JSON.parse(raw) as StoredCall;
    if (!call?.code || Date.now() - call.at > CALL_MEMORY_MS) return null;
    return call;
  } catch {
    return null;
  }
}

function writeStoredCall(slug: string, tableId: string, call: StoredCall): void {
  try { localStorage.setItem(callStorageKey(slug, tableId), JSON.stringify(call)); } catch { /* yut */ }
}

function minutesAgoLabel(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000);
  return mins < 1 ? 'az önce' : `${mins} dk önce`;
}

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
  const [tableName, setTableName] = useState<string>('');
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [mainTab, setMainTab] = useState<MainTab>('menu');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [orderSent, setOrderSent] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);

  const [openNoteFor, setOpenNoteFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Çağrı modal state
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [selectedCallType, setSelectedCallType] = useState<CallTypeCode | null>(null);
  const [callNote, setCallNote] = useState('');
  const [callLoading, setCallLoading] = useState(false);
  // Gönderilmiş son çağrı: kapatılmamışsa sheet'te "Garsonunuz haberdar edildi" ekranı görünür
  const [lastCall, setLastCall] = useState<StoredCall | null>(null);
  const [, setClockTick] = useState(0);

  const [customerToken] = useState<string>(() => getCustomerToken());

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

  useEffect(() => {
    if (!tableId || !slug) return;
    let mounted = true;
    fetch(`${API_BASE_URL}/public/table/${slug}/${tableId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (mounted && data && data.name) {
          setTableName(data.name);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [slug, tableId]);

  // İşletmenin tema rengi → vurgu rengi (--accent). Diğer tonlar index.css'te bundan türetilir.
  // Sadece geçerli hex kabul edilir; sayfadan çıkınca varsayılan (turuncu) geri gelir.
  const accentColor = menu?.business.theme_color?.trim();
  useEffect(() => {
    if (!accentColor || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(accentColor)) return;
    const root = document.documentElement;
    root.style.setProperty('--accent', accentColor);
    return () => { root.style.removeProperty('--accent'); };
  }, [accentColor]);

  const activeCategory = useMemo<PublicMenuCategory | null>(() => {
    if (!menu) return null;
    return menu.categories.find(c => c.id === activeCategoryId) ?? menu.categories[0] ?? null;
  }, [menu, activeCategoryId]);

  // Arama doluysa tüm kategorilerde ara, değilse aktif kategori
  const visibleProducts = useMemo(() => {
    if (!menu) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr');
    if (!q) return activeCategory?.products ?? [];
    return menu.categories.flatMap(c => c.products ?? []).filter(p =>
      p.name.toLocaleLowerCase('tr').includes(q) || (p.description ?? '').toLocaleLowerCase('tr').includes(q)
    );
  }, [menu, activeCategory, searchQuery]);

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
    if (openNoteFor === productId) {
      const remaining = cart.find(i => i.product_id === productId);
      if (!remaining || remaining.quantity <= 1) setOpenNoteFor(null);
    }
  }

  function updateItemNote(productId: string, newNote: string) {
    setCart(prev => prev.map(i =>
      i.product_id === productId ? { ...i, note: newNote } : i
    ));
  }

  async function sendOrder() {
    if (!tableId || cart.length === 0) return;
    setOrderLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/public/order/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_id: tableId,
          note: orderNote || undefined,
          type: 'order',
          customer_token: customerToken,
          items: cart.map(i => ({
            product_id: i.product_id,
            quantity: i.quantity,
            note: i.note?.trim() || undefined
          }))
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Sipariş gönderilemedi. Tekrar deneyin.');
        return;
      }
      setOrderSent(true);
      setCart([]);
      setCartOpen(false);
      setOrderNote('');
      setOpenNoteFor(null);
      setTimeout(() => setOrderSent(false), 4000);
    } catch {
      alert('Sipariş gönderilemedi. Tekrar deneyin.');
    } finally {
      setOrderLoading(false);
    }
  }

  // Sayfa açılınca: 15 dk içinde gönderilmiş ve kapatılmamış çağrı varsa ekranı geri getir
  useEffect(() => {
    if (!slug || !tableId) return;
    const stored = readStoredCall(slug, tableId);
    setLastCall(stored);
    if (stored && !stored.dismissed) setCallModalOpen(true);
  }, [slug, tableId]);

  // "x dk önce" yazısı güncel kalsın
  useEffect(() => {
    if (!callModalOpen || !lastCall) return;
    const id = setInterval(() => setClockTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [callModalOpen, lastCall]);

  const showCallSuccess = callModalOpen && lastCall !== null && !lastCall.dismissed;

  // Çağrı butonu → modal aç
  function openCallModal() {
    if (!tableId) return;
    setSelectedCallType(null);
    setCallNote('');
    setCallModalOpen(true);
  }

  // Başarı ekranını kapat (Tamam / dışarı tıklama / Başka bir istek): bir daha otomatik açılmasın
  function dismissCallSuccess(closeSheet: boolean) {
    if (lastCall && tableId) {
      const dismissed = { ...lastCall, dismissed: true };
      writeStoredCall(slug, tableId, dismissed);
      setLastCall(dismissed);
    }
    setSelectedCallType(null);
    setCallNote('');
    if (closeSheet) setCallModalOpen(false);
  }

  function closeCallSheet() {
    if (callLoading) return;
    if (showCallSuccess) dismissCallSuccess(true);
    else setCallModalOpen(false);
  }

  // Modal'dan çağrıyı gönder
  async function sendCall() {
    if (!tableId || !selectedCallType || callLoading) return;

    // "Diğer" seçildiyse note zorunlu
    if (selectedCallType === 'other' && callNote.trim().length < 3) {
      return;
    }

    setCallLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/public/call/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_id: tableId,
          call_type: selectedCallType,
          note: callNote.trim() || undefined
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Çağrı gönderilemedi.');
        setCallLoading(false);
        return;
      }

      // Aynı türde bekleyen çağrı zaten varsa backend yeni kayıt açmaz (alreadyCalled)
      const data = await res.json().catch(() => ({}));
      const call: StoredCall = {
        code: selectedCallType,
        already: data.alreadyCalled === true,
        at: Date.now(),
        dismissed: false
      };
      writeStoredCall(slug, tableId, call);
      setLastCall(call);
      setSelectedCallType(null);
      setCallNote('');
    } catch {
      alert('Bağlantı hatası. Tekrar deneyin.');
    } finally {
      setCallLoading(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel rounded-3xl px-8 py-7 text-center fade-enter">
        <div className="w-12 h-12 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-white/80">Menü yükleniyor...</p>
      </div>
    </div>
  );

  if (!menu) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel rounded-3xl p-8 text-center max-w-sm fade-enter">
        <div className="text-5xl mb-4">🍽️</div>
        <h1 className="font-serif font-bold text-xl mb-2 text-white">Menü Bulunamadı</h1>
        <p className="text-sm text-white/70">Bu menü mevcut değil veya kaldırılmış olabilir.</p>
      </div>
    </div>
  );

  // "Diğer" seçilen ve note 3 karakterden az → gönderim devre dışı
  const canSendCall = selectedCallType !== null &&
    (selectedCallType !== 'other' || callNote.trim().length >= 3);

  const description = (menu.business as any).description as string | undefined;

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto w-full max-w-[480px] px-3.5 pt-3" style={{ paddingBottom: tableId ? 104 : 24 }}>

        {/* Bildirimler */}
        {orderSent && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] glass-panel rounded-2xl px-5 py-3 text-sm font-bold fade-enter"
            style={{ background: 'var(--accent-gradient)' }}>
            ✅ Siparişiniz alındı!
          </div>
        )}

        {/* Başlık kartı */}
        <div className="glass-panel rounded-3xl p-3.5 flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {menu.business.logo_url ? (
              <img src={menu.business.logo_url} alt={menu.business.name}
                className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 border border-white/40" />
            ) : (
              <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl text-white border border-white/30 bg-white/10">
                <i className="fa-solid fa-wheat-awn" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-serif font-bold text-lg leading-tight tracking-wide truncate">{menu.business.name}</h1>
              {description && (
                <p className="text-[11px] text-white/80 font-medium truncate">{description}</p>
              )}
            </div>
          </div>

          {tableId && tableName && (
            <div className="glass-pill rounded-2xl px-3 py-1.5 flex flex-col items-center justify-center text-center min-w-[72px] flex-shrink-0">
              <div className="flex items-center gap-1 text-[10px] text-white/70 font-medium">
                <i className="fa-solid fa-chair text-[9px]" />
                <span>Masa</span>
              </div>
              <span className="font-extrabold text-sm leading-tight truncate max-w-[90px]">{tableName}</span>
            </div>
          )}
        </div>

        {/* Menü / Siparişlerim */}
        {tableId && (
          <div className="flex gap-1 p-1 mb-3 rounded-2xl bg-black/35 border border-white/20 backdrop-blur-xl">
            {([['menu', 'fa-utensils', 'Menü'], ['orders', 'fa-receipt', 'Siparişlerim']] as const).map(([tab, icon, label]) => (
              <button key={tab} onClick={() => setMainTab(tab)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 spring-btn ${mainTab === tab ? 'btn-accent' : 'text-white/70'}`}>
                <i className={`fa-solid ${icon}`} /> {label}
              </button>
            ))}
          </div>
        )}

        {mainTab === 'orders' && tableId ? (
          <MyOrdersTab
            slug={slug}
            tableId={tableId}
            token={customerToken}
            themeColor="var(--accent)"
            textColor="#FFFFFF"
            textMuted="rgba(255,255,255,0.72)"
            cardBg="rgba(255,255,255,0.18)"
            cardBorder="rgba(255,255,255,0.35)"
            darkMode={true}
          />
        ) : (
          <>
            {/* Arama */}
            <div className="relative mb-3">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-white/60 text-xs" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Menüde ara..."
                className="glass-input w-full pl-9 pr-9 py-2.5 rounded-2xl text-sm font-medium" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 text-xs" aria-label="Aramayı temizle">
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>

            {/* Kategoriler */}
            {!searchQuery && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 mb-3">
                {menu.categories.map(cat => {
                  const active = activeCategory?.id === cat.id;
                  return (
                    <button key={cat.id} onClick={() => setActiveCategoryId(cat.id)}
                      className={`flex-shrink-0 px-4 py-2 rounded-2xl text-xs font-semibold spring-btn ${active ? 'btn-accent' : 'glass-pill'}`}>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bölüm başlığı */}
            <div className="flex items-center gap-3 mb-3 px-1">
              <h2 className="font-serif font-bold text-base">
                {searchQuery ? 'Arama Sonuçları' : activeCategory?.name}
              </h2>
              <div className="flex-1 h-px bg-white/20" />
              <span className="glass-pill text-[11px] px-2.5 py-0.5 rounded-full font-semibold">
                {visibleProducts.length} ürün
              </span>
            </div>

            {/* Ürünler */}
            <div className="space-y-3">
              {visibleProducts.length === 0 && (
                <div className="glass-card rounded-3xl py-8 text-center text-white/70">
                  <i className="fa-solid fa-utensils text-2xl mb-2 text-amber-300" />
                  <p className="text-xs">{searchQuery ? 'Aramanıza uygun ürün bulunamadı.' : 'Bu kategoride henüz ürün yok.'}</p>
                </div>
              )}

              {visibleProducts.map(product => {
                const inCart = cart.find(i => i.product_id === product.id);
                return (
                  <div key={product.id} onClick={() => setSelectedProduct(product)}
                    className="glass-card glass-card-hover rounded-3xl p-3 flex items-center gap-3 cursor-pointer">
                    <div className="relative w-24 h-24 flex-shrink-0 rounded-2xl overflow-hidden bg-white/10 shadow-md">
                      {product.image_url ? (
                        <img src={product.thumb_url ?? product.image_url} alt={product.name} loading="lazy"
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
                      )}
                      {inCart && (
                        <span className="absolute top-1.5 right-1.5 btn-accent w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center">
                          {inCart.quantity}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-serif font-bold text-sm leading-snug">{product.name}</h4>
                      {product.description && (
                        <p className="text-[11px] text-white/75 leading-tight mt-1 font-medium line-clamp-2">{product.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-extrabold tracking-tight">{formatPrice(product.price_int)}</span>
                        {tableId && (
                          <button onClick={e => { e.stopPropagation(); addToCart(product); }}
                            aria-label={`${product.name} sepete ekle`}
                            className="btn-accent w-9 h-9 rounded-full flex items-center justify-center text-sm spring-btn">
                            <i className="fa-solid fa-plus" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!tableId && (
          <div className="text-center px-4 pt-8 pb-2">
            <a href={contactLink} className="btn-accent inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold mb-4 spring-btn">
              <i className="fa-solid fa-phone" /> İletişim
            </a>
            <p className="text-xs text-white/60">
              Powered by <span className="font-bold text-amber-300">{BRAND_NAME}</span>
            </p>
          </div>
        )}
      </div>

      {/* Alt yüzen bar: Garson Çağır + Sepetim */}
      {tableId && mainTab === 'menu' && (
        <div className="fixed bottom-3 left-0 right-0 z-30 px-3.5">
          <div className="mx-auto max-w-[480px] flex items-center gap-2">
            <button onClick={openCallModal}
              className="glass-panel rounded-full px-4 py-3 text-xs font-extrabold flex items-center gap-2 spring-btn">
              <i className="fa-regular fa-bell text-sm" />
              <span className="whitespace-nowrap">Garson Çağır</span>
            </button>
            <button onClick={() => setCartOpen(true)}
              className="btn-accent flex-1 rounded-full px-4 py-3 text-xs font-extrabold flex items-center justify-between spring-btn">
              <span className="flex items-center gap-2">
                <span className="relative">
                  <i className="fa-solid fa-cart-shopping text-sm" />
                  {cartCount > 0 && (
                    <span className="absolute -top-2 -right-2.5 bg-white text-[var(--accent-deep)] font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </span>
                <span className="ml-1">Sepetim</span>
              </span>
              <span className="flex items-center gap-1.5">
                {cartCount > 0 && <span>{cartCount} ürün • {formatPrice(cartTotal)}</span>}
                <i className="fa-solid fa-chevron-right text-[10px] text-white/80" />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Ürün detay sheet */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-md fade-enter"
          onClick={() => setSelectedProduct(null)}>
          <div className="glass-dark sheet-enter w-full max-w-[480px] rounded-t-[32px] overflow-hidden border-t border-white/60"
            onClick={e => e.stopPropagation()}>
            {selectedProduct.image_url && (
              <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                <img src={selectedProduct.image_url} alt={selectedProduct.name}
                  className="absolute inset-0 w-full h-full object-cover" />
              </div>
            )}
            <div className="p-6">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-serif font-bold text-xl flex-1">{selectedProduct.name}</h3>
                <button onClick={() => setSelectedProduct(null)} aria-label="Kapat"
                  className="glass-pill w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 spring-btn">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              {selectedProduct.description && (
                <p className="text-sm text-white/75 mb-4 leading-relaxed">{selectedProduct.description}</p>
              )}
              <div className="pt-4 border-t border-white/20 flex items-center justify-between">
                <span className="font-extrabold text-2xl text-amber-300">{formatPrice(selectedProduct.price_int)}</span>
                {tableId && (
                  <button onClick={() => addToCart(selectedProduct)}
                    className="btn-accent px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 spring-btn">
                    <i className="fa-solid fa-plus" /> Sepete Ekle
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sepet sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-md fade-enter"
          onClick={() => setCartOpen(false)}>
          <div className="glass-dark sheet-enter w-full max-w-[480px] rounded-t-[32px] flex flex-col border-t border-white/60"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/40 rounded-full mx-auto mt-3" />

            <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b border-white/20">
              <div>
                <h3 className="font-serif font-bold text-lg leading-tight">Sipariş Sepetiniz</h3>
                {tableName && <p className="text-[11px] text-white/65">{tableName} • Anında mutfak iletimi</p>}
              </div>
              <button onClick={() => setCartOpen(false)} aria-label="Kapat"
                className="glass-pill w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {cart.length === 0 ? (
                <div className="text-center py-10 text-white/65">
                  <i className="fa-solid fa-basket-shopping text-3xl mb-2 text-amber-300" />
                  <p className="text-sm">Sepetiniz şu anda boş.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cart.map(item => {
                    const isNoteOpen = openNoteFor === item.product_id;
                    const hasNote = item.note && item.note.trim().length > 0;

                    return (
                      <div key={item.product_id}
                        className={`glass-card rounded-2xl overflow-hidden ${hasNote ? 'border-amber-300/70' : ''}`}>
                        <div className="p-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate">{item.name}</div>
                            <div className="text-xs font-extrabold text-amber-300">{formatPrice(item.price_int * item.quantity)}</div>
                          </div>
                          <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/20">
                            <button onClick={() => removeFromCart(item.product_id)} aria-label="Azalt"
                              className="w-7 h-7 rounded-lg bg-white/20 font-bold text-sm flex items-center justify-center spring-btn">−</button>
                            <span className="font-extrabold text-sm w-5 text-center">{item.quantity}</span>
                            <button onClick={() => addToCart({ id: item.product_id, name: item.name, price_int: item.price_int })} aria-label="Artır"
                              className="w-7 h-7 rounded-lg btn-accent font-bold text-sm flex items-center justify-center spring-btn">+</button>
                          </div>
                        </div>

                        {hasNote && !isNoteOpen && (
                          <div className="px-3 py-2 bg-amber-500/20 border-t border-amber-300/30 flex items-center justify-between gap-2">
                            <div className="text-xs text-amber-100 flex-1 min-w-0">📝 <strong>{item.note}</strong></div>
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-bold text-amber-300 whitespace-nowrap">
                              Düzenle
                            </button>
                          </div>
                        )}

                        {!hasNote && !isNoteOpen && (
                          <div className="px-3 pb-2.5">
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-semibold text-amber-300">
                              📝 + Bu ürüne özel not ekle
                            </button>
                          </div>
                        )}

                        {isNoteOpen && (
                          <div className="px-3 pt-2.5 pb-3 bg-black/25 border-t border-white/20">
                            <OrderNoteTemplates
                              value={item.note ?? ''}
                              onChange={(newNote) => updateItemNote(item.product_id, newNote)}
                              label={`📝 ${item.name} İçin Not`}
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

              {cart.length > 0 && (
                <div className="mt-4 pt-4 border-t border-dashed border-white/25">
                  <label className="text-[11px] font-bold text-white/70 block mb-1 uppercase tracking-wider">
                    📋 Sipariş Geneli Not (opsiyonel)
                  </label>
                  <p className="text-[11px] text-white/55 mb-2">
                    Tüm sipariş için geçerli notlar (örn: "kapı kenarında oturuyoruz")
                  </p>
                  <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)}
                    placeholder="Mutfak için özel not ekleyin..."
                    rows={2}
                    className="glass-input w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none" />
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="px-5 pt-3 pb-6 border-t border-white/20">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-white/75 text-sm">Toplam Tutar</span>
                  <span className="font-extrabold text-xl text-amber-300">{formatPrice(cartTotal)}</span>
                </div>
                <button onClick={sendOrder} disabled={orderLoading}
                  className="btn-accent w-full py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 spring-btn">
                  {orderLoading ? 'Gönderiliyor...' : (<><i className="fa-solid fa-paper-plane" /> Siparişi Gönder</>)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Garson çağır sheet — 12 tür ikon grid / gönderim sonrası "haberdar edildi" ekranı */}
      {callModalOpen && (() => {
        const selected = CALL_TYPES.find(ct => ct.code === selectedCallType) ?? null;
        const sentType = lastCall ? CALL_TYPES.find(ct => ct.code === lastCall.code) ?? null : null;
        const recentCode = lastCall && Date.now() - lastCall.at <= CALL_MEMORY_MS ? lastCall.code : null;
        return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-md fade-enter"
          onClick={closeCallSheet}>
          <div className="glass-dark sheet-enter w-full max-w-[480px] rounded-t-[32px] flex flex-col border-t border-white/60"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/40 rounded-full mx-auto mt-3" />

            <div className="px-5 pt-3 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center border"
                  style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)', color: 'var(--accent)' }}>
                  <Bell size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight tracking-tight">Garson Çağır</h3>
                  <p className="text-xs text-white/60 font-medium">
                    {showCallSuccess ? (tableName || 'Masanız') : 'Ne istediğinizi seçin'}
                  </p>
                </div>
              </div>
              <button onClick={closeCallSheet}
                disabled={callLoading} aria-label="Kapat"
                className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/80 spring-btn disabled:opacity-50">
                <X size={16} />
              </button>
            </div>

            {showCallSuccess && sentType && lastCall ? (
              /* Gönderim sonrası: Garsonunuz haberdar edildi */
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 flex flex-col items-center text-center fade-enter">
                <div className="relative flex items-center justify-center my-4">
                  <div className="absolute w-24 h-24 rounded-full animate-ping"
                    style={{ background: withAlpha(sentType.color, 0.18), animationDuration: '2.4s' }} />
                  <div className="relative w-20 h-20 rounded-full flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${sentType.color}, ${withAlpha(sentType.color, 0.7)})`, boxShadow: `0 10px 30px ${withAlpha(sentType.color, 0.45)}` }}>
                    <CheckCircle2 size={40} color="#fff" />
                  </div>
                </div>
                <h4 className="text-2xl font-bold tracking-tight">Garsonunuz haberdar edildi</h4>
                <p className="text-sm font-semibold mt-1.5" style={{ color: sentType.color }}>
                  “{sentType.label}” {lastCall.already ? 'talebiniz zaten iletilmişti' : 'talebiniz iletildi'}
                </p>
                <p className="text-xs text-white/55 mt-1 flex items-center gap-1.5">
                  <Clock size={12} /> {minutesAgoLabel(lastCall.at)}{tableName ? ` • ${tableName}` : ''}
                </p>

                <div className="w-full mt-7 space-y-2">
                  <button onClick={() => dismissCallSuccess(true)}
                    className="btn-accent w-full py-3.5 rounded-full text-sm font-bold spring-btn">
                    Tamam
                  </button>
                  <button onClick={() => dismissCallSuccess(false)}
                    className="w-full py-3 rounded-full text-sm font-semibold text-white/80 bg-white/10 border border-white/10 spring-btn">
                    Başka bir istek
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    {CALL_TYPES.map(ct => {
                      const isSelected = selectedCallType === ct.code;
                      const Icon = ct.icon;
                      return (
                        <button key={ct.code}
                          onClick={() => setSelectedCallType(ct.code)}
                          aria-pressed={isSelected}
                          className="relative rounded-[22px] p-3 min-h-[98px] flex flex-col items-center justify-center gap-2 spring-btn border"
                          style={isSelected ? {
                            background: withAlpha(ct.color, 0.18),
                            borderColor: withAlpha(ct.color, 0.7),
                            boxShadow: `0 0 22px ${withAlpha(ct.color, 0.35)}, inset 0 1px 1px rgba(255,255,255,0.35)`
                          } : {
                            background: 'rgba(255,255,255,0.05)',
                            borderColor: 'rgba(255,255,255,0.09)'
                          }}>
                          <span className="w-11 h-11 rounded-2xl flex items-center justify-center border transition-all"
                            style={isSelected ? {
                              background: `linear-gradient(135deg, ${ct.color}, ${withAlpha(ct.color, 0.75)})`,
                              borderColor: 'rgba(255,255,255,0.35)',
                              color: '#fff',
                              boxShadow: `0 4px 14px ${withAlpha(ct.color, 0.5)}`
                            } : {
                              background: withAlpha(ct.color, 0.15),
                              borderColor: withAlpha(ct.color, 0.25),
                              color: ct.color
                            }}>
                            <Icon size={20} />
                          </span>
                          <span className={`text-[12px] text-center leading-tight tracking-tight ${isSelected ? 'font-bold text-white' : 'font-semibold text-white/80'}`}>
                            {ct.label}
                          </span>
                          {recentCode === ct.code && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                              title="Az önce iletildi"
                              style={{ background: withAlpha(ct.color, 0.9) }}>
                              <Check size={12} color="#fff" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* "Diğer" seçilince serbest text */}
                  {selectedCallType === 'other' && (
                    <div className="mt-4">
                      <label className="text-[11px] font-bold text-white/70 block mb-1.5 uppercase tracking-wider">
                        Açıklama (zorunlu, en az 3 karakter)
                      </label>
                      <textarea value={callNote}
                        onChange={e => setCallNote(e.target.value)}
                        placeholder="Ne istediğinizi yazın..."
                        rows={3}
                        autoFocus
                        className={`glass-input w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none ${callNote.trim().length < 3 && callNote.length > 0 ? 'border-rose-300' : ''}`} />
                      {callNote.trim().length < 3 && callNote.length > 0 && (
                        <div className="text-[11px] text-rose-300 mt-1">En az 3 karakter yazın</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-5 pt-3 pb-6 border-t border-white/10">
                  <button onClick={sendCall}
                    disabled={!canSendCall || callLoading}
                    className="w-full py-3.5 rounded-[22px] text-sm font-bold flex items-center justify-center gap-2 spring-btn border disabled:cursor-not-allowed"
                    style={selected && canSendCall && !callLoading ? {
                      background: `linear-gradient(135deg, ${selected.color}, ${withAlpha(selected.color, 0.8)})`,
                      borderColor: 'rgba(255,255,255,0.35)',
                      color: '#fff',
                      boxShadow: `0 8px 24px -4px ${withAlpha(selected.color, 0.55)}`
                    } : {
                      background: 'rgba(255,255,255,0.06)',
                      borderColor: 'rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.45)'
                    }}>
                    <Bell size={16} />
                    {callLoading ? 'Gönderiliyor...' : selected ? `“${selected.label}” Çağrısını Gönder` : 'Çağrıyı Gönder'}
                  </button>
                  <p className="text-[11px] text-center mt-2 font-semibold"
                    style={{ color: selected ? selected.color : 'rgba(255,255,255,0.5)' }}>
                    {selected ? `Seçilen: ${selected.label}` : 'Önce bir seçenek seçin'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
