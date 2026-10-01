// apps/api/src/services/itemCancellationService.ts
// Ürün bazlı iptal + mutfak bildirimi
//
//   - Mutfak başlamadan (Bekliyor) yapılan iptal/azaltma DÜZELTMEDİR: kayda yazılmaz, mutfak kartı yanıp söner.
//   - Mutfak başladıktan sonra (Hazırlanıyor/Hazır) iptal edilen her kalem order_item_cancellations'a yazılır:
//     ürün, adet, fiyat, sebep, kim (personel/admin), onaylayan. Admin Siparişler ve Geçmiş'te görür.
//   - Seçilen kalemler siparişin tamamıysa sipariş bütünüyle iptal olur (kalemler geçmişte kalır).
//   - Mutfağın görmesi gereken her değişiklik orders.kitchen_notice'e eklenir; mutfak "Gördüm" deyince temizlenir.

import type { PoolClient } from 'pg';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';

type Queryable = Pick<PoolClient, 'query'>;

export type KitchenNoticeTone = 'edit' | 'cancel' | 'request' | 'info';
export type KitchenNoticeLine = { tone: KitchenNoticeTone; text: string; at: string };

/** Mutfak ekranında görünen aşamalar (bildirim yalnızca bunlarda anlamlı) */
export const KITCHEN_VISIBLE_STATUSES = ['pending', 'preparing'];
export const OPEN_ORDER_STATUSES = ['pending', 'preparing', 'ready'];

export type Actor = { waiterId?: string | null; userId?: string | null; name: string };
export type CancelItemInput = { order_item_id: string; quantity: number };
export type ItemChange =
  | { action: 'removed'; product_name: string; quantity: number }
  | { action: 'quantity_changed'; product_name: string; old_quantity: number; new_quantity: number };

export function fullReason(code: string, text?: string | null): string {
  const t = text?.trim();
  return t ? `${code}: ${t}` : code;
}

/** Mutfağın "Gördüm" demesi gereken satırları ekler */
export async function addKitchenNotice(
  db: Queryable, orderId: string, lines: Array<{ tone: KitchenNoticeTone; text: string }>
): Promise<void> {
  if (lines.length === 0) return;
  const at = new Date().toISOString();
  await db.query(
    `UPDATE orders
     SET kitchen_notice = COALESCE(kitchen_notice, '[]'::jsonb) || $2::jsonb,
         kitchen_notice_at = NOW()
     WHERE id = $1`,
    [orderId, JSON.stringify(lines.map(l => ({ ...l, at })))]
  );
}

/**
 * Siparişin TAMAMI iptal edildiğinde (mevcut tüm-sipariş iptal yolları) kalemleri iptal kaydına yazar
 * ve mutfağa bildirir. Çağıran, siparişin iptal edilmeden önceki durumunu verir.
 */
export async function recordWholeOrderCancellation(db: Queryable, p: {
  businessId: string;
  orderId: string;
  previousStatus: string;
  reasonCode: string;
  reasonText?: string | null;
  actor: Actor;
  approvedBy?: string | null;
  changeRequestId?: string | null;
}): Promise<void> {
  if (p.previousStatus !== 'pending') {
    await db.query(
      `INSERT INTO order_item_cancellations
         (business_id, order_id, order_item_id, product_name, quantity, price_int, reason_code, reason_text,
          order_status, whole_order, waiter_id, user_id, actor_name, approved_by, change_request_id)
       SELECT $1, oi.order_id, oi.id, oi.product_name, oi.quantity, oi.price_int, $3, $4,
              $5, TRUE, $6, $7, $8, $9, $10
       FROM order_items oi
       WHERE oi.order_id = $2 AND oi.quantity > 0`,
      [p.businessId, p.orderId, p.reasonCode, p.reasonText?.trim() || null, p.previousStatus,
        p.actor.waiterId ?? null, p.actor.userId ?? null, p.actor.name, p.approvedBy ?? null, p.changeRequestId ?? null]
    );
  }
  if (KITCHEN_VISIBLE_STATUSES.includes(p.previousStatus)) {
    await addKitchenNotice(db, p.orderId, [{ tone: 'cancel', text: 'SİPARİŞ İPTAL EDİLDİ' }]);
  }
}

/**
 * Seçilen kalemleri (adetleriyle) iptal eder. Transaction içinde çağrılmalı.
 * Seçim siparişin kalan tamamını kapsıyorsa sipariş bütünüyle iptal olur.
 */
