// apps/api/src/routes/waiterPublicRoutes.ts
// CHANGELOG v9:
// - GET /calls — aktif çağrıları listele (call_type ile)
// - POST /calls/:id/take — garson çağrıyı üstlenir, status=delivered
// - Garson aldıktan sonra SSE ile herkese 'call_taken' event yayınlanır
// - Admin + diğer garsonların listesinden çağrı kaybolur
// CHANGELOG v10 (defense-in-depth):
// - maybeAutoCloseSession UPDATE table_sessions sorgusuna business_id filtresi eklendi

import { Router } from 'express';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { pool } from '../db/postgres.js';
import { publicMenuRateLimit } from '../middleware/rateLimit.js';
import { requireWaiterAuth } from '../middleware/waiterAuth.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import {
  authenticateWaiterByToken,
  authenticateWaiterByEmail,
  registerSessionTab,
  revokeSessionTab
} from '../services/waiterService.js';
import {
  resolveActiveSession,
  decrementSessionTotal,
  incrementSessionTotal,
  findActiveSession,
  followMergeChain
} from '../services/sessionService.js';
import { publishOrder } from '../db/redisPubSub.js';
import { logWaiterActivity } from '../services/waiterActivityService.js';
import { BREAK_MINUTES, endBreak, getWaiterShiftInfo, recordShiftEvent, startBreak } from '../services/staffService.js';

export const waiterPublicRoutes = Router();

