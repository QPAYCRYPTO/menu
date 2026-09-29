// apps/api/src/routes/kitchenRoutes.ts
// Mutfak ekranı API'si — /api/kitchen
//
// Admin/owner (JWT):
//   GET  /token                    → aktif mutfak linki token'ı (yoksa null)
//   POST /token                    → yeni token üret, eskisini geçersiz kıl
// Mutfak ekranı (link token'ı: ?t=<token> veya X-Kitchen-Token başlığı):
//   GET   /orders                  → bekleyen + hazırlanan siparişler
//   PATCH /orders/:id/ready        → "Hazırlandı" (garson/admin ekranlarına canlı olay gider)
//   GET   /stream                  → SSE: işletmenin canlı olay kanalı (yalnızca mutfağı ilgilendiren olaylar)
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ORDER_CHANNEL, publishOrder, subscribeChannel, subscriber, unsubscribeChannel } from '../db/redisPubSub.js';
import {
  getActiveKitchenToken,
  isKitchenModuleEnabled,
  listKitchenOrders,
  markKitchenOrderReady,
  resolveKitchenToken,
  rotateKitchenToken
} from '../services/kitchenService.js';

export const kitchenRoutes = Router();

// ─────────────────────────────────────────────────────────────
// Admin / owner: link token'ı
// ─────────────────────────────────────────────────────────────

const requireKitchenAdmin = [requireAuth, requireRole('admin', 'owner')];

async function assertModuleEnabled(req: Request, res: Response): Promise<string | null> {
  const businessId = req.ctx?.businessId;
  if (!businessId) {
    res.status(403).json({ message: 'İşletme bulunamadı.' });
    return null;
  }
  if (!(await isKitchenModuleEnabled(businessId))) {
    res.status(403).json({ message: 'Mutfak modülü bu işletme için kapalı.', code: 'KITCHEN_MODULE_DISABLED' });
    return null;
  }
  return businessId;
}

kitchenRoutes.get('/token', ...requireKitchenAdmin, async (req, res) => {
  const businessId = await assertModuleEnabled(req, res);
  if (!businessId) return;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ token: await getActiveKitchenToken(businessId) });
});

kitchenRoutes.post('/token', ...requireKitchenAdmin, async (req, res) => {
  const businessId = await assertModuleEnabled(req, res);
  if (!businessId) return;
  const token = await rotateKitchenToken(businessId);
  // Eski linkle açık mutfak ekranları bağlantıyı kapatsın
  publishOrder(businessId, { type: 'kitchen_token_rotated' }).catch(() => {});
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ token });
});

// ─────────────────────────────────────────────────────────────
// Mutfak ekranı: link token'ı ile
// ─────────────────────────────────────────────────────────────

function readKitchenToken(req: Request): string {
  const fromQuery = typeof req.query.t === 'string' ? req.query.t : '';
  const fromHeader = req.get('X-Kitchen-Token') ?? '';
  return (fromQuery || fromHeader).trim().toLowerCase();
}

async function requireKitchenToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const kitchen = await resolveKitchenToken(readKitchenToken(req));
  if (!kitchen) {
    res.status(401).json({ message: 'Geçersiz link, yöneticinizle iletişime geçin.', code: 'KITCHEN_TOKEN_INVALID' });
    return;
  }
  res.locals.kitchen = kitchen;
  next();
}

function kitchenOf(res: Response): { businessId: string; businessName: string } {
  return res.locals.kitchen;
}

kitchenRoutes.get('/orders', requireKitchenToken, async (_req, res) => {
  const { businessId, businessName } = kitchenOf(res);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ business_name: businessName, orders: await listKitchenOrders(businessId) });
});

kitchenRoutes.patch('/orders/:id/ready', requireKitchenToken, async (req, res) => {
  const idParsed = z.string().uuid().safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ message: 'Geçersiz sipariş id.' });
    return;
  }
  const { businessId } = kitchenOf(res);
  const updated = await markKitchenOrderReady(businessId, idParsed.data);
  if (!updated) {
    res.status(409).json({ message: 'Sipariş bulunamadı veya zaten hazır.', code: 'ORDER_NOT_PENDING' });
    return;
  }

  try {
    // Garson ekranları: "hazır" bildirimi; admin/müşteri ekranları: genel durum olayı
    await publishOrder(businessId, {
      type: 'kitchen_order_ready',
      order_id: updated.id,
      table_id: updated.table_id,
      table_name: updated.table_name,
      items: updated.items
    });
    await publishOrder(businessId, {
      type: 'order_status',
      order_id: updated.id,
      order_type: 'order',
      status: 'ready',
      table_id: updated.table_id,
      table_name: updated.table_name
    });
  } catch {
    // yayın hatası isteği etkilemesin
  }

  res.status(200).json({ ok: true, order_id: updated.id, status: 'ready' });
});

/** Mutfak ekranının yeniden yüklenmesini gerektiren olaylar */
const KITCHEN_EVENT_TYPES = new Set([
  'new_order',
  'order_status',
  'order_cancelled',
  'order_items_added',
  'order_items_updated',
  'kitchen_order_ready',
  'kitchen_token_rotated',
  'tables_changed'
]);

kitchenRoutes.get('/stream', requireKitchenToken, (req, res) => {
  const { businessId } = kitchenOf(res);
  const token = readKitchenToken(req);
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

  let closed = false;
  let ping: NodeJS.Timeout | undefined;
  let messageHandler: (receivedChannel: string, message: string) => void = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    subscriber.off('message', messageHandler);
    unsubscribeChannel(channel);
    if (ping) clearInterval(ping);
    res.end();
  };

  // Yalnızca mutfağı ilgilendiren olaylar, en az veriyle iletilir (mutfak her olayda listeyi yeniden çeker)
  messageHandler = (receivedChannel: string, message: string) => {
    if (receivedChannel !== channel) return;
    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    if (!KITCHEN_EVENT_TYPES.has(data?.type)) return;
    if (data.type === 'new_order' && data.order_type !== 'order') return;
    if (data.type === 'kitchen_token_rotated') {
      // Yalnızca eski linkle açık ekranlar kapanır; yeni token'la bağlananlar etkilenmez
      resolveKitchenToken(token).then(still => {
        if (!still && !closed) {
          res.write(`event: revoked\ndata: {}\n\n`);
          close();
        }
      }).catch(() => {});
      return;
    }
    res.write(`event: kitchen\ndata: ${JSON.stringify({ type: data.type, order_id: data.order_id ?? null })}\n\n`);
  };
  subscriber.on('message', messageHandler);
  subscribeChannel(channel, (err) => {
    if (err) close();
  });

  // Ping + token hâlâ geçerli mi (modül kapatıldı / link sıfırlandıysa bağlantıyı kes)
  ping = setInterval(async () => {
    res.write(`: ping ${Date.now()}\n\n`);
    const still = await resolveKitchenToken(token).catch(() => null);
    if (!still && !closed) {
      res.write(`event: revoked\ndata: {}\n\n`);
      close();
    }
  }, 15000);

  req.on('close', close);
});
