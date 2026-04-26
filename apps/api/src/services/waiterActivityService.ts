// apps/api/src/services/waiterActivityService.ts
// Garson hareketlerini loglayan servis
// Her garson işlemi (sipariş, silme, masa değişimi) buraya kaydedilir.

import { PoolClient } from 'pg';
import { pool } from '../db/postgres.js';

export type WaiterActionType =
  | 'order_added'            // Yeni sipariş açtı
  | 'item_added'             // Mevcut siparişe ürün ekledi
  | 'item_quantity_changed'  // Adet değiştirdi
  | 'item_deleted'           // Ürün sildi
  | 'item_note_added'        // Not ekledi
  | 'table_transferred'      // Masa transferi
  | 'tables_merged'          // Masa birleştirdi
  | 'call_answered'          // Çağrıya cevap verdi
  | 'break_start'
  | 'break_end'
  | 'shift_start'
  | 'shift_end';

export type WaiterTargetType = 'order' | 'order_item' | 'table' | 'session' | 'call';

export type LogWaiterActivityInput = {
  businessId: string;
  waiterId: string;
  waiterName: string;
  action: WaiterActionType;
  targetType?: WaiterTargetType;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Garson hareketini loglar.
 * Transaction içinde çalışabilir (client verilirse).
 * Hata fırlatmaz — loglama işin başarısını engellememeli.
 */
export async function logWaiterActivity(
  input: LogWaiterActivityInput,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;

  try {
    await db.query(
      `INSERT INTO waiter_activity_log
         (business_id, waiter_id, waiter_name, action,
          target_type, target_id, target_name, metadata, ip_address, user_agent)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
      [
        input.businessId,
        input.waiterId,
        input.waiterName,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.targetName ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.ipAddress ?? null,
        input.userAgent ?? null
      ]
    );
  } catch (err) {
    // Loglama başarısızsa sessizce geç — ana işlemi etkilemesin
    console.error('[waiterActivityService] log failed:', err);
  }
}

export type ActivityLogEntry = {
  id: string;
  business_id: string;
  waiter_id: string | null;
  waiter_name: string;
  action: WaiterActionType;
  target_type: WaiterTargetType | null;
  target_id: string | null;
  target_name: string | null;
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

/**
 * İşletmenin garson hareketlerini listele.
 * Filtre: waiter_id, action, tarih aralığı.
 */
export async function listWaiterActivities(
  businessId: string,
  options: {
    waiterId?: string;
    action?: WaiterActionType;
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ActivityLogEntry[]> {
  const conditions: string[] = ['business_id = $1'];
  const params: any[] = [businessId];

  if (options.waiterId) {
    params.push(options.waiterId);
    conditions.push(`waiter_id = $${params.length}`);
  }
  if (options.action) {
    params.push(options.action);
    conditions.push(`action = $${params.length}`);
  }
  if (options.since) {
    params.push(options.since);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (options.until) {
    params.push(options.until);
    conditions.push(`created_at <= $${params.length}`);
  }

  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;
  params.push(limit);
  params.push(offset);

  const result = await pool.query(
    `SELECT * FROM waiter_activity_log
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return result.rows as ActivityLogEntry[];
}