async function maybeAutoCloseSession(
  sessionId: string,
  businessId: string,
  client: PoolClient
): Promise<boolean> {
  const activeOrders = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM orders
     WHERE session_id = $1
       AND business_id = $2
       AND type = 'order'
       AND status != 'cancelled'`,
    [sessionId, businessId]
  );

  if (activeOrders.rows[0].cnt > 0) return false;

  await client.query(
    `UPDATE table_sessions
     SET status = 'closed',
         closed_at = NOW(),
         cached_total_int = 0,
         updated_at = NOW()
     WHERE id = $1 AND business_id = $2 AND status = 'open'`,
    [sessionId, businessId]
  );

  return true;
}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────

const tokenBodySchema = z.object({ token: z.string().min(10).max(200) });
const emailBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(100)
});

waiterPublicRoutes.post('/auth', publicMenuRateLimit, async (req, res) => {
  const parsed = tokenBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await authenticateWaiterByToken(parsed.data.token);
  if (!result.ok) {
    res.status(401).json({ ok: false, reason: result.reason });
    return;
  }

  res.status(200).json({
    ok: true,
    waiter: {
      id: result.waiter.id,
      business_id: result.waiter.business_id,
      name: result.waiter.name,
      title: result.waiter.title,
      permissions: result.waiter.permissions
    },
    session_id: result.session_id
  });
});

waiterPublicRoutes.post('/login', publicMenuRateLimit, async (req, res) => {
  const parsed = emailBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await authenticateWaiterByEmail(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    res.status(401).json({ ok: false, reason: result.reason });
    return;
  }

  res.status(200).json({
    ok: true,
    waiter: {
      id: result.waiter.id,
      business_id: result.waiter.business_id,
      name: result.waiter.name,
      title: result.waiter.title,
      permissions: result.waiter.permissions
    },
    session_id: result.session_id
  });
});

// ─────────────────────────────────────────────────────────────
// PROFİL + MOLA — personel kendi ünvanını, yetkilerini, vardiyasından kalan süreyi görür;
// "mola kullanabilir" yetkisi varsa süre seçip molaya çıkar / döner.
// ─────────────────────────────────────────────────────────────

waiterPublicRoutes.get('/profile', requireWaiterAuth, async (req, res) => {
  const waiter = req.waiter!;
  const shift = await getWaiterShiftInfo(waiter.id, req.waiterSessionId);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    id: waiter.id,
    name: waiter.name,
    title: waiter.title,
    permissions: waiter.permissions,
    break_options: BREAK_MINUTES,
    ...shift
  });
});

const breakStartSchema = z.object({
  minutes: z.number().int().refine(m => (BREAK_MINUTES as readonly number[]).includes(m), 'Geçersiz mola süresi.')
});

waiterPublicRoutes.post('/break/start', requireWaiterAuth, async (req, res) => {
  const waiter = req.waiter!;
  if (!waiter.permissions?.can_use_break) {
    res.status(403).json({ message: 'Mola kullanma yetkiniz yok.', code: 'BREAK_NOT_ALLOWED' });
    return;
  }
  const parsed = breakStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz mola süresi.' });
    return;
  }
  const state = await startBreak(waiter, parsed.data.minutes);
  if (!state) {
    res.status(409).json({ message: 'Zaten moladasınız.', code: 'ALREADY_ON_BREAK' });
    return;
  }
  res.status(200).json(state);
});

waiterPublicRoutes.post('/break/end', requireWaiterAuth, async (req, res) => {
  const waiter = req.waiter!;
  const result = await endBreak(waiter);
  if (!result) {
    res.status(409).json({ message: 'Şu an molada değilsiniz.', code: 'NOT_ON_BREAK' });
    return;
  }
  res.status(200).json({ on_break: false, ...result });
});

// ─────────────────────────────────────────────────────────────
// EXCHANGE — Token + tab_id ile yeni tab kaydı yarat
// ─────────────────────────────────────────────────────────────

const exchangeBodySchema = z.object({
  token: z.string().min(10).max(200),
  tab_id: z.string().uuid()
});

waiterPublicRoutes.post('/exchange', publicMenuRateLimit, async (req, res) => {
  const parsed = exchangeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await registerSessionTab(parsed.data.token, parsed.data.tab_id, {
    user_agent: req.get('user-agent') ?? undefined,
    ip_address: req.ip
  });

  if (!result.ok) {
    res.status(401).json({ ok: false, reason: result.reason });
    return;
  }

  // Oturumun ilk sekmesi → personel servise girdi (sayfa yenileme/yeniden açma sayılmaz)
  // (beklenir: açık kalmış mola temizlensin ki profil ilk okumada doğru görünsün)
  if (result.first_tab) {
    await recordShiftEvent('shift_start', result.waiter).catch(() => {});
  }

  res.status(200).json({
    ok: true,
    waiter: {
      id: result.waiter.id,
      business_id: result.waiter.business_id,
      name: result.waiter.name,
      title: result.waiter.title,
      permissions: result.waiter.permissions
    },
    session_id: result.session_id
  });
});

// ─────────────────────────────────────────────────────────────
// LOGOUT — Tab'ı revoke et
// ─────────────────────────────────────────────────────────────

const logoutBodySchema = z.object({
  tab_id: z.string().uuid()
});

waiterPublicRoutes.post('/logout', async (req, res) => {
  const parsed = logoutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false });
    return;
  }

  const revoked = await revokeSessionTab(parsed.data.tab_id);
  // Son açık sekmesi de kapandıysa personel servisten çıktı
  if (revoked.revoked && revoked.last_tab) {
    recordShiftEvent('shift_end', revoked.waiter).catch(() => {});
  }
  res.status(200).json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// TABLES
// ─────────────────────────────────────────────────────────────

waiterPublicRoutes.get('/tables', requireWaiterAuth, async (req, res) => {
  const businessId = req.waiter!.business_id;

  const result = await pool.query(`
    SELECT
      t.id, t.name, t.sort_order, t.is_active,
      s.id AS session_id, s.opened_at, s.cached_total_int,
      s.merge_group_id,
      (SELECT COUNT(*) FROM orders o
       WHERE o.table_id = t.id AND o.type = 'call' AND o.status = 'pending'
      ) AS active_calls,
      (SELECT COUNT(*) FROM orders o2
       WHERE o2.session_id = s.id
         AND o2.status NOT IN ('cancelled')
         AND o2.type = 'order'
      ) AS order_count
    FROM tables t
    LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status = 'open'
    WHERE t.business_id = $1 AND t.is_active = TRUE
    ORDER BY t.sort_order ASC, t.name ASC
  `, [businessId]);

  // Kendi open session'ı olmayan masalar birleştirilmiş olabilir → zinciri izle.
  // Tüm open/merged session'lar tek sorguda alınır, zincir bellekte çözülür (N+1 yok).
  const sessionsResult = await pool.query(
    `SELECT id, table_id, status, merged_into_session_id, merge_group_id, opened_at, closed_at
     FROM table_sessions
     WHERE business_id = $1 AND status IN ('open', 'merged')
     ORDER BY closed_at DESC NULLS LAST`,
    [businessId]
  );
  const sessionsById = new Map<string, any>(sessionsResult.rows.map((s: any) => [s.id, s]));

  const rows = await Promise.all(result.rows.map(async row => {
    if (row.session_id) {
      return row;
    }
    for (const merged of sessionsResult.rows.filter((s: any) => s.table_id === row.id && s.status === 'merged')) {
      const active = await followMergeChain(merged, (id) => sessionsById.get(id) ?? null);
      if (active) {
        // Siparişler hedef session'da; toplam/sayı hedef masada gösterilir (grup kartında çift sayılmasın)
        return {
          ...row,
          session_id: active.id,
          opened_at: active.opened_at,
          merge_group_id: active.merge_group_id,
          cached_total_int: 0,
          order_count: 0
        };
      }
    }
    return row;
  }));

  res.status(200).json(rows.map(row => ({
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    session_id: row.session_id,
    opened_at: row.opened_at,
    total_int: row.cached_total_int ?? 0,
    active_calls: Number(row.active_calls) || 0,
    order_count: Number(row.order_count) || 0,
    has_active_session: !!row.session_id,
    merge_group_id: row.merge_group_id ?? null
  })));
});

const tableIdParams = z.object({ table_id: z.string().uuid() });

waiterPublicRoutes.get('/tables/:table_id', requireWaiterAuth, async (req, res) => {
  const parsed = tableIdParams.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz masa id.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const businessId = req.waiter!.business_id;
  const tableId = parsed.data.table_id;

  const tableResult = await pool.query(
    `SELECT id, name, sort_order FROM tables
     WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
    [tableId, businessId]
  );

  if (tableResult.rowCount !== 1) {
    res.status(404).json({ message: 'Masa bulunamadı.' });
    return;
  }

  const table = tableResult.rows[0];

  // Birleşik masa ise zincirin sonundaki açık session (hedef masanın adisyonu)
  const session = await findActiveSession(businessId, tableId);

  let orders: any[] = [];
  if (session) {
    const ordersResult = await pool.query(`
      SELECT
        o.id, o.status, o.note, o.created_at, o.waiter_id,
        w.name AS waiter_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'product_name', oi.product_name,
              'quantity', oi.quantity,
              'price_int', oi.price_int,
              'note', oi.note,
              'waiter_id', oi.waiter_id
            ) ORDER BY oi.created_at
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN waiters w ON w.id = o.waiter_id
      WHERE o.session_id = $1
        AND o.type = 'order'
        AND o.status != 'cancelled'
      GROUP BY o.id, w.name
      ORDER BY o.created_at ASC
    `, [session.id]);
    orders = ordersResult.rows;
  }

  const callsResult = await pool.query(
    `SELECT id, note, call_type, created_at FROM orders
     WHERE table_id = $1 AND business_id = $2
       AND type = 'call' AND status = 'pending'
     ORDER BY created_at DESC`,
    [tableId, businessId]
  );

  res.status(200).json({
    table: {
      id: table.id,
      name: table.name,
      sort_order: table.sort_order
    },
    session: session ? {
      id: session.id,
      opened_at: session.opened_at,
      total_int: session.cached_total_int
    } : null,
    orders,
    active_calls: callsResult.rows
  });
});

