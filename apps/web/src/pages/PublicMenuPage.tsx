// apps/web/src/pages/PublicMenuPage.tsx
import type { PublicMenuCategory, PublicMenuResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';

const BRAND_NAME = 'AtlasQR';

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
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

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

      {/* Header */}
      <div style={{background: '#0F172A', position: 'sticky', top: 0, zIndex: 10}}>
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center gap-4 mb-5">
            {menu.business.logo_url ? (
              <img src={menu.business.logo_url} alt={menu.business.name}
                className="flex-shrink-0 rounded-xl object-cover"
                style={{width: 56, height: 56, border: `2px solid ${themeColor}`}} />
            ) : (
              <div className="flex-shrink-0 rounded-xl flex items-center justify-center font-bold text-xl text-white"
                style={{width: 56, height: 56, background: themeColor}}>
                {menu.business.name?.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg leading-tight text-white" style={{fontFamily: 'Georgia, serif'}}>
                {menu.business.name}
              </h1>
              {(menu.business as any).description && (
                <p className="text-xs mt-0.5 truncate" style={{color: 'rgba(255,255,255,0.55)'}}>
                  {(menu.business as any).description}
                </p>
              )}
            </div>
          </div>

          {/* Kategori sekmeleri */}
          <div style={{display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4}}>
            {menu.categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategoryId(cat.id)}
                style={{
                  flexShrink: 0, padding: '6px 16px', borderRadius: 999,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: activeCategory?.id === cat.id ? themeColor : 'rgba(255,255,255,0.1)',
                  color: activeCategory?.id === cat.id ? 'white' : 'rgba(255,255,255,0.6)',
                  border: `1px solid ${activeCategory?.id === cat.id ? themeColor : 'rgba(255,255,255,0.15)'}`
                }}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ürünler */}
      <div className="px-4 py-6">
        {activeCategory && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-bold text-base" style={{color: textColor, fontFamily: 'Georgia, serif'}}>
                {activeCategory.name}
              </h2>
              <div className="flex-1 h-px" style={{background: cardBorder}}></div>
              <span className="text-xs px-2 py-1 rounded-full font-medium"
                style={{background: `${themeColor}20`, color: themeColor}}>
                {activeCategory.products?.length ?? 0} ürün
              </span>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
              {(activeCategory.products ?? []).map(product => (
                <div key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  style={{background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, overflow: 'hidden', cursor: 'pointer'}}>

                  {/* Fotoğraf — padding-top trick */}
                  <div style={{width: '100%', paddingTop: '100%', position: 'relative', background: darkMode ? '#334155' : '#F1F5F9'}}>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}}
                      />
                    ) : (
                      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32}}>🍽️</div>
                    )}
                  </div>

                  <div style={{padding: '10px 12px'}}>
                    <div style={{fontWeight: 600, fontSize: 13, color: textColor, marginBottom: 2, lineHeight: 1.3}}>
                      {product.name}
                    </div>
                    {product.description && (
                      <div style={{fontSize: 11, color: textMuted, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical'}}>
                        {product.description}
                      </div>
                    )}
                    <div style={{fontWeight: 700, fontSize: 14, color: themeColor}}>
                      {formatPrice(product.price_int)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {(!activeCategory.products || activeCategory.products.length === 0) && (
              <div className="text-center py-16 rounded-2xl" style={{background: cardBg, border: `1px dashed ${cardBorder}`}}>
                <div className="text-4xl mb-3">🍽️</div>
                <p className="text-sm" style={{color: textMuted}}>Bu kategoride ürün yok</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="text-center px-4 py-6" style={{borderTop: `1px solid ${cardBorder}`}}>
        <a href={contactLink}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold mb-4"
          style={{background: themeColor, color: 'white'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          İletişim
        </a>
        <p className="text-xs" style={{color: textMuted}}>
          Powered by <span style={{fontWeight: 600, color: themeColor}}>{BRAND_NAME}</span>
        </p>
      </div>

      {/* Ürün Detay Modal */}
      {selectedProduct && (
        <div
          style={{position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(15,23,42,0.7)'}}
          onClick={() => setSelectedProduct(null)}>
          <div
            style={{width: '100%', maxWidth: 480, background: cardBg, borderRadius: '24px 24px 0 0', overflow: 'hidden'}}
            onClick={e => e.stopPropagation()}>

            {selectedProduct.image_url && (
              <div style={{width: '100%', paddingTop: '56.25%', position: 'relative', background: darkMode ? '#334155' : '#F1F5F9'}}>
                <img
                  src={selectedProduct.image_url}
                  alt={selectedProduct.name}
                  style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}}
                />
              </div>
            )}

            <div style={{padding: 24}}>
              <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8}}>
                <h3 style={{fontWeight: 700, fontSize: 20, color: textColor, fontFamily: 'Georgia, serif', flex: 1}}>
                  {selectedProduct.name}
                </h3>
                <button
                  onClick={() => setSelectedProduct(null)}
                  style={{width: 32, height: 32, borderRadius: '50%', border: 'none', background: darkMode ? '#334155' : '#F1F5F9', color: textMuted, cursor: 'pointer', marginLeft: 12, flexShrink: 0, fontSize: 14}}>
                  ✕
                </button>
              </div>
              {selectedProduct.description && (
                <p style={{fontSize: 14, color: textMuted, marginBottom: 16, lineHeight: 1.6}}>
                  {selectedProduct.description}
                </p>
              )}
              <div style={{borderTop: `1px solid ${cardBorder}`, paddingTop: 16}}>
                <span style={{fontWeight: 700, fontSize: 24, color: themeColor}}>
                  {formatPrice(selectedProduct.price_int)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}