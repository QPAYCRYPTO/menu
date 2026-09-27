// apps/api/src/services/sessionService.ts
// Masa oturumu (table_sessions) iş mantığı
// Bu dosya yeni oluşturuldu, mevcut kodlar etkilenmez

import { Pool, PoolClient } from 'pg';
import { pool } from '../db/postgres.js';

type Db = Pool | PoolClient;

export type TableSession = {
  id: string;
  business_id: string;
  table_id: string;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'closed' | 'merged';
  cached_total_int: number;
  closed_by: string | null;
  auto_closed: boolean;
  note: string | null;
  merge_group_id: string | null;
  merged_into_session_id: string | null;
  updated_at: string;
};

// ----------------------------------------------------------------------------
// AKTİF SESSION ÇÖZÜMLEME — "Bu masanın aktif adisyonu hangisi?" sorusunun
// TEK cevabı. Birleştirme zinciri (A → B → C) sonuna kadar takip edilir,
// sadece status='open' olan session aktif sayılır.
// ----------------------------------------------------------------------------

const MAX_MERGE_CHAIN_DEPTH = 20;

/**
 * Bir session'dan başlayıp merged_into_session_id zincirini izler.
 * Zincirin sonundaki 'open' session'ı döner; zincir kapalı bir session'da
 * bitiyorsa (veya kopuksa / döngü varsa) null döner.
 * loadById: session'ı DB'den veya önceden yüklenmiş bir map'ten getirir.
 */
export async function followMergeChain<T extends Pick<TableSession, 'id' | 'status' | 'merged_into_session_id'>>(
  start: T | null,
  loadById: (id: string) => Promise<T | null> | T | null
): Promise<T | null> {
  const seen = new Set<string>();
  let current = start;

  while (current) {
    if (current.status === 'open') return current;
    if (current.status !== 'merged' || !current.merged_into_session_id) return null;
    if (seen.has(current.id) || seen.size >= MAX_MERGE_CHAIN_DEPTH) return null;
    seen.add(current.id);
    current = await loadById(current.merged_into_session_id);
  }

  return null;
}

/**
 * Session id'den aktif (open) session'ı bulur. Session merged ise zinciri izler.
 * Kilitlemez, oluşturmaz.
 */