// ─────────────────────────────────────────────────────────────
// ÇAĞRILAR — TÜM AKTİF ÇAĞRILAR (paylaşımlı kuyruk)
// ─────────────────────────────────────────────────────────────

/**
 * Aktif çağrıları listeler — call_type ile birlikte.
 * Tüm garsonlar aynı listeyi görür (paylaşımlı kuyruk).
 * Yalnızca status='pending' ve type='call' kayıtları döner.
 */
waiterPublicRoutes.get('/calls', requireWaiterAuth, async (req, res) => {
  const businessId = req.waiter!.business_id;

  const result = await pool.query(
    `SELECT
       o.id, o.table_id, o.table_name, o.note, o.call_type,
       o.created_at, o.status
     FROM orders o
     WHERE o.business_id = $1
       AND o.type = 'call'
       AND o.status = 'pending'
     ORDER BY o.created_at ASC`,
    [businessId]
  );

  res.status(200).json(result.rows);
});

/**
 * Garson çağrıyı üstleniyor.
 * Çağrı status='delivered' yapılır, kim aldığı log'a yazılır.
 * SSE 'call_taken' event'i ile admin + diğer garsonlara duyurulur.
 */
const callIdParams = z.object({ call_id: z.string().uuid() });

waiterPublicRoutes.post('/calls/:call_id/take', requireWaiterAuth, async (req, res) => {
  const parsed = callIdParams.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz çağrı id.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const waiter = req.waiter!;
  const businessId = waiter.business_id;
  const callId = parsed.data.call_id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const callResult = await client.query(
      `SELECT id, table_name, status, type, call_type, note
       FROM orders
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [callId, businessId]
    );

    if (callResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Çağrı bulunamadı.' });
      return;
    }

    const call = callResult.rows[0];

    if (call.type !== 'call') {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Bu kayıt bir çağrı değil.' });
      return;
    }

    if (call.status !== 'pending') {
      await client.query('ROLLBACK');
      res.status(409).json({
        message: 'Bu çağrı başka bir garson tarafından zaten alındı.'
      });
      return;
    }

    // Çağrıyı kapat — delivered + waiter_id kim aldıysa
    await client.query(
      `UPDATE orders
       SET status = 'delivered',
           delivered_at = NOW(),
           waiter_id = $1,
           updated_at = NOW()
       WHERE id = $2 AND business_id = $3`,
      [waiter.id, callId, businessId]
    );

    await logWaiterActivity({
      businessId,
      waiterId: waiter.id,
      waiterName: waiter.name,
      action: 'call_answered',
      targetType: 'order',
      targetId: callId,
      targetName: `${call.table_name} - ${call.call_type ?? 'çağrı'}`,
      metadata: {
        table_name: call.table_name,
        call_type: call.call_type,
        note: call.note
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }, client);

    await client.query('COMMIT');

    // Herkese duyur — bu çağrı artık alındı
    await publishOrder(businessId, {
      type: 'call_taken',
      order_id: callId,
      table_name: call.table_name,
      call_type: call.call_type,
      taken_by_waiter_id: waiter.id,
      taken_by_waiter_name: waiter.name
    });

    res.status(200).json({
      message: 'Çağrı alındı.',
      call_id: callId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// HAZIR SİPARİŞLER — mutfak (veya admin) "hazır" dedi, garson masaya teslim eder
// ─────────────────────────────────────────────────────────────

/**
 * Teslim bekleyen (status='ready') siparişler — çağrılar gibi tüm garsonların
 * paylaştığı kuyruk. Garson "Teslim Edildi" deyince listeden düşer.
 */
waiterPublicRoutes.get('/ready-orders', requireWaiterAuth, async (req, res) => {
  const businessId = req.waiter!.business_id;

  const result = await pool.query(
    `SELECT
       o.id, o.table_id, o.table_name, o.note, o.created_at,
       o.updated_at AS ready_at,
       COALESCE(
         json_agg(
           json_build_object('product_name', oi.product_name, 'quantity', oi.quantity, 'note', oi.note)
           ORDER BY oi.created_at
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'
       ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = $1
       AND o.type = 'order'
       AND o.status = 'ready'
     GROUP BY o.id
     ORDER BY o.updated_at ASC`,
    [businessId]
  );

  res.status(200).json(result.rows);
});

const deliverOrderParams = z.object({ order_id: z.string().uuid() });

/**
 * Garson hazır siparişi masaya teslim etti → status='delivered'.
 * Admin'in teslim akışıyla aynı: masa oturumunun tutarı bu anda artar.
 * SSE 'order_status' (delivered) ile admin ve diğer garsonlara duyurulur.
 */
waiterPublicRoutes.post('/orders/:order_id/deliver', requireWaiterAuth, async (req, res) => {
  const parsed = deliverOrderParams.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz sipariş id.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const waiter = req.waiter!;
  const businessId = waiter.business_id;
  const orderId = parsed.data.order_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT id, table_id, table_name, status, type, session_id
       FROM orders
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [orderId, businessId]
    );

    if (orderResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Sipariş bulunamadı.' });
      return;
    }

    const order = orderResult.rows[0];

    if (order.type !== 'order') {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Bu kayıt bir sipariş değil.' });
      return;
    }

    if (order.status !== 'ready') {
      await client.query('ROLLBACK');
      res.status(409).json({
        message: order.status === 'delivered'
          ? 'Bu sipariş zaten teslim edildi.'
          : 'Sipariş henüz hazır değil veya iptal edildi.'
      });
      return;
    }

    await client.query(
      `UPDATE orders
       SET status = 'delivered', delivered_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND business_id = $2`,
      [orderId, businessId]
    );

    // Admin PUT /orders/:id ile aynı kural: teslim anında oturum tutarına eklenir
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(quantity * price_int), 0)::int AS total
       FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const orderTotal: number = totalResult.rows[0].total;
    if (order.session_id && orderTotal > 0) {
      await incrementSessionTotal(order.session_id, orderTotal, client);
    }

    await logWaiterActivity({
      businessId,
      waiterId: waiter.id,
      waiterName: waiter.name,
      action: 'order_delivered',
      targetType: 'order',
      targetId: orderId,
      targetName: order.table_name,
      metadata: { table_name: order.table_name, total_int: orderTotal },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }, client);

    await client.query('COMMIT');

    try {
      await publishOrder(businessId, {
        type: 'order_status',
        order_id: orderId,
        order_type: 'order',
        status: 'delivered',
        table_id: order.table_id,
        table_name: order.table_name,
        delivered_by_waiter_id: waiter.id,
        delivered_by_waiter_name: waiter.name
      });
    } catch {
      // yayın hatası isteği etkilemesin
    }

    res.status(200).json({ message: 'Sipariş teslim edildi.', order_id: orderId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// GARSON SSE STREAM — yeni çağrı ve call_taken event'leri için
// ─────────────────────────────────────────────────────────────

waiterPublicRoutes.get('/stream', requireWaiterAuth, async (req, res) => {
  const { subscriber, ORDER_CHANNEL, subscribeChannel, unsubscribeChannel } = await import('../db/redisPubSub.js');
  const businessId = req.waiter!.business_id;
  const channel = `${ORDER_CHANNEL}:${businessId}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (res.socket) {
    res.socket.setNoDelay(true);
    res.socket.setKeepAlive(true);
  }

  res.flushHeaders();
  res.write(`: connected at ${Date.now()}\n\n`);

  subscribeChannel(channel, (err) => {
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
    unsubscribeChannel(channel);
    clearInterval(ping);
  });
});

// ─────────────────────────────────────────────────────────────
// MENÜ
// ─────────────────────────────────────────────────────────────

waiterPublicRoutes.get('/menu', requireWaiterAuth, async (req, res) => {
  const businessId = req.waiter!.business_id;

  const categoriesResult = await pool.query(
    `SELECT id, name, sort_order FROM categories
     WHERE business_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, name ASC`,
    [businessId]
  );

  const productsResult = await pool.query(
    `SELECT id, category_id, name, description, price_int, image_url, is_active, sort_order
     FROM products
     WHERE business_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, name ASC`,
    [businessId]
  );

  res.status(200).json({
    categories: categoriesResult.rows,
    products: productsResult.rows
  });
});

// ─────────────────────────────────────────────────────────────
// SİPARİŞLER
// ─────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
    note: z.string().max(300).optional()
  })).min(1).max(30)
});

