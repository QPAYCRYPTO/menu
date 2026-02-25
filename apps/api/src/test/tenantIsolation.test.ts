import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const products = [
  {
    id: 'prod-a',
    business_id: 'biz-a',
    category_id: 'cat-a',
    name: 'A Ürünü',
    description: 'Açıklama',
    price_int: 1000,
    image_url: null,
    thumb_url: null,
    sort_order: 1,
    is_active: true
  }
];

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.ctx = {
      requestId: 'req-test',
      userId: 'user-test',
      businessId: req.headers['x-business-id'] || 'biz-a'
    };
    next();
  }
}));

vi.mock('../services/uploadService.js', () => ({
  validateUpload: vi.fn(),
  processImage: vi.fn()
}));

vi.mock('../services/menuService.js', async () => {
  const actual = await vi.importActual<any>('../services/menuService.js');
  return {
    ...actual,
    invalidateBusinessMenuCache: vi.fn()
  };
});

vi.mock('../db/postgres.js', () => ({
  pool: {
    query: vi.fn((sql: string, params: any[]) => {
      if (sql.includes('FROM products') && sql.includes('WHERE business_id = $1')) {
        const businessId = params[0];
        return Promise.resolve({ rowCount: 1, rows: products.filter((p) => p.business_id === businessId) });
      }

      if (sql.includes('UPDATE products') && sql.includes('WHERE id = $8 AND business_id = $9')) {
        const id = params[7];
        const businessId = params[8];
        const found = products.find((p) => p.id === id && p.business_id === businessId);
        return Promise.resolve({ rowCount: found ? 1 : 0, rows: found ? [found] : [] });
      }

      if (sql.includes('SELECT id FROM categories')) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: 'cat-a' }] });
      }

      if (sql.includes('SELECT slug FROM businesses')) {
        return Promise.resolve({ rowCount: 1, rows: [{ slug: 'biz-a' }] });
      }

      if (sql.includes('FROM businesses') && sql.includes('WHERE id = $1')) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: params[0], name: 'Biz', slug: 'biz-a' }] });
      }

      if (sql.includes('FROM categories')) {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }

      return Promise.resolve({ rowCount: 0, rows: [] });
    })
  }
}));

describe('Tenant isolation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('A ürününü B göremez', async () => {
    const { createApp } = await import('../app.js');
    const app = createApp();

    const listForA = await request(app).get('/api/admin/products').set('x-business-id', 'biz-a');
    const listForB = await request(app).get('/api/admin/products').set('x-business-id', 'biz-b');

    expect(listForA.status).toBe(200);
    expect(listForA.body.length).toBe(1);

    expect(listForB.status).toBe(200);
    expect(listForB.body.length).toBe(0);
  });

  it('B, A ürününü PUT ile güncelleyemez', async () => {
    const { createApp } = await import('../app.js');
    const app = createApp();

    const response = await request(app)
      .put('/api/admin/products/prod-a')
      .set('x-business-id', 'biz-b')
      .send({ name: 'Yeni İsim' });

    expect([403, 404]).toContain(response.status);
  });
});
