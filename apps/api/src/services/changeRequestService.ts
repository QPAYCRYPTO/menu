// apps/api/src/services/changeRequestService.ts
// Onaya düşen sipariş değişiklikleri (Aşama 4)
//
// Mutfak başladıktan sonra (Hazırlanıyor/Hazır) iptal/azaltma = İADE. "İade" (can_refund) yetkisi olmayan personel:
//   - siparişi iade etmek isterse  → order_cancel talebi
//   - bir kalemin adedini azaltmak isterse → item_decrease talebi
// (Mutfak başlamadan iptal/azaltma herkese serbest; talep oluşmaz — staffPermissions.ts)
// Talep oluşunca sipariş DEĞİŞMEZ; admin onaylarsa uygulanır, reddederse aynen kalır.
// Her adım işletme kanalına 'change_request' olayı olarak yayınlanır (admin paneli, personel, mutfak).
import { pool } from '../db/postgres.js';
import { publishOrder } from '../db/redisPubSub.js';
import { logWaiterActivity } from './waiterActivityService.js';

export type ChangeRequestKind = 'order_cancel' | 'item_decrease';

export type ChangeRequest = {
  id: string;
  kind: ChangeRequestKind;
  order_id: string;
  order_item_id: string | null;
  table_name: string;
  order_status: string;
  product_name: string | null;
  old_quantity: number | null;
  requested_quantity: number | null;
  reason_code: string | null;
  reason_text: string | null;
  waiter_id: string | null;
  waiter_name: string;
  created_at: string;
};

type WaiterRef = { id: string; business_id: string; name: string };

export class ChangeRequestError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

const OPEN_STATUSES = ['pending', 'preparing', 'ready'];

async function publishRequestEvent(businessId: string, payload: Record<string, unknown>): Promise<void> {
  publishOrder(businessId, { type: 'change_request', ...payload }).catch(() => {});
}

/** Personel: sipariş iptal talebi */
export async function requestOrderCancel(
  waiter: WaiterRef, orderId: string, reasonCode: string, reasonText: string | null
): Promise<ChangeRequest> {
  const order = await pool.query(
    `SELECT id, status, table_name, type FROM orders WHERE id = $1 AND business_id = $2`,
    [orderId, waiter.business_id]
  );
  if (order.rowCount !== 1 || order.rows[0].type !== 'order') throw new ChangeRequestError(404, 'Sipariş bulunamadı.');
  const o = order.rows[0];
  if (o.status === 'cancelled') throw new ChangeRequestError(409, 'Bu sipariş zaten iptal edilmiş.');
  if (o.status === 'delivered') {
    throw new ChangeRequestError(403, 'Teslim edilmiş sipariş artık adisyona yansımıştır. İptal işlemi kasa/admin tarafından yapılır.');
  }

  const inserted = await pool.query(
    `INSERT INTO order_change_requests (business_id, order_id, kind, reason_code, reason_text, waiter_id, waiter_name)
     VALUES ($1, $2, 'order_cancel', $3, $4, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id, created_at`,
    [waiter.business_id, orderId, reasonCode, reasonText, waiter.id, waiter.name]
  );
  if (inserted.rowCount !== 1) throw new ChangeRequestError(409, 'Bu sipariş için zaten bekleyen bir iade talebi var.', 'ALREADY_REQUESTED');

  const request: ChangeRequest = {
    id: inserted.rows[0].id, kind: 'order_cancel', order_id: orderId, order_item_id: null,
    table_name: o.table_name, order_status: o.status, product_name: null, old_quantity: null, requested_quantity: null,
    reason_code: reasonCode, reason_text: reasonText, waiter_id: waiter.id, waiter_name: waiter.name,
    created_at: inserted.rows[0].created_at
  };
  await logWaiterActivity({
    businessId: waiter.business_id, waiterId: waiter.id, waiterName: waiter.name,
    action: 'change_requested', targetType: 'order', targetId: orderId, targetName: `${o.table_name} - İptal talebi`,
    metadata: { kind: 'order_cancel', request_id: request.id, reason_code: reasonCode, reason_text: reasonText }
  });
  await publishRequestEvent(waiter.business_id, {
    action: 'created', request_id: request.id, kind: 'order_cancel', order_id: orderId,
    table_name: o.table_name, waiter_id: waiter.id, waiter_name: waiter.name
  });
  return request;
}

