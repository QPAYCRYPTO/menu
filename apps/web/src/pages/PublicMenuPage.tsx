// apps/web/src/pages/PublicMenuPage.tsx
// CHANGELOG:
// - Atölye tasarımı: sade açık tema + gece modu (bg-page / ui-card / text-ink), başlıkta gece/gündüz düğmesi
//   İşletme rengi (theme_color) yalnızca butonlarda ve vurgularda; her temada okunur olacak şekilde ayarlanır
//   Masaüstünde solda kategori şeridi, telefonda üstte kategori hapları + altta Garson Çağır / Sepetim
// - Menüde arama (tüm kategorilerde), ürün kartında hızlı "+" ile sepete ekleme
// - "Garson Çağır" butonu artık modal açıyor (12 çağrı türü)
// - "Diğer" seçilirse serbest text alanı çıkıyor (zorunlu min 3 karakter)
// - Çağrı ikonları (lucide) + türe özel renk; gönderince "Garsonunuz haberdar edildi" ekranı
//   (localStorage'da saklanır, sayfa yenilense de kalır; Tamam'a basınca veya 15 dk sonra kapanır)

import type { PublicMenuCategory, PublicMenuResponse } from '@menu/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { getCustomerToken } from '../utils/customerToken';
import { MyOrdersTab } from '../components/MyOrdersTab';
import { OrderNoteTemplates } from '../components/OrderNoteTemplates';
import { ThemeToggle } from '../components/ThemeToggle';
import { useBusinessTheme } from '../lib/businessTheme';
import { useThemedPage } from '../lib/theme';
import {
  Armchair, Bell, Camera, Check, CheckCircle2, ChevronRight, ClipboardList, Clock, Copy, Info, Mail, MapPin, MessageCircle, Minus,
  NotebookPen, Phone, Plus, Receipt, Search, Send, ShoppingBasket, ShoppingCart, UtensilsCrossed, Wheat, Wifi, X
} from 'lucide-react';
import { copyText } from '../lib/clipboard';
import { CALL_TYPES, type CallTypeCode } from '../lib/callTypes';
import { readableTextOn, withAlpha } from '../lib/color';

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

/** WhatsApp numarası → wa.me rakamları. Ülke kodu yoksa Türkiye (90) varsayılır: 0555… / 555… → 90555… */
function whatsappDigits(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (raw.trim().startsWith('+')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `9${digits}`;
  if (digits.length === 10 && digits.startsWith('5')) return `90${digits}`;
  return digits;
}

/** "@kullanici", "kullanici" ya da tam link → { url, handle } */
function instagramLink(raw: string): { url: string; handle: string } | null {
  const value = raw.trim();
  if (!value) return null;
  const handle = value
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];
  if (!handle) return null;
  return { url: `https://instagram.com/${encodeURIComponent(handle)}`, handle };
}

/** İşletme açıklaması: başlıkta en fazla 2 satır; taşarsa dokununca tamamı açılır. */
function BusinessDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  const body = (
    <p ref={ref} className={`text-xs md:text-sm font-semibold text-accent leading-snug mt-1 break-words ${open ? '' : 'line-clamp-2'}`}>
      {text}
    </p>
  );
  if (!clamped && !open) return body;
  return (
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="block text-left w-full">
      {body}
      <span className="text-[11px] font-bold text-ink-muted underline underline-offset-2">{open ? 'Daha az' : 'Devamını oku'}</span>
    </button>
  );
}

