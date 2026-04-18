// apps/api/src/routes/customerOrderRoutes.ts
// Müşteri tarafı public endpoint'ler
// Bu dosya mevcut orderRoutes.ts ve publicRoutes.ts'e dokunmadan eklenmiştir

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { publicMenuRateLimit } from '../middleware/rateLimit.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';

export const customerOrderRoutes = Router();

const paramsSchema = z.object({
  slug: z.string().min(1).max(120),
  table_id: z.string().uuid()
});

const querySchema = z.object({
  token: z.string().min(10).max(100)
});

// GET /api/public/table/:slug/:table_id
// Masa bilgisini döner (masa adı) — public menü header'ında göstermek için
customerOrderRoutes.get('/table/:slug/:table_id', publicMenuRateLimit, async (req, res) => {
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const { slug, table_id } = parsed.data;

  const result = await pool.query(`
    SELECT t.id, t.name
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

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json(result.rows[0]);
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