export async function cancelOrderItems(client: Queryable, p: {
  businessId: string;
  orderId: string;
  items: CancelItemInput[];
  reasonCode: string;
  reasonText?: string | null;
  actor: Actor;
  approvedBy?: string | null;
  changeRequestId?: string | null;
}): Promise<{
  wholeCancelled: boolean;
  previousStatus: string;
  order: { id: string; table_id: string | null; table_name: string; session_id: string | null; type: string };
  changes: ItemChange[];
}> {
  const orderResult = await client.query(
    `SELECT id, status, table_id, table_name, session_id, type
     FROM orders WHERE id = $1 AND business_id = $2 FOR UPDATE`,
    [p.orderId, p.businessId]
  );
  const order = orderResult.rows[0];
  if (!order || order.type !== 'order') throw new AppError('Sipariş bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  if (order.status === 'cancelled') throw new AppError('Bu sipariş zaten iptal edilmiş.', 409, APP_ERROR_CODES.BAD_REQUEST);
  if (order.status === 'delivered') {
    throw new AppError('Teslim edilmiş sipariş artık adisyona yansımıştır. İptal işlemi kasa/admin tarafından yapılır.', 403, APP_ERROR_CODES.FORBIDDEN);
  }

  // Aynı kalem iki kez geldiyse adetleri topla
  const wanted = new Map<string, number>();
  for (const it of p.items) wanted.set(it.order_item_id, (wanted.get(it.order_item_id) ?? 0) + it.quantity);
  if (wanted.size === 0) throw new AppError('İptal edilecek ürün seçin.', 400, APP_ERROR_CODES.BAD_REQUEST);

  const itemsResult = await client.query(
    `SELECT id, product_name, quantity, price_int, is_paid
     FROM order_items WHERE order_id = $1 FOR UPDATE`,
    [p.orderId]
  );
  const byId = new Map(itemsResult.rows.map((r: any) => [r.id as string, r]));
  for (const [id, qty] of wanted) {
    const row: any = byId.get(id);
    if (!row) throw new AppError('Seçilen ürün bu siparişte yok (değişmiş olabilir).', 409, APP_ERROR_CODES.BAD_REQUEST);
    if (!Number.isInteger(qty) || qty < 1 || qty > row.quantity) {
      throw new AppError(`${row.product_name} için geçersiz adet.`, 400, APP_ERROR_CODES.BAD_REQUEST);
    }
    if (row.is_paid) throw new AppError(`${row.product_name} ödenmiş; iptal edilemez.`, 409, APP_ERROR_CODES.BAD_REQUEST);
  }

  const totalQty = itemsResult.rows.reduce((s: number, r: any) => s + Number(r.quantity), 0);
  const cancelQty = [...wanted.values()].reduce((s, q) => s + q, 0);
  const wholeCancelled = cancelQty >= totalQty;
  const previousStatus: string = order.status;
  const record = previousStatus !== 'pending';
  const reasonText = p.reasonText?.trim() || null;

  if (record) {
    for (const [id, qty] of wanted) {
      const row: any = byId.get(id);
      await client.query(
        `INSERT INTO order_item_cancellations
           (business_id, order_id, order_item_id, product_name, quantity, price_int, reason_code, reason_text,
            order_status, whole_order, waiter_id, user_id, actor_name, approved_by, change_request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [p.businessId, p.orderId, id, row.product_name, qty, row.price_int, p.reasonCode, reasonText,
          previousStatus, wholeCancelled, p.actor.waiterId ?? null, p.actor.userId ?? null, p.actor.name,
          p.approvedBy ?? null, p.changeRequestId ?? null]
      );
    }
  }

  const changes: ItemChange[] = [];
  if (wholeCancelled) {
    // Kalemler geçmişte görünsün diye silinmez; sipariş iptal olur
    await client.query(
      `UPDATE orders
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1, cancel_reason = $2, updated_at = NOW()
       WHERE id = $3 AND business_id = $4`,
      [p.actor.userId ?? p.approvedBy ?? null, fullReason(p.reasonCode, reasonText), p.orderId, p.businessId]
    );
  } else {
    for (const [id, qty] of wanted) {
      const row: any = byId.get(id);
      if (qty >= row.quantity) {
        await client.query(`DELETE FROM order_items WHERE id = $1`, [id]);
        changes.push({ action: 'removed', product_name: row.product_name, quantity: row.quantity });
      } else {
        await client.query(`UPDATE order_items SET quantity = quantity - $1 WHERE id = $2`, [qty, id]);
        changes.push({ action: 'quantity_changed', product_name: row.product_name, old_quantity: row.quantity, new_quantity: row.quantity - qty });
      }
    }
    await client.query(`UPDATE orders SET updated_at = NOW() WHERE id = $1`, [p.orderId]);
  }

  if (KITCHEN_VISIBLE_STATUSES.includes(previousStatus)) {
    const lines = wholeCancelled
      ? [{ tone: 'cancel' as const, text: 'SİPARİŞ İPTAL EDİLDİ' }]
      : [...wanted].map(([id, qty]) => {
          const row: any = byId.get(id);
          const left = row.quantity - qty;
          return previousStatus === 'pending'
            ? { tone: 'edit' as const, text: left > 0 ? `${row.product_name}: ${row.quantity} → ${left}` : `Çıkarıldı: ${row.quantity}× ${row.product_name}` }
            : { tone: 'cancel' as const, text: `İPTAL: ${qty}× ${row.product_name}` };
        });
    await addKitchenNotice(client, p.orderId, lines);
  }

  return {
    wholeCancelled,
    previousStatus,
    order: { id: order.id, table_id: order.table_id, table_name: order.table_name, session_id: order.session_id, type: order.type },
    changes
  };
}

export type CancellationRow = {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  price_int: number;
  reason_code: string;
  reason_text: string | null;
  order_status: string;
  whole_order: boolean;
  actor_name: string;
  approved_by_email: string | null;
  created_at: string;
};

/** Siparişlerin iptal kayıtları (sipariş id → liste), eskiden yeniye */
export async function listCancellations(db: Queryable, businessId: string, orderIds: string[]): Promise<Map<string, CancellationRow[]>> {
  const map = new Map<string, CancellationRow[]>();
  if (orderIds.length === 0) return map;
  const r = await db.query(
    `SELECT c.id, c.order_id, c.product_name, c.quantity, c.price_int, c.reason_code, c.reason_text,
            c.order_status, c.whole_order, c.actor_name, u.email AS approved_by_email, c.created_at
     FROM order_item_cancellations c
     LEFT JOIN users u ON u.id = c.approved_by
     WHERE c.business_id = $1 AND c.order_id = ANY($2::uuid[])
     ORDER BY c.created_at ASC`,
    [businessId, orderIds]
  );
  for (const row of r.rows as CancellationRow[]) {
    const list = map.get(row.order_id) ?? [];
    list.push(row);
    map.set(row.order_id, list);
  }
  return map;
}
