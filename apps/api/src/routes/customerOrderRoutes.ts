// apps/api/src/routes/customerOrderRoutes.ts
// Müşteri tarafı public endpoint'ler
// Bu dosya mevcut orderRoutes.ts ve publicRoutes.ts'e dokunmadan eklenmiştir

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { publicMenuRateLimit } from '../middleware/rateLimit.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { findActiveSession, findActiveSessionById } from '../services/sessionService.js';

export const customerOrderRoutes = Router();

const paramsSchema = z.object({
  slug: z.string().min(1).max(120),
  table_id: z.string().uuid()
});

const querySchema = z.object({
  token: z.string().min(10).max(100)
});

// GET /api/public/table/:slug/:table_id
// Masa bilgisini döner (masa adı) — public menü header'ında göstermek için.
// active_session_id: masanın aktif adisyonu (birleşik masada hedef masanınki), yoksa null.
// Siparişlerim sekmesi adisyonu bu id ile çeker. İlk siparişte oturum açıldığı için önbelleğe alınmaz.
customerOrderRoutes.get('/table/:slug/:table_id', publicMenuRateLimit, async (req, res) => {
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const { slug, table_id } = parsed.data;

  const result = await pool.query(`
    SELECT t.id, t.name, t.business_id
    FROM tables t
    INNER JOIN businesses b ON b.id = t.business_id
    WHERE b.slug = $1 
      AND b.is_active = TRUE
      AND t.id = $2
      AND t.is_active = TRUE
  `, [slug, table_id]);

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Masa bulunamadı.' });
    return;
  }

  const table = result.rows[0];
  const activeSession = await findActiveSession(table.business_id, table.id);

  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.status(200).json({ id: table.id, name: table.name, active_session_id: activeSession?.id ?? null });
});

// GET /api/public/my-orders/:slug/:table_id?token=XXX
// Müşteri kendi siparişlerinin durumunu görür
customerOrderRoutes.get('/my-orders/:slug/:table_id', publicMenuRateLimit, async (req, res) => {
  const paramsParsed = paramsSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const queryParsed = querySchema.safeParse(req.query);
  if (!queryParsed.success) {
    // Token yoksa boş liste (hata değil)
    res.status(200).json([]);
    return;
  }

  const { slug, table_id } = paramsParsed.data;
  const { token } = queryParsed.data;

  // İşletme doğrulaması
  const bizResult = await pool.query(
    `SELECT id FROM businesses WHERE slug = $1 AND is_active = TRUE`,
    [slug]
  );
  if (bizResult.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  const businessId = bizResult.rows[0].id;

  // Masa doğrulaması
  const tableResult = await pool.query(
    `SELECT id FROM tables WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
    [table_id, businessId]
  );
  if (tableResult.rowCount !== 1) {
    res.status(404).json({ message: 'Masa bulunamadı.' });
    return;
  }

  // Müşterinin kendi siparişleri — aktif olanlar (delivered/cancelled hariç)
  const ordersResult = await pool.query(`
    SELECT 
      o.id, o.table_name, o.status, o.note, o.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'price_int', oi.price_int
          ) ORDER BY oi.created_at
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) as items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.business_id = $1 
      AND o.table_id = $2 
      AND o.customer_token = $3
      AND o.status NOT IN ('delivered', 'cancelled')
      AND o.type = 'order'
      AND o.created_at > NOW() - INTERVAL '6 hours'
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `, [businessId, table_id, token]);

  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.status(200).json(ordersResult.rows);
});

// GET /api/public/sessions/:sessionId/bill?token=XXX  (veya X-Customer-Token header)
// Müşteri "Siparişlerim": masanın aktif adisyonu — tüm kalemler, durumları, toplam/ödenen/kalan.
// - Giriş gerektirmez; customer_token zorunlu (kalemin "benim mi" bilgisi için).
// - Diğer müşterilerin token'ı dönmez: her kalem için sadece is_mine + source (customer/waiter).
// - Birleştirilmiş oturum verilirse zincirin sonundaki açık adisyon döner; kapalı adisyon görünmez.
const billParamsSchema = z.object({ sessionId: z.string().uuid() });

customerOrderRoutes.get('/sessions/:sessionId/bill', publicMenuRateLimit, async (req, res) => {
  const paramsParsed = billParamsSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw new AppError('Geçersiz oturum.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const rawToken = req.get('x-customer-token') ?? (typeof req.query.token === 'string' ? req.query.token : '');
  const tokenParsed = querySchema.safeParse({ token: rawToken });
  if (!tokenParsed.success) {
    throw new AppError('Geçersiz müşteri anahtarı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }
  const token = tokenParsed.data.token;

  const sessionResult = await pool.query(
    `SELECT s.business_id
     FROM table_sessions s
     INNER JOIN businesses b ON b.id = s.business_id
     WHERE s.id = $1 AND b.is_active = TRUE`,
    [paramsParsed.data.sessionId]
  );
  if (sessionResult.rowCount !== 1) {
    res.status(404).json({ message: 'Adisyon bulunamadı.' });
    return;
  }
  const businessId: string = sessionResult.rows[0].business_id;

  const session = await findActiveSessionById(businessId, paramsParsed.data.sessionId);
  if (!session) {
    res.status(404).json({ message: 'Bu adisyon kapanmış.' });
    return;
  }

  const tableResult = await pool.query(
    `SELECT name FROM tables WHERE id = $1 AND business_id = $2`,
    [session.table_id, businessId]
  );

  const itemsResult = await pool.query(
    `SELECT
       oi.id           AS item_id,
       oi.order_id,
       oi.product_name,
       oi.quantity,
       oi.price_int    AS unit_price_int,
       oi.note,
       oi.is_paid,
       oi.created_at,
       o.status,
       (o.customer_token IS NOT NULL AND o.customer_token = $3) AS is_mine,
       CASE WHEN o.waiter_id IS NOT NULL THEN 'waiter' ELSE 'customer' END AS source
     FROM orders o
     INNER JOIN order_items oi ON oi.order_id = o.id
     WHERE o.session_id = $1 AND o.business_id = $2 AND o.type = 'order'
     ORDER BY oi.created_at ASC`,
    [session.id, businessId, token]
  );

  const items = itemsResult.rows.map((row: any) => ({
    ...row,
    line_total_int: row.unit_price_int * row.quantity
  }));

  // Toplamlar: iptal edilen siparişlerin kalemleri sayılmaz
  const billable = items.filter((i: any) => i.status !== 'cancelled');
  const totalInt = billable.reduce((sum: number, i: any) => sum + i.line_total_int, 0);
  const paidInt = billable.filter((i: any) => i.is_paid).reduce((sum: number, i: any) => sum + i.line_total_int, 0);

  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.status(200).json({
    session_id: session.id,
    table_name: tableResult.rows[0]?.name ?? null,
    opened_at: session.opened_at,
    items,
    total_int: totalInt,
    paid_int: paidInt,
    remaining_int: totalInt - paidInt
  });
});