export async function findActiveSessionById(
  businessId: string,
  sessionId: string,
  db: Db = pool
): Promise<TableSession | null> {
  const loadById = async (id: string) => {
    const r = await db.query(
      `SELECT * FROM table_sessions WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return r.rowCount === 1 ? (r.rows[0] as TableSession) : null;
  };
  return followMergeChain(await loadById(sessionId), loadById);
}

/**
 * Masanın aktif (open) session'ını bulur. Kilitlemez, oluşturmaz.
 * Okuma ekranları (garson masa detayı vb.) ve "masa dolu mu?" kontrolü için.
 */
export async function findActiveSession(
  businessId: string,
  tableId: string,
  db: Db = pool
): Promise<TableSession | null> {
  // Masanın kendi open session'ı önce gelir, sonra en son birleştirilen merged kayıt
  const rows = await db.query(
    `SELECT * FROM table_sessions
     WHERE business_id = $1 AND table_id = $2 AND status IN ('open', 'merged')
     ORDER BY (status = 'open') DESC, closed_at DESC NULLS LAST`,
    [businessId, tableId]
  );

  for (const row of rows.rows as TableSession[]) {
    if (row.status === 'open') return row;
    if (!row.merged_into_session_id) continue;
    const active = await findActiveSessionById(businessId, row.merged_into_session_id, db);
    if (active) return active;
  }

  return null;
}

/**
 * Sipariş yazmak için masanın aktif session'ını çözer:
 * - Birleştirme zincirini sonuna kadar izler
 * - Sadece open session kabul eder ve FOR UPDATE ile kilitler
 * - Açık session yoksa yeni açar
 * - Hiçbir açık session'a çıkmayan (kalıntı) merged kayıtları kapatır
 *
 * Transaction içinde (BEGIN sonrası client ile) çağrılmalıdır.
 */
export async function resolveActiveSession(
  businessId: string,
  tableId: string,
  client: PoolClient
): Promise<TableSession> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const active = await findActiveSession(businessId, tableId, client);

    if (active) {
      // Kilit alırken status tekrar kontrol edilir: bu arada kapatıldı/birleştirildiyse baştan çöz
      const locked = await client.query(
        `SELECT * FROM table_sessions
         WHERE id = $1 AND business_id = $2 AND status = 'open'
         FOR UPDATE`,
        [active.id, businessId]
      );
      if (locked.rowCount === 1) return locked.rows[0] as TableSession;
      continue;
    }

    // Aktif session yok → bu masadaki merged kayıtlar kalıntı, kapat
    await client.query(
      `UPDATE table_sessions
       SET status = 'closed', updated_at = NOW()
       WHERE business_id = $1 AND table_id = $2 AND status = 'merged'`,
      [businessId, tableId]
    );

    // Yeni session aç. Paralel istek aynı anda açtıysa unique index çakışır →
    // DO NOTHING (transaction bozulmaz), döngü tekrar okuyup onu kilitler.
    const inserted = await client.query(
      `INSERT INTO table_sessions (business_id, table_id, status, opened_at, updated_at)
       VALUES ($1, $2, 'open', NOW(), NOW())
       ON CONFLICT (table_id) WHERE status = 'open' DO NOTHING
       RETURNING *`,
      [businessId, tableId]
    );
    if (inserted.rowCount === 1) return inserted.rows[0] as TableSession;
  }

  throw new Error('Masa için aktif oturum çözümlenemedi.');
}

/**
 * Geriye uyumluluk: eski isim. Artık resolveActiveSession'a yönlendirir.
 * Transaction içinde (client ile) çağrılmalıdır.
 */
export async function getOrCreateOpenSession(
  businessId: string,
  tableId: string,
  client: PoolClient
): Promise<TableSession> {
  return resolveActiveSession(businessId, tableId, client);
}

/**
 * Session'ın cached_total_int değerini günceller.
 * Bir sipariş "delivered" olduğunda çağrılır.
 */
export async function incrementSessionTotal(
  sessionId: string,
  amountInt: number,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `UPDATE table_sessions 
     SET cached_total_int = cached_total_int + $1, 
         updated_at = NOW()
     WHERE id = $2`,
    [amountInt, sessionId]
  );
}

/**
 * Session'ın cached_total_int değerini azaltır.
 * Bir sipariş "delivered"'dan geri alınırsa veya iptal edilirse çağrılır.
 */
export async function decrementSessionTotal(
  sessionId: string,
  amountInt: number,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `UPDATE table_sessions 
     SET cached_total_int = GREATEST(cached_total_int - $1, 0), 
         updated_at = NOW()
     WHERE id = $2`,
    [amountInt, sessionId]
  );
}

/**
 * Session'ı kapatır.
 * total_int, cached_total_int'ten alınır (ya da SUM ile yeniden hesaplanır).
 */
export async function closeSession(
  sessionId: string,
  closedBy: string,
  client?: PoolClient
): Promise<TableSession> {
  const db = client ?? pool;

  const result = await db.query(
    `UPDATE table_sessions 
     SET status = 'closed', 
         closed_at = NOW(), 
         closed_by = $2,
         updated_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [sessionId, closedBy]
  );

  if (result.rowCount !== 1) {
    throw new Error('Session kapatılamadı (zaten kapalı veya bulunamadı).');
  }

  return result.rows[0] as TableSession;
}

/**
 * Session detayını getirir (siparişlerle birlikte).
 */
export async function getSessionWithOrders(sessionId: string) {
  const sessionResult = await pool.query(
    `SELECT * FROM table_sessions WHERE id = $1`,
    [sessionId]
  );

  if (sessionResult.rowCount !== 1) {
    return null;
  }

  const ordersResult = await pool.query(
    `SELECT 
      o.id, o.table_name, o.status, o.note, o.type, o.created_at, o.customer_token,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'price_int', oi.price_int
          ) ORDER BY oi.created_at
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) as items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.session_id = $1
    GROUP BY o.id
    ORDER BY o.created_at ASC`,
    [sessionId]
  );

  return {
    session: sessionResult.rows[0],
    orders: ordersResult.rows
  };
}

/**
 * Masa bazında aktif (open) session'ı bul.
 * Yoksa null döner.
 */
export async function getOpenSessionByTable(
  businessId: string,
  tableId: string
): Promise<TableSession | null> {
  const result = await pool.query(
    `SELECT * FROM table_sessions 
     WHERE business_id = $1 AND table_id = $2 AND status = 'open'
     LIMIT 1`,
    [businessId, tableId]
  );
  return result.rowCount === 1 ? (result.rows[0] as TableSession) : null;
}