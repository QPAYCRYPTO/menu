// apps/api/src/routes/publicRoutes.ts
// CHANGELOG:
// - POST /call/:slug body'de call_type kabul eder (12 enum değer + 'other')
// - INSERT INTO orders'a call_type yazılıyor
// - SSE event'inde call_type ve note yayınlanıyor
// - 'other' seçilirse note serbest text içerir (zorunlu min 3 karakter)

import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { publicMenuRateLimit } from '../middleware/rateLimit.js';
import { getPublicMenuBySlug } from '../services/menuService.js';
import { pool } from '../db/postgres.js';
import { publishOrder } from '../db/redisPubSub.js';
import { getOrCreateOpenSession } from '../services/sessionService.js';

const slugParamsSchema = z.object({
  slug: z.string().min(1).max(120)
});

const createPublicOrderSchema = z.object({
  table_id: z.string().uuid(),
  note: z.string().max(500).optional(),
  type: z.enum(['order', 'call']).default('order'),
  customer_token: z.string().min(10).max(100).optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().min(1),
    note: z.string().max(300).optional()
  })).optional()
});

// YENİ: Çağrı türleri
const CALL_TYPES = [
  'waiter',           // 👤 Garson
  'baby_chair',       // 🪑 Mama Sandalyesi
  'charger',          // 🔌 Şarj
  'bill',             // 🧾 Hesap
  'package',          // 📦 Paket
  'ashtray',          // 🚬 Küllük
  'lighter',          // 🔥 Çakmak
  'cigarette',        // 🚬 Sigara
  'water',            // 💧 Su
  'missing_service',  // ❌ Servis eksik
  'clean_table',      // 🧽 Masa silinsin
  'other'             // ✏️ Diğer (yaz)
] as const;

const createCallSchema = z.object({
  table_id: z.string().uuid(),
  call_type: z.enum(CALL_TYPES).optional(),
  note: z.string().max(500).optional()
}).refine(
  (data) => data.call_type !== 'other' || (data.note !== undefined && data.note.trim().length >= 3),
  { message: "'Diğer' seçildiyse açıklama zorunludur (en az 3 karakter).", path: ['note'] }
);

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

// Müşteri sipariş oluşturur (mevcut, dokunulmadı)
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

  const orderItems: Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    price_int: number;
    note: string | null;
  }> = [];

  let createdAt: string = '';
  let orderId: string = '';

  try {
    await client.query('BEGIN');

    let sessionId: string | null = null;
    if (parsed.data.type === 'order') {
      const session = await getOrCreateOpenSession(businessId, table.id, client);
      sessionId = session.id;
    }

    const orderResult = await client.query(
      `INSERT INTO orders (id, business_id, table_id, table_name, status, note, type, customer_token, session_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, created_at`,
      [businessId, table.id, table.name, parsed.data.note ?? null, parsed.data.type, parsed.data.customer_token ?? null, sessionId]
    );

    orderId = orderResult.rows[0].id;
    createdAt = orderResult.rows[0].created_at;

    if (parsed.data.items && parsed.data.items.length > 0) {
      for (const item of parsed.data.items) {
        const productResult = await client.query(
          `SELECT id, name, price_int FROM products WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
          [item.product_id, businessId]
        );
        if (productResult.rowCount === 1) {
          const product = productResult.rows[0];
          const itemNote = item.note?.trim() || null;

          const itemResult = await client.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price_int, note, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
             RETURNING id`,
            [orderId, product.id, product.name, item.quantity, product.price_int, itemNote]
          );

          orderItems.push({
            id: itemResult.rows[0].id,
            product_id: product.id,
            product_name: product.name,
            quantity: item.quantity,
            price_int: product.price_int,
            note: itemNote
          });
        }
      }
    }

    await client.query('COMMIT');

    await publishOrder(businessId, {
      type: 'new_order',
      order_id: orderId,
      table_name: table.name,
      order_type: parsed.data.type,
      order: {
        id: orderId,
        table_id: table.id,
        table_name: table.name,
        status: 'pending',
        note: parsed.data.note ?? null,
        type: parsed.data.type,
        created_at: createdAt,
        items: orderItems
      }
    });

    res.status(201).json({ order_id: orderId, message: 'Sipariş alındı.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// GARSON ÇAĞIR — call_type ile
// ─────────────────────────────────────────────────────────────

publicRoutes.post('/call/:slug', async (req, res) => {
  const slugParsed = slugParamsSchema.safeParse(req.params);
  if (!slugParsed.success) {
    throw new AppError('Geçersiz slug.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const parsed = createCallSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    res.status(400).json({ message: firstError.message });
    return;
  }

  const { table_id, call_type, note } = parsed.data;

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

  // call_type yoksa default "waiter"
  const finalCallType = call_type ?? 'waiter';
  const finalNote = note?.trim() || null;

  // Çağrı insert — call_type kolonu eklendi
  const callResult = await pool.query(
    `INSERT INTO orders (id, business_id, table_id, table_name, status, note, type, call_type, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4, 'call', $5, NOW(), NOW())
     RETURNING id, created_at`,
    [businessId, table.id, table.name, finalNote, finalCallType]
  );

  const callId = callResult.rows[0].id;
  const callCreatedAt = callResult.rows[0].created_at;

  // Redis Pub/Sub — call_type da yayınlansın
  await publishOrder(businessId, {
    type: 'call',
    table_name: table.name,
    order_type: 'call',
    call_type: finalCallType,
    order: {
      id: callId,
      table_id: table.id,
      table_name: table.name,
      status: 'pending',
      note: finalNote,
      type: 'call',
      call_type: finalCallType,
      created_at: callCreatedAt,
      items: []
    }
  });

  res.status(201).json({
    message: 'Çağrı gönderildi.',
    call_type: finalCallType
  });
});