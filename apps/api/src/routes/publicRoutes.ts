// apps/api/src/routes/publicRoutes.ts
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { publicMenuRateLimit } from '../middleware/rateLimit.js';
import { getPublicMenuBySlug } from '../services/menuService.js';
import { pool } from '../db/postgres.js';
import { sseClients } from './orderRoutes.js';

const slugParamsSchema = z.object({
  slug: z.string().min(1).max(120)
});

const createPublicOrderSchema = z.object({
  table_id: z.string().uuid(),
  note: z.string().max(500).optional(),
  type: z.enum(['order', 'call']).default('order'),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().min(1)
  })).optional()
});

export const publicRoutes = Router();

publicRoutes.get('/menu/:slug', publicMenuRateLimit, async (req, res) => {
  const parsed = slugParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz slug parametresi.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }
  const menu = await getPublicMenuBySlug(parsed.data.slug);
  if (!menu) {
    throw new AppError('Menü bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json(menu);
});

publicRoutes.get('/qr/:slug', (req, res) => {
  const parsed = slugParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz slug parametresi.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }
  const url = `${env.appUrl}/menu/${parsed.data.slug}`;
  const html = `<!doctype html>
  <html lang="tr">
  <head><meta charset="UTF-8" /><title>QR Menü</title></head>
  <body style="font-family: Arial; margin: 2rem;">
    <h1>QR Menü Bağlantısı</h1>
    <p>Bağlantı: <a href="${url}">${url}</a></p>
    <small style="position: fixed; bottom: 8px; left: 8px; opacity: .7;">Powered by ${env.brand}</small>
  </body>
  </html>`;
  res.status(200).type('html').send(html);
});

// Müşteri sipariş oluşturur
publicRoutes.post('/order/:slug', async (req, res) => {
  const slugParsed = slugParamsSchema.safeParse(req.params);
  if (!slugParsed.success) {
    throw new AppError('Geçersiz slug.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const parsed = createPublicOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz sipariş verisi.' });
    return;
  }

  const { slug } = slugParsed.data;

  const bizResult = await pool.query(
    `SELECT id FROM businesses WHERE slug = $1 AND is_active = TRUE`,
    [slug]
  );
  if (bizResult.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  const businessId = bizResult.rows[0].id;

  const tableResult = await pool.query(
    `SELECT id, name FROM tables WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
    [parsed.data.table_id, businessId]
  );
  if (tableResult.rowCount !== 1) {
    res.status(404).json({ message: 'Masa bulunamadı.' });
    return;
  }

  const table = tableResult.rows[0];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders (id, business_id, table_id, table_name, status, note, type, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4, $5, NOW(), NOW())
       RETURNING id`,
      [businessId, table.id, table.name, parsed.data.note ?? null, parsed.data.type]
    );

    const orderId = orderResult.rows[0].id;

    if (parsed.data.items && parsed.data.items.length > 0) {
      for (const item of parsed.data.items) {
        const productResult = await client.query(
          `SELECT id, name, price_int FROM products WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
          [item.product_id, businessId]
        );
        if (productResult.rowCount === 1) {
          const product = productResult.rows[0];
          await client.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price_int, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
            [orderId, product.id, product.name, item.quantity, product.price_int]
          );
        }
      }
    }

    await client.query('COMMIT');

    // SSE ile admin'e bildir
    const clients = sseClients.get(businessId);
    if (clients && clients.size > 0) {
      const event = JSON.stringify({
        type: 'new_order',
        order_id: orderId,
        table_name: table.name,
        order_type: parsed.data.type
      });
      clients.forEach(c => c.write(`event: order\ndata: ${event}\n\n`));
    }

    res.status(201).json({ order_id: orderId, message: 'Sipariş alındı.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Garson çağır
publicRoutes.post('/call/:slug', async (req, res) => {
  const slugParsed = slugParamsSchema.safeParse(req.params);
  if (!slugParsed.success) {
    throw new AppError('Geçersiz slug.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const { table_id, note } = req.body;
  if (!table_id) {
    res.status(400).json({ message: 'Masa ID zorunludur.' });
    return;
  }

  const bizResult = await pool.query(
    `SELECT id FROM businesses WHERE slug = $1 AND is_active = TRUE`,
    [slugParsed.data.slug]
  );
  if (bizResult.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  const businessId = bizResult.rows[0].id;

  const tableResult = await pool.query(
    `SELECT id, name FROM tables WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
    [table_id, businessId]
  );
  if (tableResult.rowCount !== 1) {
    res.status(404).json({ message: 'Masa bulunamadı.' });
    return;
  }

  const table = tableResult.rows[0];

  await pool.query(
    `INSERT INTO orders (id, business_id, table_id, table_name, status, note, type, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4, 'call', NOW(), NOW())`,
    [businessId, table.id, table.name, note ?? null]
  );

  // SSE ile admin'e bildir
  const clients = sseClients.get(businessId);
  if (clients && clients.size > 0) {
    const event = JSON.stringify({
      type: 'call',
      table_name: table.name,
      order_type: 'call'
    });
    clients.forEach(c => c.write(`event: order\ndata: ${event}\n\n`));
  }

  res.status(201).json({ message: 'Garson çağrıldı.' });
});