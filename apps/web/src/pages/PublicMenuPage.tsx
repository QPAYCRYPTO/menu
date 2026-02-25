import type { PublicMenuCategory, PublicMenuResponse } from '@menu/shared';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';

const BRAND_NAME = import.meta.env.VITE_BRAND ?? 'LezzetQR';

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

function buildContactLink(menu: PublicMenuResponse | null): string {
  if (!menu) return '#';

  const whatsapp = menu.business.contact_whatsapp?.trim();
  if (whatsapp) {
    const digits = whatsapp.replace(/[^\d]/g, '');
    return `https://wa.me/${digits}`;
  }

  const phone = menu.business.contact_phone?.trim();
  if (phone) {
    return `tel:${phone}`;
  }

  const email = menu.business.contact_email?.trim();
  if (email) {
    return `mailto:${email}`;
  }

  return '#';
}

export function PublicMenuPage() {
  const { slug = '' } = useParams();
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    apiRequest<PublicMenuResponse>(`/public/menu/${slug}`, { retryOn401: false })
      .then((data) => {
        if (!mounted) return;
        setMenu(data);
        setActiveCategoryId(data.categories[0]?.id ?? '');
      })
      .catch(() => {
        if (!mounted) return;
        setMenu(null);
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

  const activeCategory = useMemo<PublicMenuCategory | null>(() => {
    if (!menu) return null;
    return menu.categories.find((category) => category.id === activeCategoryId) ?? menu.categories[0] ?? null;
  }, [menu, activeCategoryId]);

  const pageTheme = useMemo(
    () => ({
      '--theme-color': menu?.business.theme_color ?? '#1f2937',
      '--bg-color': menu?.business.bg_color ?? '#f8fafc',
      '--text-color': menu?.business.dark_mode ? '#f9fafb' : '#111827'
    }) as CSSProperties,
    [menu]
  );

  const contactLink = useMemo(() => buildContactLink(menu), [menu]);

  if (!menu) {
    return <main style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>Menü yüklenemedi.</main>;
  }

  return (
    <main
      style={{
        ...pageTheme,
        fontFamily: 'Arial, sans-serif',
        padding: 16,
        minHeight: '100vh',
        background: 'var(--bg-color)',
        color: 'var(--text-color)'
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>{menu.business.name}</h1>
        {menu.business.logo_url && (
          <img
            src={menu.business.logo_url}
            alt={`${menu.business.name} logo`}
            loading="lazy"
            style={{ width: 70, height: 70, borderRadius: 8, objectFit: 'cover', border: '2px solid var(--theme-color)' }}
          />
        )}
      </header>

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {menu.categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategoryId(category.id)}
            style={{
              padding: '8px 10px',
              borderRadius: 999,
              border: '1px solid var(--theme-color)',
              background: activeCategory?.id === category.id ? 'var(--theme-color)' : 'transparent',
              color: activeCategory?.id === category.id ? '#fff' : 'var(--text-color)'
            }}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <section>
        <h2 style={{ marginBottom: 10 }}>{activeCategory?.name}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {(activeCategory?.products ?? []).map((product) => (
            <article key={product.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, background: '#fff' }}>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: 8,
                  overflow: 'hidden',
                  marginBottom: 8,
                  background: '#f3f4f6'
                }}
              >
                {product.image_url ? (
                  <img
                    src={product.thumb_url || product.image_url}
                    alt={product.name}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : null}
              </div>
              <strong>{product.name}</strong>
              <p style={{ margin: '6px 0', color: 'var(--theme-color)' }}>{formatPrice(product.price_int)}</p>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{product.description || 'Açıklama yok'}</p>
            </article>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: 18, fontSize: 12, opacity: 0.85 }}>
        <span>Powered by {BRAND_NAME}</span> |{' '}
        <a href={contactLink} style={{ color: 'inherit' }}>
          İletişim
        </a>
      </footer>
    </main>
  );
}
