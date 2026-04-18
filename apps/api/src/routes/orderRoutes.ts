// apps/api/src/routes/orderRoutes.ts
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { requireAuth } from '../middleware/auth.js';
import { subscriber, ORDER_CHANNEL } from '../db/redisPubSub.js';

const updateOrderSchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'delivered'])
});

export const orderRoutes = Router();
orderRoutes.use(requireAuth);

// SSE endpoint — Redis'i dinler
orderRoutes.get('/stream', (req, res) => {
  const businessId = req.ctx!.businessId!;
  const channel = `${ORDER_CHANNEL}:${businessId}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Redis kanalını dinle
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

  // Ping — bağlantı canlı kalsın
  const ping = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 30000);

  // Bağlantı kesilince temizle
  req.on('close', () => {
    subscriber.unsubscribe(channel);
    subscriber.off('message', messageHandler);
    clearInterval(ping);
  });
});

// Siparişleri listele
orderRoutes.get('/', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { status } = req.query;

  let query = `
    SELECT 
      o.id, o.table_id, o.table_name, o.status, o.note, o.type, o.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
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
  `;

  const params: any[] = [businessId];

  if (status) {
    params.push(status);
    query += ` AND o.status = $${params.length}`;
  } else {
    query += ` AND o.status != 'delivered'`;
  }

  query += ` GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100`;

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

  const result = await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW()
     WHERE id = $2 AND business_id = $3
     RETURNING id, status, table_name, type`,
    [parsed.data.status, id, businessId]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Sipariş bulunamadı.' });
    return;
  }

  res.status(200).json(result.rows[0]);
});

// Siparişi kapat
orderRoutes.delete('/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE orders SET status = 'delivered', updated_at = NOW()
     WHERE id = $1 AND business_id = $2 RETURNING id`,
    [id, businessId]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Sipariş bulunamadı.' });
    return;
  }

  res.status(200).json({ message: 'Sipariş kapatıldı.' });
});