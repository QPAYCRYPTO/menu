// apps/api/src/services/kitchenService.ts
// Mutfak ekranı: link token'ı yönetimi ve mutfakta görünen aktif siparişler.
// Tüm sorgular business_id ile sınırlıdır; token yalnızca kendi işletmesinin verisini açar.
import { randomBytes } from 'node:crypto';
import { pool } from '../db/postgres.js';

export const KITCHEN_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export type KitchenTokenInfo = { token: string; created_at: string };

export type KitchenOrder = {
  id: string;
  order_no: number;
  table_name: string;
  status: 'pending' | 'preparing';
  note: string | null;
  created_at: string;
  items: Array<{ id: string; product_name: string; quantity: number; note: string | null }>;
  /** Onay bekleyen iptal / adet azaltma talepleri — mutfak kartında uyarı */
  pending_changes: Array<{ kind: 'order_cancel' | 'item_decrease'; product_name: string | null; requested_quantity: number | null }>;
};

export async function isKitchenModuleEnabled(businessId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT kitchen_module_enabled FROM businesses WHERE id = $1 AND is_active = TRUE`,
    [businessId]
  );
  return result.rowCount === 1 && result.rows[0].kitchen_module_enabled === true;
}

export async function getActiveKitchenToken(businessId: string): Promise<KitchenTokenInfo | null> {
  const result = await pool.query(
    `SELECT token, created_at FROM kitchen_tokens
     WHERE business_id = $1 AND is_active = TRUE`,
    [businessId]
  );
  return result.rows[0] ?? null;
}

/** Yeni token üretir; varsa eski aktif token'ı geçersiz kılar (tek transaction) */
export async function rotateKitchenToken(businessId: string): Promise<KitchenTokenInfo> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Aynı işletme için eşzamanlı iki üretimi sıraya sok (tek aktif token kuralı)
    await client.query(`SELECT id FROM businesses WHERE id = $1 FOR UPDATE`, [businessId]);
    await client.query(
      `UPDATE kitchen_tokens SET is_active = FALSE
       WHERE business_id = $1 AND is_active = TRUE`,
      [businessId]
    );
    const token = randomBytes(16).toString('hex');
    const result = await client.query(
      `INSERT INTO kitchen_tokens (business_id, token) VALUES ($1, $2)
       RETURNING token, created_at`,
      [businessId, token]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Token → işletme. Token pasif, işletme pasif veya modül kapalıysa null. */
export async function resolveKitchenToken(token: string): Promise<{ businessId: string; businessName: string } | null> {
  if (!KITCHEN_TOKEN_PATTERN.test(token)) return null;
  const result = await pool.query(
    `SELECT b.id, b.name
     FROM kitchen_tokens kt
     JOIN businesses b ON b.id = kt.business_id
     WHERE kt.token = $1
       AND kt.is_active = TRUE
       AND b.is_active = TRUE
       AND b.kitchen_module_enabled = TRUE`,
    [token]
  );
  if (result.rowCount !== 1) return null;
  return { businessId: result.rows[0].id, businessName: result.rows[0].name };
}

/** Mutfakta görünen siparişler: bekleyen + hazırlanan (çağrılar hariç), eskiden yeniye */
export async function listKitchenOrders(businessId: string): Promise<KitchenOrder[]> {
  const result = await pool.query(
    `WITH numbered AS (
       -- Sipariş no: işletmede o günün kaçıncı siparişi (çağrılar sayılmaz)
       SELECT o.id,
              ROW_NUMBER() OVER (PARTITION BY (o.created_at AT TIME ZONE 'Europe/Istanbul')::date ORDER BY o.created_at, o.id) AS order_no
       FROM orders o
       WHERE o.business_id = $1
         AND o.type = 'order'
         AND o.created_at >= NOW() - INTERVAL '2 days'
     )
     SELECT o.id, n.order_no::int AS order_no, o.table_name, o.status, o.note, o.created_at,
            COALESCE(
              json_agg(
                json_build_object('id', oi.id, 'product_name', oi.product_name, 'quantity', oi.quantity, 'note', oi.note)
                ORDER BY oi.created_at
              ) FILTER (WHERE oi.id IS NOT NULL),
              '[]'
            ) AS items
     FROM orders o
     LEFT JOIN numbered n ON n.id = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = $1
       AND o.type = 'order'
       AND o.status IN ('pending', 'preparing')
     GROUP BY o.id, n.order_no
     ORDER BY o.created_at ASC
     LIMIT 200`,
    [businessId]
  );
  const pending = await pool.query(
    `SELECT r.order_id, r.kind, oi.product_name, r.requested_quantity
     FROM order_change_requests r
     LEFT JOIN order_items oi ON oi.id = r.order_item_id
     WHERE r.business_id = $1 AND r.status = 'pending' AND r.order_id = ANY($2::uuid[])
     ORDER BY r.created_at`,
    [businessId, result.rows.map(r => r.id)]
  );
  return result.rows.map(r => ({
    ...r,
    order_no: r.order_no ?? 0,
    pending_changes: pending.rows
      .filter(p => p.order_id === r.id)
      .map(p => ({ kind: p.kind, product_name: p.product_name ?? null, requested_quantity: p.requested_quantity ?? null }))
  }));
}

/** Siparişi "hazırlanıyor" yapar. Yalnızca bu işletmenin bekleyen siparişi değişir. */
export async function markKitchenOrderPreparing(
  businessId: string,
  orderId: string
): Promise<{ id: string; table_id: string | null; table_name: string } | null> {
  const result = await pool.query(
    `UPDATE orders
     SET status = 'preparing', updated_at = NOW(), preparing_at = COALESCE(preparing_at, NOW())
     WHERE id = $1 AND business_id = $2 AND type = 'order' AND status = 'pending'
     RETURNING id, table_id, table_name`,
    [orderId, businessId]
  );
  return result.rows[0] ?? null;
}

/** Siparişi "hazır" yapar. Yalnızca bu işletmenin bekleyen/hazırlanan siparişi değişir.
 *  Ürün özeti (ad + adet) garson bildirimi için döner. */
export async function markKitchenOrderReady(
  businessId: string,
  orderId: string
): Promise<{
  id: string;
  table_id: string | null;
  table_name: string;
  items: Array<{ product_name: string; quantity: number }>;
} | null> {
  const result = await pool.query(
    `UPDATE orders
     SET status = 'ready', updated_at = NOW(), ready_at = COALESCE(ready_at, NOW())
     WHERE id = $1 AND business_id = $2 AND type = 'order' AND status IN ('pending', 'preparing')
     RETURNING id, table_id, table_name`,
    [orderId, businessId]
  );
  const order = result.rows[0];
  if (!order) return null;
  const items = await pool.query(
    `SELECT product_name, quantity FROM order_items WHERE order_id = $1 ORDER BY created_at`,
    [order.id]
  );
  return { ...order, items: items.rows };
}