waiterPublicRoutes.post('/tables/:table_id/orders', requireWaiterAuth, async (req, res) => {
  const paramsParsed = tableIdParams.safeParse(req.params);
  const bodyParsed = createOrderSchema.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const waiter = req.waiter!;
  const businessId = waiter.business_id;
  const tableId = paramsParsed.data.table_id;

  const tableResult = await pool.query(
    `SELECT id, name FROM tables WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
    [tableId, businessId]
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

  let createdAt = '';
  let orderId = '';
  let totalInt = 0;

  try {
    await client.query('BEGIN');

    const session = await resolveActiveSession(businessId, table.id, client);

    const orderResult = await client.query(
      `INSERT INTO orders
         (id, business_id, table_id, table_name, status, note, type, session_id, waiter_id, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, 'pending', $4, 'order', $5, $6, NOW(), NOW())
       RETURNING id, created_at`,
      [businessId, table.id, table.name, bodyParsed.data.note ?? null, session.id, waiter.id]
    );

    orderId = orderResult.rows[0].id;
    createdAt = orderResult.rows[0].created_at;

    for (const item of bodyParsed.data.items) {
      const productResult = await client.query(
        `SELECT id, name, price_int FROM products
         WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
        [item.product_id, businessId]
      );

      if (productResult.rowCount !== 1) continue;

      const product = productResult.rows[0];
      const itemNote = item.note?.trim() || null;

      const itemResult = await client.query(
        `INSERT INTO order_items
           (id, order_id, product_id, product_name, quantity, price_int, note, waiter_id, created_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id`,
        [orderId, product.id, product.name, item.quantity, product.price_int, itemNote, waiter.id]
      );

      orderItems.push({
        id: itemResult.rows[0].id,
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        price_int: product.price_int,
        note: itemNote
      });

      totalInt += product.price_int * item.quantity;
    }

    await logWaiterActivity({
      businessId,
      waiterId: waiter.id,
      waiterName: waiter.name,
      action: 'order_added',
      targetType: 'order',
      targetId: orderId,
      targetName: `${table.name} - ${orderItems.length} ürün`,
      metadata: {
        table_name: table.name,
        table_id: table.id,
        total_int: totalInt,
        item_count: orderItems.length,
        items: orderItems.map(i => ({
          product_name: i.product_name,
          quantity: i.quantity,
          note: i.note
        }))
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }, client);

    await client.query('COMMIT');

    await publishOrder(businessId, {
      type: 'new_order',
      order_id: orderId,
      table_name: table.name,
      order_type: 'order',
      order: {
        id: orderId,
        table_id: table.id,
        table_name: table.name,
        status: 'pending',
        note: bodyParsed.data.note ?? null,
        type: 'order',
        created_at: createdAt,
        waiter_id: waiter.id,
        waiter_name: waiter.name,
        items: orderItems
      }
    });

    res.status(201).json({
      order_id: orderId,
      message: 'Sipariş alındı.',
      total_int: totalInt,
      item_count: orderItems.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

const orderIdParams = z.object({ order_id: z.string().uuid() });

const addItemsSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
    note: z.string().max(300).optional()
  })).min(1).max(30)
});

