// apps/api/src/services/staffPermissions.ts
// Personel yetkilerinin uygulandığı yardımcılar (piyasa modeli — Toast / SambaPOS):
//
// - İptal / adet azaltma:
//     sipariş "Bekliyor" (mutfak başlamadı)        → herkes doğrudan yapar (maliyet yok)
//     "Hazırlanıyor" / "Hazır" (mutfak başladı)    → İADE: can_refund varsa doğrudan, yoksa admin onayına düşer
//     "Teslim"                                      → personel yapamaz (kasa / admin)
// - Masa sahibi: o açık adisyonda ilk siparişi alan personel (müşterinin QR siparişleri sahip belirlemez).
//     can_see_other_tables  → başkasının masasını listede/detayda görebilir
//     can_edit_other_tables → başkasının masasında işlem yapabilir (sipariş, adet, iptal, taşıma, birleştirme)
import { pool } from '../db/postgres.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import type { Waiter } from './waiterService.js';

export type TableOwner = { id: string; name: string };

/** Mutfağın başlamadığı sipariş: iptal/azaltma herkese serbest */
export function isBeforeKitchen(orderStatus: string): boolean {
  return orderStatus === 'pending';
}

/** Açık adisyonun sahibi (ilk siparişi alan personel); yoksa null */
export async function getSessionOwner(sessionId: string | null | undefined): Promise<TableOwner | null> {
  if (!sessionId) return null;
  const result = await pool.query(
    `SELECT w.id, w.name
     FROM orders o
     JOIN waiters w ON w.id = o.waiter_id
     WHERE o.session_id = $1 AND o.type = 'order' AND o.status <> 'cancelled' AND o.waiter_id IS NOT NULL
     ORDER BY o.created_at ASC
     LIMIT 1`,
    [sessionId]
  );
  return result.rows[0] ?? null;
}

/** Başka personelin masası mı ve bu personel orada işlem yapabilir mi? */
export function canActOnTable(waiter: Waiter, owner: TableOwner | null): boolean {
  return !owner || owner.id === waiter.id || waiter.permissions.can_edit_other_tables === true;
}

export function canSeeTable(waiter: Waiter, owner: TableOwner | null): boolean {
  return !owner || owner.id === waiter.id || waiter.permissions.can_see_other_tables !== false;
}

/** İşlem yetkisi yoksa 403 fırlatır */
export async function assertCanActOnSession(waiter: Waiter, sessionId: string | null | undefined): Promise<void> {
  const owner = await getSessionOwner(sessionId);
  if (!canActOnTable(waiter, owner)) {
    throw new AppError(
      `Bu masa ${owner!.name} personelinde. Başka personelin masasında işlem yetkin yok.`,
      403,
      APP_ERROR_CODES.FORBIDDEN
    );
  }
}

export async function assertCanActOnOrder(waiter: Waiter, orderId: string): Promise<void> {
  const result = await pool.query(
    `SELECT session_id FROM orders WHERE id = $1 AND business_id = $2`,
    [orderId, waiter.business_id]
  );
  if (result.rowCount === 1) await assertCanActOnSession(waiter, result.rows[0].session_id);
}
