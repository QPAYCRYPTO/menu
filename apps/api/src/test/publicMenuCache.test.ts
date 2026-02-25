import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = new Map<string, string>();
const querySpy = vi.fn(async (sql: string, params: any[]) => {
  if (sql.includes('FROM businesses')) {
    if (params[0] === 'slug-a') {
      return { rowCount: 1, rows: [{ id: 'biz-a', name: 'A İşletmesi', slug: 'slug-a' }] };
    }
    if (params[0] === 'slug-b') {
      return { rowCount: 1, rows: [{ id: 'biz-b', name: 'B İşletmesi', slug: 'slug-b' }] };
    }
    return { rowCount: 0, rows: [] };
  }

  if (sql.includes('FROM categories')) {
    if (params[0] === 'biz-a') {
      return { rowCount: 1, rows: [{ id: 'cat-a', name: 'Sıcaklar', sort_order: 1 }] };
    }
    return { rowCount: 1, rows: [{ id: 'cat-b', name: 'Tatlılar', sort_order: 1 }] };
  }

  if (sql.includes('FROM products')) {
    if (params[0] === 'biz-a') {
      return {
        rowCount: 1,
        rows: [
          {
            id: 'prod-a',
            category_id: 'cat-a',
            name: 'Latte',
            description: 'Açıklama',
            price_int: 1500,
            image_url: null,
            thumb_url: null,
            sort_order: 1
          }
        ]
      };
    }

    return {
      rowCount: 1,
      rows: [
        {
          id: 'prod-b',
          category_id: 'cat-b',
          name: 'Cheesecake',
          description: 'Açıklama',
          price_int: 1900,
          image_url: null,
          thumb_url: null,
          sort_order: 1
        }
      ]
    };
  }

  return { rowCount: 0, rows: [] };
});

vi.mock('../db/postgres.js', () => ({
  pool: {
    query: querySpy
  }
}));

vi.mock('../db/redis.js', () => ({
  redis: {
    get: vi.fn(async (key: string) => cache.get(key) ?? null),
    set: vi.fn(async (key: string, val: string) => {
      cache.set(key, val);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      cache.delete(key);
      return 1;
    })
  }
}));

describe('Public menu cache + slug scope', () => {
  beforeEach(() => {
    cache.clear();
    querySpy.mockClear();
  });

  it('slug scope doğru çalışır', async () => {
    const { getPublicMenuBySlug } = await import('../services/menuService.js');

    const a = await getPublicMenuBySlug('slug-a');
    const b = await getPublicMenuBySlug('slug-b');

    expect(a?.business.slug).toBe('slug-a');
    expect(b?.business.slug).toBe('slug-b');
    expect(a?.categories[0]?.products[0]?.name).toBe('Latte');
    expect(b?.categories[0]?.products[0]?.name).toBe('Cheesecake');
  });

  it('cache path menu:{slug} çalışır', async () => {
    const { getPublicMenuBySlug } = await import('../services/menuService.js');

    await getPublicMenuBySlug('slug-a');
    const firstCalls = querySpy.mock.calls.length;

    await getPublicMenuBySlug('slug-a');
    const secondCalls = querySpy.mock.calls.length;

    expect(cache.has('menu:slug-a')).toBe(true);
    expect(secondCalls).toBe(firstCalls);
  });
});
