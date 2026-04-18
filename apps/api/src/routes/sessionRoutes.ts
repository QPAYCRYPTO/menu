// apps/api/src/routes/sessionRoutes.ts
// Admin tarafı masa oturumu (session) endpoint'leri
// Bu dosya mevcut orderRoutes.ts'e dokunmadan eklenmiştir

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { requireAuth } from '../middleware/auth.js';
import { getSessionWithOrders, closeSession } from '../services/sessionService.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';

export const sessionRoutes = Router();
sessionRoutes.use(requireAuth);

// GET /api/admin/sessions
// Tüm açık masaları listeler (masa bilgisi + sipariş sayısı + adisyon ile)
sessionRoutes.get('/', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const result = await pool.query(`
    SELECT 
      s.id,
      s.table_id,
      s.opened_at,
      s.cached_total_int,
      s.status,
      t.name AS table_name,
      COUNT(o.id) FILTER (WHERE o.type = 'order' AND o.status != 'cancelled') AS order_count,
      COUNT(o.id) FILTER (WHERE o.type = 'order' AND o.status = 'delivered') AS delivered_count,
      COUNT(o.id) FILTER (WHERE o.type = 'order' AND o.status IN ('pending', 'preparing', 'ready')) AS pending_count
    FROM table_sessions s
    INNER JOIN tables t ON t.id = s.table_id
    LEFT JOIN orders o ON o.session_id = s.id
    WHERE s.business_id = $1 AND s.status = 'open'
    GROUP BY s.id, t.name
    ORDER BY s.opened_at DESC
  `, [businessId]);

  res.status(200).json(result.rows);
});

// GET /api/admin/sessions/:id
// Session detayı (siparişler dahil)
sessionRoutes.get('/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { id } = req.params;

  const data = await getSessionWithOrders(id);
  if (!data) {
    throw new AppError('Oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  // Güvenlik: başka işletmenin session'ına bakılamasın
  if (data.session.business_id !== businessId) {
    throw new AppError('Oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  // Masa bilgisini de ekle
  const tableResult = await pool.query(
    `SELECT id, name FROM tables WHERE id = $1`,
    [data.session.table_id]
  );

  res.status(200).json({
    session: data.session,
    table: tableResult.rows[0] ?? null,
    orders: data.orders
  });
});

// POST /api/admin/sessions/:id/close
// Session'ı kapatır (masa kapatma)
// Body: { action?: 'close' | 'transfer' | 'cancel_pending' }
//   - close: sadece kapat (pending siparişler öylece kalır)
//   - transfer: pending siparişleri yeni bir session'a taşı (yeni müşteri için)
//   - cancel_pending: pending siparişleri iptal et, session'ı kapat
const closeSessionSchema = z.object({
  action: z.enum(['close', 'transfer', 'cancel_pending']).default('close')
});

sessionRoutes.post('/:id/close', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const userId = req.ctx!.userId!;
  const { id } = req.params;

  const parsed = closeSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz işlem.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const { action } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Session'ı kilitle ve kontrol et
    const sessionResult = await client.query(
      `SELECT * FROM table_sessions 
       WHERE id = $1 AND business_id = $2 AND status = 'open'
       FOR UPDATE`,
      [id, businessId]
    );

    if (sessionResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      throw new AppError('Açık oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
    }

    const session = sessionResult.rows[0];

    // Pending (delivered olmamış) siparişleri kontrol et
    const pendingResult = await client.query(
      `SELECT id FROM orders 
       WHERE session_id = $1 
         AND type = 'order'
         AND status IN ('pending', 'preparing', 'ready')`,
      [id]
    );

    const pendingCount = pendingResult.rowCount ?? 0;

    // Pending varsa action'a göre davran
    if (pendingCount > 0) {
      if (action === 'close') {
        // Sadece kapatma isteği, ama pending var — hata döndür
        await client.query('ROLLBACK');
        res.status(409).json({
          message: 'Bu masada teslim edilmemiş siparişler var.',
          code: 'PENDING_ORDERS_EXIST',
          pending_count: pendingCount
        });
        return;
      }

      if (action === 'transfer') {
        // Yeni session aç, pending siparişleri taşı
        const newSessionResult = await client.query(
          `INSERT INTO table_sessions (business_id, table_id, status, opened_at, updated_at)
           VALUES ($1, $2, 'open', NOW(), NOW())
           RETURNING id`,
          [businessId, session.table_id]
        );
        const newSessionId = newSessionResult.rows[0].id;

        await client.query(
          `UPDATE orders 
           SET session_id = $1, updated_at = NOW()
           WHERE session_id = $2 
             AND type = 'order'
             AND status IN ('pending', 'preparing', 'ready')`,
          [newSessionId, id]
        );
      } else if (action === 'cancel_pending') {
        // Pending siparişleri iptal et
        await client.query(
          `UPDATE orders 
           SET status = 'cancelled',
               cancelled_at = NOW(),
               cancelled_by = $1,
               cancel_reason = 'Masa kapatılırken iptal edildi',
               updated_at = NOW()
           WHERE session_id = $2 
             AND type = 'order'
             AND status IN ('pending', 'preparing', 'ready')`,
          [userId, id]
        );
      }
    }

    // Session'ı kapat
    const closed = await closeSession(id, userId, client);

    await client.query('COMMIT');
    res.status(200).json({
      session: closed,
      message: 'Masa kapatıldı.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});