/** Personel: adet azaltma talebi (yeni adet ≥ 1 ve mevcut adetten az) */
export async function requestItemDecrease(waiter: WaiterRef, itemId: string, newQuantity: number): Promise<ChangeRequest> {
  const item = await pool.query(
    `SELECT oi.id, oi.quantity, oi.product_name, o.id AS order_id, o.status, o.table_name
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = $1 AND o.business_id = $2`,
    [itemId, waiter.business_id]
  );
  if (item.rowCount !== 1) throw new ChangeRequestError(404, 'Ürün bulunamadı.');
  const it = item.rows[0];
  if (!OPEN_STATUSES.includes(it.status)) throw new ChangeRequestError(409, 'Kapanmış siparişte değişiklik yapılamaz.');
  if (newQuantity < 1 || newQuantity >= it.quantity) throw new ChangeRequestError(400, 'Geçersiz adet.');

  const inserted = await pool.query(
    `INSERT INTO order_change_requests
       (business_id, order_id, order_item_id, kind, old_quantity, requested_quantity, waiter_id, waiter_name)
     VALUES ($1, $2, $3, 'item_decrease', $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING id, created_at`,
    [waiter.business_id, it.order_id, itemId, it.quantity, newQuantity, waiter.id, waiter.name]
  );
  if (inserted.rowCount !== 1) throw new ChangeRequestError(409, 'Bu ürün için zaten bekleyen bir iade talebi var.', 'ALREADY_REQUESTED');

  const request: ChangeRequest = {
    id: inserted.rows[0].id, kind: 'item_decrease', order_id: it.order_id, order_item_id: itemId,
    table_name: it.table_name, order_status: it.status, product_name: it.product_name,
    old_quantity: it.quantity, requested_quantity: newQuantity, reason_code: null, reason_text: null,
    waiter_id: waiter.id, waiter_name: waiter.name, created_at: inserted.rows[0].created_at
  };
  await logWaiterActivity({
    businessId: waiter.business_id, waiterId: waiter.id, waiterName: waiter.name,
    action: 'change_requested', targetType: 'order_item', targetId: itemId,
    targetName: `${it.table_name} - ${it.product_name}`,
    metadata: { kind: 'item_decrease', request_id: request.id, old_quantity: it.quantity, requested_quantity: newQuantity }
  });
  await publishRequestEvent(waiter.business_id, {
    action: 'created', request_id: request.id, kind: 'item_decrease', order_id: it.order_id,
    table_name: it.table_name, product_name: it.product_name, waiter_id: waiter.id, waiter_name: waiter.name
  });
  return request;
}

/** Bekleyen talepler (siparişi hâlâ açık olanlar), eskiden yeniye */
export async function listPendingRequests(businessId: string, orderIds?: string[]): Promise<ChangeRequest[]> {
  const params: unknown[] = [businessId];
  let filter = '';
  if (orderIds) {
    if (orderIds.length === 0) return [];
    params.push(orderIds);
    filter = `AND r.order_id = ANY($2::uuid[])`;
  }
  const result = await pool.query(
    `SELECT r.id, r.kind, r.order_id, r.order_item_id, o.table_name, o.status AS order_status,
            oi.product_name, r.old_quantity, r.requested_quantity, r.reason_code, r.reason_text,
            r.waiter_id, r.waiter_name, r.created_at
     FROM order_change_requests r
     JOIN orders o ON o.id = r.order_id
     LEFT JOIN order_items oi ON oi.id = r.order_item_id
     WHERE r.business_id = $1 AND r.status = 'pending'
       AND o.status IN ('pending', 'preparing', 'ready') ${filter}
     ORDER BY r.created_at ASC`,
    params
  );
  return result.rows;
}

