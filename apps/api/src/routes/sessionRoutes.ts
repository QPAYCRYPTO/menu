// apps/api/src/routes/sessionRoutes.ts
// Admin tarafı masa oturumu (session) endpoint'leri
// Bu dosya mevcut orderRoutes.ts'e dokunmadan eklenmiştir

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { requireAuth } from '../middleware/auth.js';
import { getSessionWithOrders } from '../services/sessionService.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';

export const sessionRoutes = Router();
sessionRoutes.use(requireAuth);

// GET /api/admin/sessions
// Tüm açık masaları listeler
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

    // Pending (delivered/cancelled olmamış) siparişleri kontrol et
    const pendingResult = await client.query(
      `SELECT id FROM orders 
       WHERE session_id = $1 
         AND type = 'order'
         AND status IN ('pending', 'preparing', 'ready')`,
      [id]
    );

    const pendingCount = pendingResult.rowCount ?? 0;
    const pendingIds = pendingResult.rows.map((r: any) => r.id);

    // Pending varsa action'a göre davran
    if (pendingCount > 0) {
      if (action === 'close') {
        await client.query('ROLLBACK');
        res.status(409).json({
          message: 'Bu masada teslim edilmemiş siparişler var.',
          code: 'PENDING_ORDERS_EXIST',
          pending_count: pendingCount
        });
        return;
      }

      if (action === 'transfer') {
        // ÖNEMLİ SIRA:
        // 1) ÖNCE eski session'ı kapat (unique index serbestleşsin)
        // 2) SONRA yeni session aç
        // 3) Pending siparişleri yeni session'a taşı

        // 1) Eski session'ı kapat
        await client.query(
          `UPDATE table_sessions 
           SET status = 'closed', 
               closed_at = NOW(), 
               closed_by = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [id, userId]
        );

        // 2) Yeni session aç (aynı masa, artık unique constraint serbest)
        const newSessionResult = await client.query(
          `INSERT INTO table_sessions (business_id, table_id, status, opened_at, updated_at)
           VALUES ($1, $2, 'open', NOW(), NOW())
           RETURNING *`,
          [businessId, session.table_id]
        );
        const newSession = newSessionResult.rows[0];

        // 3) Pending siparişleri yeni session'a taşı
        if (pendingIds.length > 0) {
          await client.query(
            `UPDATE orders 
             SET session_id = $1, updated_at = NOW()
             WHERE id = ANY($2::uuid[])`,
            [newSession.id, pendingIds]
          );
        }

        await client.query('COMMIT');

        res.status(200).json({
          message: 'Masa kapatıldı, bekleyen siparişler yeni oturuma taşındı.',
          closed_session: { id, status: 'closed' },
          new_session: newSession
        });
        return;
      }

      if (action === 'cancel_pending') {
        // Pending siparişleri iptal et, sonra session'ı kapat
        await client.query(
          `UPDATE orders 
           SET status = 'cancelled',
               cancelled_at = NOW(),
               cancelled_by = $1,
               cancel_reason = 'Masa kapatılırken iptal edildi',
               updated_at = NOW()
           WHERE id = ANY($2::uuid[])`,
          [userId, pendingIds]
        );

        await client.query(
          `UPDATE table_sessions 
           SET status = 'closed', 
               closed_at = NOW(), 
               closed_by = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [id, userId]
        );

        await client.query('COMMIT');

        res.status(200).json({
          message: 'Bekleyen siparişler iptal edildi ve masa kapatıldı.',
          closed_session: { id, status: 'closed' }
        });
        return;
      }
    }

    // Pending yoksa (veya action='close' ve pending=0) — direkt kapat
    await client.query(
      `UPDATE table_sessions 
       SET status = 'closed', 
           closed_at = NOW(), 
           closed_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, userId]
    );

    await client.query('COMMIT');

    res.status(200).json({
      message: 'Masa kapatıldı.',
      closed_session: { id, status: 'closed' }
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
});