// apps/api/src/services/menuService.ts
import { pool } from '../db/postgres.js';
import { redis } from '../db/redis.js';
import { sanitizeText } from '../utils/sanitize.js';

type MenuCategory = {
  id: string;
  name: string;
  sort_order: number;
  products: Array<{
    id: string;
    category_id: string;
    name: string;
    description: string;
    price_int: number;
    image_url: string | null;
    thumb_url: string | null;
    sort_order: number;
  }>;
};

type PublicMenuPayload = {
  business: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    theme_color: string | null;
    bg_color: string | null;
    dark_mode: boolean;
    description: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    contact_whatsapp: string | null;
    contact_instagram: string | null;
  };
  categories: MenuCategory[];
};

function randomTtlSeconds(): number {
  return Math.floor(Math.random() * 61) + 60;
}

export async function getPublicMenuBySlug(slug: string): Promise<PublicMenuPayload | null> {
  const cacheKey = `menu:${slug}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PublicMenuPayload;
  }

  const businessResult = await pool.query(
    `SELECT id, name, slug, logo_url, theme_color, bg_color, dark_mode,
            description, contact_phone, contact_email, contact_whatsapp, contact_instagram
     FROM businesses
     WHERE slug = $1 AND is_active = TRUE`,
    [slug]
  );

  if (businessResult.rowCount !== 1) return null;

  const business = businessResult.rows[0];

  const categoriesResult = await pool.query(
    `SELECT id, name, sort_order
     FROM categories
     WHERE business_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC`,
    [business.id]
  );

  const productsResult = await pool.query(
    `SELECT id, category_id, name, description, price_int, image_url, thumb_url, sort_order
     FROM products
     WHERE business_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC`,
    [business.id]
  );

  const productsByCategory = new Map<string, MenuCategory['products']>();
  for (const product of productsResult.rows) {
    const list = productsByCategory.get(product.category_id) ?? [];
    list.push({
      id: product.id,
      category_id: product.category_id,
      name: sanitizeText(product.name),
      description: sanitizeText(product.description ?? ''),
      price_int: Number(product.price_int),
      image_url: product.image_url,
      thumb_url: product.thumb_url,
      sort_order: Number(product.sort_order)
    });
    productsByCategory.set(product.category_id, list);
  }

  const payload: PublicMenuPayload = {
    business: {
      id: business.id,
      name: sanitizeText(business.name),
      slug: business.slug,
      logo_url: business.logo_url ?? null,
      theme_color: business.theme_color ?? '#0D9488',
      bg_color: business.bg_color ?? '#F8FAFC',
      dark_mode: business.dark_mode ?? false,
      description: business.description ? sanitizeText(business.description) : null,
      contact_phone: business.contact_phone ?? null,
      contact_email: business.contact_email ?? null,
      contact_whatsapp: business.contact_whatsapp ?? null,
      contact_instagram: business.contact_instagram ?? null,
    },
    categories: categoriesResult.rows.map((category) => ({
      id: category.id,
      name: sanitizeText(category.name),
      sort_order: Number(category.sort_order),
      products: productsByCategory.get(category.id) ?? []
    }))
  };

  await redis.set(cacheKey, JSON.stringify(payload), 'EX', randomTtlSeconds());
  return payload;
}

export async function invalidateBusinessMenuCache(slug: string): Promise<void> {
  await redis.del(`menu:${slug}`);
}