/** Admin kararı: onayla → uygula; reddet → sipariş aynen kalır */
export async function decideRequest(
  businessId: string, userId: string, requestId: string, decision: 'approve' | 'reject', note: string | null
): Promise<{ status: 'approved' | 'rejected' | 'void'; request: ChangeRequest }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reqResult = await client.query(
      `SELECT r.*, o.status AS order_status, o.table_name, o.type AS order_type, oi.product_name, oi.quantity AS current_quantity
       FROM order_change_requests r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN order_items oi ON oi.id = r.order_item_id
       WHERE r.id = $1 AND r.business_id = $2
       FOR UPDATE OF r, o`,
      [requestId, businessId]
    );
    if (reqResult.rowCount !== 1) throw new ChangeRequestError(404, 'Talep bulunamadı.');
    const r = reqResult.rows[0];
    if (r.status !== 'pending') throw new ChangeRequestError(409, 'Bu talep zaten sonuçlandırılmış.', 'ALREADY_DECIDED');

    const request: ChangeRequest = {
      id: r.id, kind: r.kind, order_id: r.order_id, order_item_id: r.order_item_id, table_name: r.table_name,
      order_status: r.order_status, product_name: r.product_name ?? null, old_quantity: r.old_quantity,
      requested_quantity: r.requested_quantity, reason_code: r.reason_code, reason_text: r.reason_text,
      waiter_id: r.waiter_id, waiter_name: r.waiter_name, created_at: r.created_at
    };

    // Sipariş bu arada kapandıysa / kalem zaten azaltıldıysa talep geçersiz
    const orderOpen = OPEN_STATUSES.includes(r.order_status);
    const itemStillApplicable = r.kind !== 'item_decrease'
      || (r.current_quantity !== null && r.current_quantity > r.requested_quantity);
    let status: 'approved' | 'rejected' | 'void' =
      decision === 'reject' ? 'rejected' : (orderOpen && itemStillApplicable ? 'approved' : 'void');

    if (status === 'approved') {
      if (r.kind === 'order_cancel') {
        const finalReason = r.reason_text ? `${r.reason_code}: ${r.reason_text}` : r.reason_code;
        await client.query(
          `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1, cancel_reason = $2, updated_at = NOW()
           WHERE id = $3 AND business_id = $4`,
          [userId, finalReason, r.order_id, businessId]
        );
        // Aynı siparişin diğer bekleyen talepleri anlamsızlaştı
        await client.query(
          `UPDATE order_change_requests SET status = 'void', decided_by = $1, decided_at = NOW()
           WHERE order_id = $2 AND status = 'pending' AND id <> $3`,
          [userId, r.order_id, r.id]
        );
      } else {
        await client.query(`UPDATE order_items SET quantity = $1 WHERE id = $2`, [r.requested_quantity, r.order_item_id]);
      }
    }

    await client.query(
      `UPDATE order_change_requests SET status = $1, decided_by = $2, decided_at = NOW(), decision_note = $3 WHERE id = $4`,
      [status, userId, note, r.id]
    );
    await client.query('COMMIT');

    await logWaiterActivity({
      businessId, waiterId: r.waiter_id, waiterName: r.waiter_name,
      action: status === 'approved' ? 'change_approved' : 'change_rejected',
      targetType: r.kind === 'order_cancel' ? 'order' : 'order_item',
      targetId: r.kind === 'order_cancel' ? r.order_id : r.order_item_id,
      targetName: r.kind === 'order_cancel' ? `${r.table_name} - İptal talebi` : `${r.table_name} - ${r.product_name}`,
      metadata: { kind: r.kind, request_id: r.id, status, note }
    });

    // Mevcut ekran akışları: iptal / kalem değişikliği
    if (status === 'approved' && r.kind === 'order_cancel') {
      publishOrder(businessId, {
        type: 'order_cancelled', order_id: r.order_id, table_name: r.table_name, order_type: r.order_type,
        reason: r.reason_text ? `${r.reason_code}: ${r.reason_text}` : r.reason_code
      }).catch(() => {});
    } else if (status === 'approved') {
      publishOrder(businessId, {
        type: 'order_items_updated', order_id: r.order_id, table_name: r.table_name, waiter_name: r.waiter_name,
        changes: [{ action: 'quantity_changed', product_name: r.product_name, old_quantity: r.current_quantity, new_quantity: r.requested_quantity }]
      }).catch(() => {});
    }
    await publishRequestEvent(businessId, {
      action: 'decided', status, request_id: r.id, kind: r.kind, order_id: r.order_id, table_name: r.table_name,
      product_name: r.product_name ?? null, requested_quantity: r.requested_quantity,
      waiter_id: r.waiter_id, waiter_name: r.waiter_name, note
    });

    return { status, request };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