waiterPublicRoutes.post('/orders/:order_id/items', requireWaiterAuth, async (req, res) => {
  const paramsParsed = orderIdParams.safeParse(req.params);
  const bodyParsed = addItemsSchema.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const waiter = req.waiter!;
  const businessId = waiter.business_id;
  const orderId = paramsParsed.data.order_id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT id, table_id, table_name, status, session_id FROM orders
       WHERE id = $1 AND business_id = $2`,
      [orderId, businessId]
    );

    if (orderResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Sipariş bulunamadı.' });
      return;
    }

    const order = orderResult.rows[0];

    if (['cancelled', 'delivered'].includes(order.status)) {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Kapanmış siparişe ürün eklenemez.' });
      return;
    }

    const addedItems: Array<{
      product_name: string;
      quantity: number;
      price_int: number;
      note: string | null;
    }> = [];
    let addedTotal = 0;

    for (const item of bodyParsed.data.items) {
      const productResult = await client.query(
        `SELECT id, name, price_int FROM products
         WHERE id = $1 AND business_id = $2 AND is_active = TRUE`,
        [item.product_id, businessId]
      );

      if (productResult.rowCount !== 1) continue;

      const product = productResult.rows[0];
      const itemNote = item.note?.trim() || null;

      await client.query(
        `INSERT INTO order_items
           (id, order_id, product_id, product_name, quantity, price_int, note, waiter_id, created_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())`,
        [orderId, product.id, product.name, item.quantity, product.price_int, itemNote, waiter.id]
      );

      addedItems.push({
        product_name: product.name,
        quantity: item.quantity,
        price_int: product.price_int,
        note: itemNote
      });
      addedTotal += product.price_int * item.quantity;
    }

    await logWaiterActivity({
      businessId,
      waiterId: waiter.id,
      waiterName: waiter.name,
      action: 'item_added',
      targetType: 'order',
      targetId: orderId,
      targetName: `${order.table_name}`,
      metadata: {
        table_name: order.table_name,
        added_items: addedItems,
        added_total_int: addedTotal
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }, client);

    await client.query('COMMIT');

    await publishOrder(businessId, {
      type: 'order_items_added',
      order_id: orderId,
      table_name: order.table_name,
      waiter_name: waiter.name,
      changes: addedItems.map(i => ({
        action: 'added',
        product_name: i.product_name,
        quantity: i.quantity,
        note: i.note
      }))
    });

    res.status(200).json({ message: 'Ürünler eklendi.', added_count: addedItems.length });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

const itemIdParams = z.object({ item_id: z.string().uuid() });

const updateItemSchema = z.object({
  quantity: z.number().int().min(1).max(99)
});

waiterPublicRoutes.patch('/order-items/:item_id', requireWaiterAuth, async (req, res) => {
  const paramsParsed = itemIdParams.safeParse(req.params);
  const bodyParsed = updateItemSchema.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const waiter = req.waiter!;
  const businessId = waiter.business_id;
  const itemId = paramsParsed.data.item_id;
  const newQuantity = bodyParsed.data.quantity;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const itemResult = await client.query(
      `SELECT oi.id, oi.quantity, oi.product_name, oi.price_int,
              o.id AS order_id, o.status AS order_status, o.table_name,
              o.business_id, o.session_id
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE oi.id = $1 AND o.business_id = $2`,
      [itemId, businessId]
    );

    if (itemResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Ürün bulunamadı.' });
      return;
    }

    const item = itemResult.rows[0];
    const oldQuantity = item.quantity;

    if (['cancelled', 'delivered'].includes(item.order_status)) {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Kapanmış siparişte değişiklik yapılamaz.' });
      return;
    }

    await client.query(
      `UPDATE order_items SET quantity = $1 WHERE id = $2`,
      [newQuantity, itemId]
    );

    await logWaiterActivity({
      businessId,
      waiterId: waiter.id,
      waiterName: waiter.name,
      action: 'item_quantity_changed',
      targetType: 'order_item',
      targetId: itemId,
      targetName: `${item.table_name} - ${item.product_name}`,
      metadata: {
        table_name: item.table_name,
        product_name: item.product_name,
        old_quantity: oldQuantity,
        new_quantity: newQuantity,
        price_int: item.price_int,
        delta_int: (newQuantity - oldQuantity) * item.price_int
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }, client);

    await client.query('COMMIT');

    await publishOrder(businessId, {
      type: 'order_items_updated',
      order_id: item.order_id,
      table_name: item.table_name,
      waiter_name: waiter.name,
      changes: [{
        action: 'quantity_changed',
        product_name: item.product_name,
        old_quantity: oldQuantity,
        new_quantity: newQuantity
      }]
    });

    res.status(200).json({ message: 'Adet güncellendi.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// SİPARİŞ İPTAL
// ─────────────────────────────────────────────────────────────

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

waiterPublicRoutes.post('/orders/:order_id/cancel', requireWaiterAuth, async (req, res) => {
  const paramsParsed = orderIdParams.safeParse(req.params);
  const bodyParsed = cancelOrderSchema.safeParse(req.body);

  if (!paramsParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  if (!bodyParsed.success) {
    const firstError = bodyParsed.error.issues[0];
    res.status(400).json({ message: firstError.message });
    return;
  }

  const waiter = req.waiter!;
  const businessId = waiter.business_id;
  const orderId = paramsParsed.data.order_id;

  if (!waiter.permissions.can_delete_items) {
    res.status(403).json({ message: 'Sipariş iptal yetkiniz yok.' });
    return;
  }

  const { reason_code, reason_text } = bodyParsed.data;

  const finalReason = reason_text && reason_text.trim().length > 0
    ? `${reason_code}: ${reason_text.trim()}`
    : reason_code;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT id, status, session_id, table_name, type
       FROM orders
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [orderId, businessId]
    );

    if (orderResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Sipariş bulunamadı.' });
      return;
    }

    const order = orderResult.rows[0];

    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Bu sipariş zaten iptal edilmiş.' });
      return;
    }

    if (order.status === 'delivered') {
      await client.query('ROLLBACK');
      res.status(403).json({
        message: 'Teslim edilmiş sipariş artık adisyona yansımıştır. İptal işlemi kasa/admin tarafından yapılır.'
      });
      return;
    }

    await client.query(
      `UPDATE orders
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancel_reason = $1,
           updated_at = NOW()
       WHERE id = $2 AND business_id = $3`,
      [finalReason, orderId, businessId]
    );

    await logWaiterActivity({
      businessId,
      waiterId: waiter.id,
      waiterName: waiter.name,
      action: 'item_deleted',
      targetType: 'order',
      targetId: orderId,
      targetName: `${order.table_name} - Sipariş iptal`,
      metadata: {
        table_name: order.table_name,
        reason_code,
        reason_text: reason_text ?? null,
        full_reason: finalReason,
        previous_status: order.status
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }, client);

    let sessionAutoClosed = false;
    if (order.session_id) {
      sessionAutoClosed = await maybeAutoCloseSession(order.session_id, businessId, client);
    }

    await client.query('COMMIT');

    await publishOrder(businessId, {
      type: 'order_cancelled',
      order_id: orderId,
      table_name: order.table_name,
      order_type: order.type,
      reason: finalReason
    });

    res.status(200).json({
      message: 'Sipariş iptal edildi.',
      session_auto_closed: sessionAutoClosed
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});