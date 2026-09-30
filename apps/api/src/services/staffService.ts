// apps/api/src/services/staffService.ts
// Personel mola + vardiya durumu ve admin panelindeki "Hareketler" akışı.
//
// - Mola: waiters.break_started_at / break_ends_at. Personel süre seçip molaya çıkar (5–60 dk),
//   "Moladan dön" ile biter. Süre dolunca otomatik bitmez; admin panelinde "mola süresi aşıldı" görünür.
// - Vardiya: personelin aktif giriş oturumunun (waiter_sessions) bitiş zamanı — admin QR/link üretirken
//   seçtiği süre (1–12 saat).
// - Her mola başlangıcı/bitişi waiter_activity_log'a yazılır ve işletme kanalına canlı olay gider.
import { pool } from '../db/postgres.js';
import { publishOrder } from '../db/redisPubSub.js';
import { logWaiterActivity } from './waiterActivityService.js';

export const BREAK_MINUTES = [5, 10, 15, 20, 30, 45, 60] as const;

export type BreakState = {
  on_break: boolean;
  break_started_at: string | null;
  break_ends_at: string | null;
};

export type StaffMember = BreakState & {
  id: string;
  name: string;
  title: string | null;
  /** Aktif giriş oturumunun bitişi; null = şu an vardiyada değil (geçerli giriş linki yok) */
  shift_ends_at: string | null;
};

export type StaffActivity = {
  id: string;
  waiter_id: string | null;
  waiter_name: string;
  action: 'break_start' | 'break_end';
  metadata: Record<string, unknown>;
  created_at: string;
};

type WaiterRef = { id: string; business_id: string; name: string };

function toBreakState(row: { break_started_at: string | null; break_ends_at: string | null }): BreakState {
  return {
    on_break: row.break_started_at !== null,
    break_started_at: row.break_started_at,
    break_ends_at: row.break_ends_at
  };
}

/** Personel uygulaması profil verisi: mola durumu + bu oturumun (vardiyanın) bitişi */
export async function getWaiterShiftInfo(waiterId: string, sessionId: string | undefined): Promise<BreakState & { shift_ends_at: string | null }> {
  const result = await pool.query(
    `SELECT w.break_started_at, w.break_ends_at,
            (SELECT s.expires_at FROM waiter_sessions s
              WHERE s.id = $2 AND s.waiter_id = w.id AND s.revoked_at IS NULL) AS shift_ends_at
     FROM waiters w WHERE w.id = $1`,
    [waiterId, sessionId ?? null]
  );
  const row = result.rows[0] ?? { break_started_at: null, break_ends_at: null, shift_ends_at: null };
  return { ...toBreakState(row), shift_ends_at: row.shift_ends_at ?? null };
}

/** Molaya çık. Zaten moladaysa null döner. */
export async function startBreak(waiter: WaiterRef, minutes: number): Promise<BreakState | null> {
  const result = await pool.query(
    `UPDATE waiters
     SET break_started_at = NOW(), break_ends_at = NOW() + make_interval(mins => $3), updated_at = NOW()
     WHERE id = $1 AND business_id = $2 AND break_started_at IS NULL AND deleted_at IS NULL
     RETURNING break_started_at, break_ends_at`,
    [waiter.id, waiter.business_id, minutes]
  );
  if (result.rowCount !== 1) return null;
  const state = toBreakState(result.rows[0]);

  await logWaiterActivity({
    businessId: waiter.business_id,
    waiterId: waiter.id,
    waiterName: waiter.name,
    action: 'break_start',
    metadata: { minutes, ends_at: state.break_ends_at }
  });
  publishOrder(waiter.business_id, {
    type: 'staff_update',
    action: 'break_start',
    waiter_id: waiter.id,
    waiter_name: waiter.name,
    minutes,
    break_ends_at: state.break_ends_at
  }).catch(() => {});
  return state;
}

/** Moladan dön. Molada değilse null döner. */
export async function endBreak(waiter: WaiterRef): Promise<{ duration_min: number; overdue_min: number } | null> {
  const result = await pool.query(
    `WITH old AS (
       SELECT id, break_started_at, break_ends_at FROM waiters
       WHERE id = $1 AND business_id = $2 AND break_started_at IS NOT NULL
       FOR UPDATE
     )
     UPDATE waiters w
     SET break_started_at = NULL, break_ends_at = NULL, updated_at = NOW()
     FROM old
     WHERE w.id = old.id
     RETURNING
       GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - old.break_started_at)) / 60))::int AS duration_min,
       GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - old.break_ends_at)) / 60))::int AS overdue_min`,
    [waiter.id, waiter.business_id]
  );
  if (result.rowCount !== 1) return null;
  const { duration_min, overdue_min } = result.rows[0];

  await logWaiterActivity({
    businessId: waiter.business_id,
    waiterId: waiter.id,
    waiterName: waiter.name,
    action: 'break_end',
    metadata: { duration_min, overdue_min }
  });
  publishOrder(waiter.business_id, {
    type: 'staff_update',
    action: 'break_end',
    waiter_id: waiter.id,
    waiter_name: waiter.name,
    duration_min,
    overdue_min
  }).catch(() => {});
  return { duration_min, overdue_min };
}

/** Admin paneli: aktif durumdaki personel (vardiya + mola) ve son 24 saatin mola hareketleri */
export async function getStaffOverview(businessId: string): Promise<{ staff: StaffMember[]; activity: StaffActivity[] }> {
  const staffResult = await pool.query(
    `SELECT w.id, w.name, w.title, w.break_started_at, w.break_ends_at,
            MAX(s.expires_at) AS shift_ends_at
     FROM waiters w
     LEFT JOIN waiter_sessions s
       ON s.waiter_id = w.id AND s.revoked_at IS NULL AND s.expires_at > NOW()
     WHERE w.business_id = $1 AND w.deleted_at IS NULL AND w.status = 'active'
     GROUP BY w.id
     ORDER BY w.name`,
    [businessId]
  );
  const activityResult = await pool.query(
    // created_at saat dilimsiz (timestamp) saklanıyor; oturum saat dilimiyle timestamptz'e çevrilir,
    // yoksa istemci UTC değerini yerel saat sanar
    `SELECT id, waiter_id, waiter_name, action, metadata,
            (created_at AT TIME ZONE current_setting('TimeZone')) AS created_at
     FROM waiter_activity_log
     WHERE business_id = $1 AND action IN ('break_start', 'break_end')
       AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 30`,
    [businessId]
  );
  return {
    staff: staffResult.rows.map(r => ({
      id: r.id,
      name: r.name,
      title: r.title ?? null,
      shift_ends_at: r.shift_ends_at ?? null,
      ...toBreakState(r)
    })),
    activity: activityResult.rows.map(r => ({ ...r, metadata: r.metadata ?? {} }))
  };
}
