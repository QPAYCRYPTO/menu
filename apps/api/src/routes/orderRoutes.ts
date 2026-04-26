// apps/api/src/routes/orderRoutes.ts
// CHANGELOG:
// - GET / sorgusunda oi.note seçiliyor (admin sipariş kartlarında ürün başına not)

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { requireAuth } from '../middleware/auth.js';
import { subscriber, ORDER_CHANNEL, publishOrder } from '../db/redisPubSub.js';
import { incrementSessionTotal, decrementSessionTotal } from '../services/sessionService.js';

const updateOrderSchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'delivered'])
});

const cancelReasonCodes = [
  'customer_cancelled',
  'customer_left',
  'not_claimed',
  'no_payment',
  'wrong_order',
  'out_of_stock',
  'other'
] as const;

const cancelOrderSchema = z.object({
  reason_code: z.enum(cancelReasonCodes),
  reason_text: z.string().max(500).optional()
}).refine(
  (data) => data.reason_code !== 'other' || (data.reason_text !== undefined && data.reason_text.trim().length >= 3),
  { message: "'Diğer' sebebi için açıklama zorunludur (en az 3 karakter).", path: ['reason_text'] }
);

export const orderRoutes = Router();
orderRoutes.use(requireAuth);

// SSE
orderRoutes.get('/stream', (req, res) => {
  const businessId = req.ctx!.businessId!;
  const channel = `${ORDER_CHANNEL}:${businessId}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (res.socket) {
    res.socket.setNoDelay(true);
    res.socket.setKeepAlive(true);
  }

  res.flushHeaders();
  res.write(`: connected at ${Date.now()}\n\n`);

  subscriber.subscribe(channel, (err) => {
    if (err) {
      res.end();
      return;
    }
  });

  const messageHandler = (receivedChannel: string, message: string) => {
    if (receivedChannel === channel) {
      res.write(`event: order\ndata: ${message}\n\n`);
    }
  };

  subscriber.on('message', messageHandler);

  const ping = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15000);

  req.on('close', () => {
    subscriber.off('message', messageHandler);
    clearInterval(ping);
  });
});

// Siparişleri listele - oi.note SELECT'e eklendi
orderRoutes.get('/', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { status } = req.query;

  let query = `
    SELECT 
      o.id, o.table_id, o.table_name, o.status, o.note, o.type, 
      o.call_type,    
      o.created_at, o.delivered_at,
      o.cancelled_at, o.cancel_reason,
      o.waiter_id,
      w.name AS waiter_name,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'price_int', oi.price_int,
            'note', oi.note
          ) ORDER BY oi.created_at
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) as items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN waiters w ON w.id = o.waiter_id
    WHERE o.business_id = $1
  `;

  const params: any[] = [businessId];

  if (status) {
    params.push(status);
    query += ` AND o.status = $${params.length}`;
  } else {
    query += ` AND o.status NOT IN ('delivered', 'cancelled')`;
  }

  query += ` GROUP BY o.id, w.name ORDER BY o.created_at DESC LIMIT 100`;

  const result = await pool.query(query, params);
  res.status(200).json(result.rows);
});

// Sipariş durumunu güncelle
orderRoutes.put('/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { id } = req.params;
  const parsed = updateOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz durum.' });
    return;
  }

  const newStatus = parsed.data.status;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT status, session_id FROM orders 
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [id, businessId]
    );

    if (currentResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Sipariş bulunamadı.' });
      return;
    }

    const currentStatus = currentResult.rows[0].status;
    const sessionId = currentResult.rows[0].session_id;

    if (currentStatus === 'cancelled') {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'İptal edilmiş sipariş güncellenemez.' });
      return;
    }

    let deliveredAtClause: string;
    if (newStatus === 'delivered' && currentStatus !== 'delivered') {
      deliveredAtClause = 'delivered_at = NOW()';
    } else if (currentStatus === 'delivered' && newStatus !== 'delivered') {
      deliveredAtClause = 'delivered_at = NULL';
    } else {
      deliveredAtClause = 'delivered_at = delivered_at';
    }

    const updateResult = await client.query(
      `UPDATE orders 
       SET status = $1, 
           updated_at = NOW(),
           ${deliveredAtClause}
       WHERE id = $2 AND business_id = $3
       RETURNING id, status, table_name, type, delivered_at`,
      [newStatus, id, businessId]
    );

    if (sessionId) {
      const wasDelivered = currentStatus === 'delivered';
      const willBeDelivered = newStatus === 'delivered';

      if (wasDelivered !== willBeDelivered) {
        const totalResult = await client.query(
          `SELECT COALESCE(SUM(quantity * price_int), 0)::int as total 
           FROM order_items WHERE order_id = $1`,
          [id]
        );
        const orderTotal = totalResult.rows[0].total;

        if (willBeDelivered) {
          await incrementSessionTotal(sessionId, orderTotal, client);
        } else if (wasDelivered) {
          await decrementSessionTotal(sessionId, orderTotal, client);
        }
      }
    }

    await client.query('COMMIT');
    res.status(200).json(updateResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Sipariş iptal
orderRoutes.post('/:id/cancel', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const userId = req.ctx!.userId!;
  const { id } = req.params;

  const parsed = cancelOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    res.status(400).json({ message: firstError.message });
    return;
  }

  const { reason_code, reason_text } = parsed.data;

  const finalReason = reason_text && reason_text.trim().length > 0
    ? `${reason_code}: ${reason_text.trim()}`
    : reason_code;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT id, status, session_id, table_name, type FROM orders 
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [id, businessId]
    );

    if (currentResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Sipariş bulunamadı.' });
      return;
    }

    const order = currentResult.rows[0];

    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Bu sipariş zaten iptal edilmiş.' });
      return;
    }

    const wasDelivered = order.status === 'delivered';

    const updateResult = await client.query(
      `UPDATE orders 
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by = $1,
           cancel_reason = $2,
           updated_at = NOW()
       WHERE id = $3 AND business_id = $4
       RETURNING id, status, table_name, type, cancel_reason, cancelled_at`,
      [userId, finalReason, id, businessId]
    );

    if (wasDelivered && order.session_id) {
      const totalResult = await client.query(
        `SELECT COALESCE(SUM(quantity * price_int), 0)::int as total 
         FROM order_items WHERE order_id = $1`,
        [id]
      );
      const orderTotal = totalResult.rows[0].total;

      if (orderTotal > 0) {
        await decrementSessionTotal(order.session_id, orderTotal, client);
      }
    }

    await client.query('COMMIT');

    try {
      await publishOrder(businessId, {
        type: 'order_cancelled',
        order_id: id,
        table_name: order.table_name,
        order_type: order.type,
        reason: finalReason
      });
    } catch {
      // yut
    }

    res.status(200).json({
      message: 'Sipariş iptal edildi.',
      order: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Legacy: Siparişi "kapat"
orderRoutes.delete('/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE orders 
     SET status = 'delivered', delivered_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND business_id = $2 RETURNING id`,
    [id, businessId]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Sipariş bulunamadı.' });
    return;
  }

  res.status(200).json({ message: 'Sipariş kapatıldı.' });
});