/** Menünün altındaki işletme bilgisi: Wi-Fi (şifre kopyalanır) + iletişim bağlantıları. Hiçbiri yoksa çizilmez. */
function BusinessInfoCard({ business }: { business: PublicMenuResponse['business'] }) {
  const [copied, setCopied] = useState(false);
  const wifiName = business.wifi_name?.trim();
  const wifiPassword = business.wifi_password ?? '';
  const phone = business.contact_phone?.trim();
  const whatsapp = business.contact_whatsapp?.trim();
  const email = business.contact_email?.trim();
  const address = business.address?.trim();
  const instagram = instagramLink(business.contact_instagram ?? '');

  const links: { href: string; label: string; icon: typeof Phone; external?: boolean }[] = [];
  if (phone) links.push({ href: `tel:${phone.replace(/\s/g, '')}`, label: 'Ara', icon: Phone });
  if (whatsapp) links.push({ href: `https://wa.me/${whatsappDigits(whatsapp)}`, label: 'WhatsApp', icon: MessageCircle, external: true });
  if (instagram) links.push({ href: instagram.url, label: `@${instagram.handle}`, icon: Camera, external: true });
  if (email) links.push({ href: `mailto:${email}`, label: 'E-posta', icon: Mail });
  if (address) links.push({
    href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    label: 'Yol tarifi', icon: MapPin, external: true
  });

  if (!wifiName && links.length === 0) return null;

  async function copyWifi() {
    if (await copyText(wifiPassword)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <section className="ui-card rounded-3xl p-4 mt-6 md:max-w-xl md:mx-auto space-y-4" aria-label="İşletme bilgileri">
      {wifiName && (
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-surface-2 border border-line text-accent flex items-center justify-center shrink-0">
            <Wifi size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold tracking-wider text-ink-muted">Wi-Fi</div>
            <div className="font-bold truncate">{wifiName}</div>
            <div className="text-xs text-ink-muted truncate">{wifiPassword ? <>Şifre: <span className="font-mono text-ink">{wifiPassword}</span></> : 'Şifresiz ağ'}</div>
          </div>
          {wifiPassword && (
            <button onClick={copyWifi} className="ui-chip px-3 py-2 rounded-full text-xs font-bold inline-flex items-center gap-1.5 spring-btn shrink-0">
              {copied ? <><Check size={13} className="text-state-ok" /> Kopyalandı</> : <><Copy size={13} /> Kopyala</>}
            </button>
          )}
        </div>
      )}
      {links.length > 0 && (
        <div className={wifiName ? 'pt-4 border-t border-line' : ''}>
          {address && <p className="text-xs text-ink-muted mb-3 flex items-start gap-1.5"><MapPin size={13} className="shrink-0 mt-px" />{address}</p>}
          <div className="flex flex-wrap gap-2">
            {links.map(link => (
              <a key={link.label} href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="ui-chip px-3.5 py-2 rounded-full text-xs font-bold inline-flex items-center gap-1.5 spring-btn max-w-full">
                <link.icon size={13} className="shrink-0" /> <span className="truncate">{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function PublicMenuPage() {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableId = searchParams.get('masa');

  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [tableName, setTableName] = useState<string>('');
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Sekme URL'de (?tab=orders): sayfa yenilenince Siparişlerim açık kalır
  const mainTab: MainTab = searchParams.get('tab') === 'orders' && tableId ? 'orders' : 'menu';
  function setMainTab(tab: MainTab) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'orders') next.set('tab', 'orders');
      else next.delete('tab');
      return next;
    }, { replace: true });
  }

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

  // Menü açık kalmışken yapılan değişiklikler (ayarlar, ürün, fiyat) sekmeye dönünce sessizce yenilenir.
  // Seçili kategori ve sepet korunur; en fazla 15 sn'de bir sorulur.
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 15_000) return;
      last = Date.now();
      apiRequest<PublicMenuResponse>(`/public/menu/${slug}`, { retryOn401: false })
        .then(data => {
          setMenu(data);
          setActiveCategoryId(prev => (data.categories.some(c => c.id === prev) ? prev : data.categories[0]?.id ?? ''));
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
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

  // Sayfa gece/gündüz temasına uyar; işletme rengi yalnızca bu sayfada butonlara ve vurgulara uygulanır
  // (her tema için okunurluk ayarlı — lib/businessTheme.ts). Sayfadan çıkınca sistem renkleri geri gelir.
  useThemedPage();
  useBusinessTheme(menu?.business.theme_color);

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

  // Ürünü sepetten tamamen çıkar (kart üzerindeki ✕)
  function clearFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.product_id !== productId));
    if (openNoteFor === productId) setOpenNoteFor(null);
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
    <div className="min-h-screen bg-page text-ink flex items-center justify-center p-6">
      <div className="ui-card rounded-3xl px-8 py-7 text-center fade-enter">
        <div className="w-12 h-12 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-ink-muted">Menü yükleniyor...</p>
      </div>
    </div>
  );

  if (!menu) return (
    <div className="min-h-screen bg-page text-ink flex items-center justify-center p-6">
      <div className="ui-card rounded-3xl p-8 text-center max-w-sm fade-enter">
        <div className="mb-4 flex justify-center text-accent"><UtensilsCrossed size={48} strokeWidth={1.5} /></div>
        <h1 className="font-serif font-bold text-xl mb-2">Menü Bulunamadı</h1>
        <p className="text-sm text-ink-muted">Bu menü mevcut değil veya kaldırılmış olabilir.</p>
      </div>
    </div>
  );

  // "Diğer" seçilen ve note 3 karakterden az → gönderim devre dışı
  const canSendCall = selectedCallType !== null &&
    (selectedCallType !== 'other' || callNote.trim().length >= 3);

  const description = menu.business.description ?? undefined;

  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="mx-auto w-full max-w-[480px] md:max-w-5xl px-3.5 md:px-6 pt-3 md:pt-6"
        style={{ paddingBottom: tableId ? 104 : 24 }}>

        {/* Bildirimler */}
        {orderSent && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] ui-card rounded-2xl px-5 py-3 text-sm font-bold fade-enter flex items-center gap-2"
            role="status">
            <CheckCircle2 size={18} className="flex-shrink-0 text-state-ok" /> Siparişiniz alındı!
          </div>
        )}

        {/* Başlık: işletme adı (serif) + altın alt başlık | masa + gece/gündüz */}
        <header className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            {menu.business.logo_url ? (
              <img src={menu.business.logo_url} alt={menu.business.name}
                className="w-12 h-12 md:w-14 md:h-14 rounded-2xl object-cover flex-shrink-0 border border-line" />
            ) : (
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex-shrink-0 flex items-center justify-center bg-surface border border-line text-accent">
                <Wheat size={22} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-serif font-bold text-xl md:text-4xl leading-tight line-clamp-2 break-words">{menu.business.name}</h1>
              {description && <BusinessDescription text={description} />}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {tableId && tableName && (
              <div className="ui-chip rounded-2xl px-3 py-1.5 flex flex-col items-center justify-center text-center min-w-[64px]">
                <div className="flex items-center gap-1 text-[10px] text-ink-muted font-medium">
                  <Armchair size={10} />
                  <span>Masa</span>
                </div>
                <span className="font-extrabold text-sm leading-tight truncate max-w-[90px]">{tableName}</span>
              </div>
            )}
            <ThemeToggle />
          </div>
        </header>

        {/* Menü / Siparişlerim */}
        {tableId && (
          <div className="flex gap-1 p-1 mb-4 rounded-2xl bg-surface-2 border border-line md:max-w-sm">
            {([['menu', UtensilsCrossed, 'Menü'], ['orders', Receipt, 'Siparişlerim']] as const).map(([tab, TabIcon, label]) => (
              <button key={tab} onClick={() => setMainTab(tab)} aria-pressed={mainTab === tab}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 spring-btn ${
                  mainTab === tab ? 'ui-chip-active' : 'text-ink-muted'}`}>
                <TabIcon size={13} /> {label}
              </button>
            ))}
          </div>
        )}

        {mainTab === 'orders' && tableId ? (
          <div className="md:max-w-2xl">
            <MyOrdersTab slug={slug} tableId={tableId} token={customerToken} />
          </div>
        ) : (
          <div className="md:grid md:grid-cols-[190px_1fr] md:gap-6 md:items-start">
            {/* Masaüstü: sol kategori şeridi */}
            <nav className="hidden md:flex flex-col gap-1.5 sticky top-6" aria-label="Kategoriler">
              {menu.categories.map(cat => {
                const active = !searchQuery && activeCategory?.id === cat.id;
                return (
                  <button key={cat.id} onClick={() => { setSearchQuery(''); setActiveCategoryId(cat.id); }}
                    aria-current={active ? 'true' : undefined}
                    className={`text-left px-4 py-3 rounded-2xl font-serif text-[15px] spring-btn ${
                      active ? 'ui-chip-active' : 'text-ink hover:bg-surface-2'}`}>
                    {cat.name}
                  </button>
                );
              })}
            </nav>

            <div className="min-w-0">
              {/* Arama */}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Menüde ara..." aria-label="Menüde ara"
                  className="ui-input w-full pl-10 pr-9 py-3 rounded-2xl text-sm font-medium" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-label="Aramayı temizle">
                    <X size={14} className="block" />
                  </button>
                )}
              </div>

              {/* Mobil: yatay kategori hapları */}
              {!searchQuery && (
                <div className="md:hidden flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 mb-3">
                  {menu.categories.map(cat => {
                    const active = activeCategory?.id === cat.id;
                    return (
                      <button key={cat.id} onClick={() => setActiveCategoryId(cat.id)}
                        aria-pressed={active}
                        className={`flex-shrink-0 px-4 py-2 rounded-2xl text-xs font-semibold spring-btn ${active ? 'ui-chip-active' : 'ui-chip'}`}>
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Bölüm başlığı */}
              <div className="flex items-center gap-3 mb-3 px-1">
                <h2 className="font-serif font-bold text-lg md:text-2xl">
                  {searchQuery ? 'Arama Sonuçları' : activeCategory?.name}
                </h2>
                <div className="flex-1 h-px bg-line" />
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-surface-2 border border-line text-ink-muted">
                  {visibleProducts.length} ürün
                </span>
              </div>

              {/* Ürünler */}
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleProducts.length === 0 && (
                  <div className="ui-card rounded-3xl py-8 text-center text-ink-muted lg:col-span-2">
                    <UtensilsCrossed size={24} className="mb-2 text-accent inline-block" />
                    <p className="text-xs">{searchQuery ? 'Aramanıza uygun ürün bulunamadı.' : 'Bu kategoride henüz ürün yok.'}</p>
                  </div>
                )}

                {visibleProducts.map(product => {
                  const inCart = cart.find(i => i.product_id === product.id);
                  // Masadan açıldıysa karta dokunmak sepete ekler (garson menüsü gibi); değilse detay açar
                  const onCardTap = () => (tableId ? addToCart(product) : setSelectedProduct(product));
                  return (
                    <div key={product.id} onClick={onCardTap}
                      role="button" aria-label={tableId ? `${product.name} sepete ekle` : product.name}
                      className="ui-card rounded-3xl p-3 flex gap-3 cursor-pointer relative select-none transition-shadow hover:shadow-md"
                      style={inCart ? { borderColor: 'var(--biz)', boxShadow: '0 0 0 1px var(--biz), var(--shadow)' } : undefined}>
                      <div className="relative w-24 h-24 flex-shrink-0 rounded-2xl overflow-hidden bg-surface-2">
                        {product.image_url ? (
                          <img src={product.thumb_url ?? product.image_url} alt={product.name} loading="lazy"
                            className="w-full h-full object-cover pointer-events-none" draggable={false} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-accent"><UtensilsCrossed size={30} strokeWidth={1.5} /></div>
                        )}
                        {inCart && (
                          <span className="absolute top-1.5 left-1.5 z-10 btn-primary w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center pointer-events-none shadow">
                            {inCart.quantity}
                          </span>
                        )}
                        {inCart && (
                          <button onClick={e => { e.stopPropagation(); clearFromCart(product.id); }}
                            className="absolute bottom-1.5 left-1.5 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-surface border border-line text-state-danger shadow spring-btn"
                            title="Bu üründen vazgeç" aria-label="Bu üründen vazgeç">
                            <X size={15} strokeWidth={3} />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col">
                        <h4 className={`font-serif font-bold text-[15px] leading-snug ${tableId ? 'pr-9' : ''}`}>{product.name}</h4>
                        {product.description && (
                          <p className="text-xs text-ink-muted leading-snug mt-1 line-clamp-2">{product.description}</p>
                        )}
                        <div className="flex items-center justify-between mt-auto pt-2">
                          <span className="text-base font-extrabold tracking-tight">{formatPrice(product.price_int)}</span>
                          {tableId && !inCart && (
                            <span className="btn-primary w-9 h-9 rounded-full flex items-center justify-center text-sm spring-btn" aria-hidden="true">
                              <Plus size={16} strokeWidth={3} />
                            </span>
                          )}
                        </div>
                        {inCart && (
                          <div className="mt-2 flex items-center justify-between gap-1.5 bg-surface-2 p-1 rounded-xl border border-line">
                            <button onClick={e => { e.stopPropagation(); removeFromCart(product.id); }} aria-label="Azalt"
                              className="btn-outline w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center spring-btn">
                              <Minus size={14} strokeWidth={3} />
                            </button>
                            <span className="font-extrabold text-xs">{inCart.quantity} adet</span>
                            <button onClick={e => { e.stopPropagation(); addToCart(product); }} aria-label="Artır"
                              className="btn-primary w-9 h-9 rounded-lg font-bold text-sm flex items-center justify-center spring-btn">
                              <Plus size={14} strokeWidth={3} />
                            </button>
                          </div>
                        )}
                      </div>

                      {tableId && (
                        <button onClick={e => { e.stopPropagation(); setSelectedProduct(product); }}
                          className="absolute top-2 right-2 z-10 ui-chip w-8 h-8 rounded-full flex items-center justify-center spring-btn"
                          title="Ürün detayı" aria-label={`${product.name} detayı`}>
                          <Info size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {mainTab === 'menu' && <BusinessInfoCard business={menu.business} />}

        {!tableId && (
          <div className="text-center px-4 pt-6 pb-2">
            <p className="text-xs text-ink-muted">
              Powered by <span className="font-bold text-accent">{BRAND_NAME}</span>
            </p>
          </div>
        )}
      </div>

      {/* Alt yüzen bar: Garson Çağır + Sepetim (mobil ve masaüstü) */}
      {tableId && mainTab === 'menu' && (
        <div className="fixed bottom-3 left-0 right-0 z-30 px-3.5">
          <div className="mx-auto max-w-[480px] flex items-center gap-2">
            <button onClick={openCallModal}
              className="btn-outline rounded-full px-4 py-3 text-xs font-extrabold flex items-center gap-2 spring-btn shadow-lg">
              <Bell size={15} />
              <span className="whitespace-nowrap">Garson Çağır</span>
            </button>
            <button onClick={() => setCartOpen(true)}
              className="btn-primary flex-1 rounded-full px-4 py-3 text-xs font-extrabold flex items-center justify-between spring-btn shadow-lg">
              <span className="flex items-center gap-2">
                <span className="relative">
                  <ShoppingCart size={15} className="block" />
                  {cartCount > 0 && (
                    <span className="absolute -top-2 -right-2.5 bg-surface text-ink border border-line font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </span>
                <span className="ml-1">Sepetim</span>
              </span>
              <span className="flex items-center gap-1.5">
                {cartCount > 0 && <span>{cartCount} ürün • {formatPrice(cartTotal)}</span>}
                <ChevronRight size={13} />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Ürün detay sheet */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center ui-scrim fade-enter"
          onClick={() => setSelectedProduct(null)}>
          <div className="bg-surface text-ink sheet-enter w-full max-w-[480px] rounded-t-[32px] md:rounded-[28px] overflow-x-hidden overflow-y-auto sheet-max-90 border border-line"
            onClick={e => e.stopPropagation()}>
            {selectedProduct.image_url && (
              <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                <img src={selectedProduct.image_url} alt={selectedProduct.name}
                  className="absolute inset-0 w-full h-full object-cover" />
              </div>
            )}
            <div className="p-6">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-serif font-bold text-2xl flex-1">{selectedProduct.name}</h3>
                <button onClick={() => setSelectedProduct(null)} aria-label="Kapat"
                  className="ui-chip w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 spring-btn">
                  <X size={14} />
                </button>
              </div>
              {selectedProduct.description && (
                <p className="text-sm text-ink-muted mb-4 leading-relaxed">{selectedProduct.description}</p>
              )}
              <div className="pt-4 border-t border-line flex items-center justify-between">
                <span className="font-serif font-bold text-2xl">{formatPrice(selectedProduct.price_int)}</span>
                {tableId && (
                  <button onClick={() => addToCart(selectedProduct)}
                    className="btn-primary px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 spring-btn">
                    <Plus size={14} strokeWidth={3} /> Sepete Ekle
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sepet sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center ui-scrim fade-enter"
          onClick={() => setCartOpen(false)}>
          <div className="bg-surface text-ink sheet-enter w-full max-w-[480px] rounded-t-[32px] md:rounded-[28px] flex flex-col overflow-hidden sheet-max-90 border border-line"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-line rounded-full mx-auto mt-3 md:hidden flex-shrink-0" />

            <div className="px-5 pt-3 md:pt-5 pb-3 flex items-center justify-between border-b border-line flex-shrink-0">
              <div>
                <h3 className="font-serif font-bold text-xl leading-tight">Sipariş Sepetiniz</h3>
                {tableName && <p className="text-[11px] text-ink-muted">{tableName} • Anında mutfak iletimi</p>}
              </div>
              <button onClick={() => setCartOpen(false)} aria-label="Kapat"
                className="ui-chip w-9 h-9 rounded-full flex items-center justify-center spring-btn">
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
              {cart.length === 0 ? (
                <div className="text-center py-10 text-ink-muted">
                  <ShoppingBasket size={30} className="mb-2 text-accent inline-block" />
                  <p className="text-sm">Sepetiniz şu anda boş.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cart.map(item => {
                    const isNoteOpen = openNoteFor === item.product_id;
                    const hasNote = item.note && item.note.trim().length > 0;

                    return (
                      <div key={item.product_id}
                        className="bg-surface-2 border border-line rounded-2xl overflow-hidden"
                        style={hasNote ? { borderColor: 'var(--state-warn)' } : undefined}>
                        <div className="p-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate">{item.name}</div>
                            <div className="text-xs font-extrabold text-ink-muted">{formatPrice(item.price_int * item.quantity)}</div>
                          </div>
                          <div className="flex items-center gap-1.5 bg-surface p-1 rounded-xl border border-line">
                            <button onClick={() => removeFromCart(item.product_id)} aria-label="Azalt"
                              className="btn-outline w-7 h-7 rounded-lg font-bold text-sm flex items-center justify-center spring-btn"><Minus size={14} strokeWidth={3} /></button>
                            <span className="font-extrabold text-sm w-5 text-center">{item.quantity}</span>
                            <button onClick={() => addToCart({ id: item.product_id, name: item.name, price_int: item.price_int })} aria-label="Artır"
                              className="btn-primary w-7 h-7 rounded-lg font-bold text-sm flex items-center justify-center spring-btn"><Plus size={14} strokeWidth={3} /></button>
                          </div>
                        </div>

                        {hasNote && !isNoteOpen && (
                          <div className="px-3 py-2 bg-state-warn-bg border-t border-line flex items-center justify-between gap-2">
                            <div className="text-xs text-state-warn flex-1 min-w-0"><NotebookPen size={12} className="inline-block align-[-2px]" /> <strong>{item.note}</strong></div>
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-bold text-ink underline underline-offset-2 whitespace-nowrap">
                              Düzenle
                            </button>
                          </div>
                        )}

                        {!hasNote && !isNoteOpen && (
                          <div className="px-3 pb-2.5">
                            <button onClick={() => setOpenNoteFor(item.product_id)}
                              className="text-xs font-semibold text-ink-muted hover:text-ink inline-flex items-center gap-1">
                              <NotebookPen size={12} className="text-accent" /> + Bu ürüne özel not ekle
                            </button>
                          </div>
                        )}

                        {isNoteOpen && (
                          <div className="px-3 pt-2.5 pb-3 bg-surface border-t border-line">
                            <OrderNoteTemplates
                              value={item.note ?? ''}
                              onChange={(newNote) => updateItemNote(item.product_id, newNote)}
                              label={`${item.name} İçin Not`}
                              placeholder="Bu ürüne özel istek (örn: sıcak olsun)..."
                              rows={2}
                            />
                            <button onClick={() => setOpenNoteFor(null)}
                              className="mt-2 w-full py-2 rounded-xl btn-outline text-sm font-bold spring-btn flex items-center justify-center gap-1.5">
                              <Check size={14} strokeWidth={3} /> Tamam
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {cart.length > 0 && (
                <div className="mt-4 pt-4 border-t border-dashed border-line">
                  <label className="text-[11px] font-bold text-ink-muted flex items-center gap-1 mb-1 uppercase tracking-wider">
                    <ClipboardList size={11} /> Sipariş Geneli Not (opsiyonel)
                  </label>
                  <p className="text-[11px] text-ink-muted mb-2">
                    Tüm sipariş için geçerli notlar (örn: "kapı kenarında oturuyoruz")
                  </p>
                  <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)}
                    placeholder="Mutfak için özel not ekleyin..."
                    rows={2}
                    className="ui-input w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none" />
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="px-5 pt-3 sheet-footer-safe border-t border-line flex-shrink-0">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-ink-muted text-sm">Toplam Tutar</span>
                  <span className="font-serif font-bold text-2xl">{formatPrice(cartTotal)}</span>
                </div>
                <button onClick={sendOrder} disabled={orderLoading}
                  className="btn-primary w-full py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 spring-btn">
                  {orderLoading ? 'Gönderiliyor...' : (<><Send size={14} /> Siparişi Gönder</>)}
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
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center ui-scrim fade-enter"
          onClick={closeCallSheet}>
          <div className="bg-surface text-ink sheet-enter w-full max-w-[480px] rounded-t-[32px] md:rounded-[28px] flex flex-col overflow-hidden sheet-max-90 border border-line"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-line rounded-full mx-auto mt-3 md:hidden" />

            <div className="px-5 pt-3 md:pt-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center border"
                  style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)', color: 'var(--accent)' }}>
                  <Bell size={20} />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-xl leading-tight">Garson Çağır</h3>
                  <p className="text-xs text-ink-muted font-medium">
                    {showCallSuccess ? (tableName || 'Masanız') : 'Ne istediğinizi seçin'}
                  </p>
                </div>
              </div>
              <button onClick={closeCallSheet}
                disabled={callLoading} aria-label="Kapat"
                className="ui-chip w-9 h-9 rounded-full flex items-center justify-center spring-btn disabled:opacity-50">
                <X size={16} />
              </button>
            </div>

            {showCallSuccess && sentType && lastCall ? (
              /* Gönderim sonrası: Garsonunuz haberdar edildi */
              <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-6 flex flex-col items-center text-center fade-enter">
                <div className="relative flex items-center justify-center my-4">
                  <div className="absolute w-24 h-24 rounded-full animate-ping bg-[color-mix(in_srgb,var(--biz)_18%,transparent)]"
                    style={{ animationDuration: '2.4s' }} />
                  <div className="relative w-20 h-20 rounded-full flex items-center justify-center ui-chip-active shadow-[var(--shadow)]">
                    <CheckCircle2 size={40} strokeWidth={1.5} />
                  </div>
                </div>
                <h4 className="font-serif text-2xl font-bold">Garsonunuz haberdar edildi</h4>
                <p className="text-sm font-semibold mt-1.5 text-ink">
                  “{sentType.label}” {lastCall.already ? 'talebiniz zaten iletilmişti' : 'talebiniz iletildi'}
                </p>
                <p className="text-xs text-ink-muted mt-1 flex items-center gap-1.5">
                  <Clock size={12} /> {minutesAgoLabel(lastCall.at)}{tableName ? ` • ${tableName}` : ''}
                </p>

                <div className="w-full mt-7 space-y-2">
                  <button onClick={() => dismissCallSuccess(true)}
                    className="btn-primary w-full py-3.5 rounded-full text-sm font-bold spring-btn">
                    Tamam
                  </button>
                  <button onClick={() => dismissCallSuccess(false)}
                    className="btn-outline w-full py-3 rounded-full text-sm font-semibold spring-btn">
                    Başka bir istek
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    {CALL_TYPES.map(ct => {
                      const isSelected = selectedCallType === ct.code;
                      const Icon = ct.icon;
                      return (
                        <button key={ct.code}
                          onClick={() => setSelectedCallType(ct.code)}
                          aria-pressed={isSelected}
                          className={`relative rounded-[22px] p-3 min-h-[98px] flex flex-col items-center justify-center gap-2 spring-btn border ${
                            isSelected ? 'bg-surface border-[var(--biz)] shadow-[0_0_0_1px_var(--biz)]' : 'bg-surface-2 border-line'}`}>
                          <span className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                            isSelected ? 'ui-chip-active' : `bg-surface border border-line ${ct.critical ? 'text-state-danger' : 'text-ink'}`}`}>
                            <Icon size={21} strokeWidth={1.5} />
                          </span>
                          <span className={`text-[12px] text-center leading-tight tracking-tight ${isSelected ? 'font-bold text-ink' : 'font-semibold text-ink-muted'}`}>
                            {ct.label}
                          </span>
                          {recentCode === ct.code && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center ui-chip-active"
                              title="Az önce iletildi">
                              <Check size={12} strokeWidth={2.5} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* "Diğer" seçilince serbest text */}
                  {selectedCallType === 'other' && (
                    <div className="mt-4">
                      <label className="text-[11px] font-bold text-ink-muted block mb-1.5 uppercase tracking-wider">
                        Açıklama (zorunlu, en az 3 karakter)
                      </label>
                      <textarea value={callNote}
                        onChange={e => setCallNote(e.target.value)}
                        placeholder="Ne istediğinizi yazın..."
                        rows={3}
                        autoFocus
                        className="ui-input w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none"
                        style={callNote.trim().length < 3 && callNote.length > 0 ? { borderColor: 'var(--state-danger)' } : undefined} />
                      {callNote.trim().length < 3 && callNote.length > 0 && (
                        <div className="text-[11px] text-state-danger mt-1 font-semibold">En az 3 karakter yazın</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-5 pt-3 sheet-footer-safe border-t border-line flex-shrink-0">
                  <button onClick={sendCall}
                    disabled={!canSendCall || callLoading}
                    className={`w-full py-3.5 rounded-[22px] text-sm font-bold flex items-center justify-center gap-2 spring-btn border disabled:cursor-not-allowed ${
                      selected && canSendCall && !callLoading ? 'btn-primary' : 'bg-surface-2 border-line text-ink-muted'}`}>
                    <Bell size={16} />
                    {callLoading ? 'Gönderiliyor...' : selected ? `“${selected.label}” Çağrısını Gönder` : 'Çağrıyı Gönder'}
                  </button>
                  <p className="text-[11px] text-center mt-2 font-semibold text-ink-muted">
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
