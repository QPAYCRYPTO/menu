// apps/api/src/services/sessionService.ts
// Masa oturumu (table_sessions) iş mantığı
// Bu dosya yeni oluşturuldu, mevcut kodlar etkilenmez

import { PoolClient } from 'pg';
import { pool } from '../db/postgres.js';

export type TableSession = {
  id: string;
  business_id: string;
  table_id: string;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
  cached_total_int: number;
  closed_by: string | null;
  auto_closed: boolean;
  note: string | null;
  updated_at: string;
};

/**
 * Masada açık bir session var mı kontrol eder.
 * Varsa getirir, yoksa yeni oluşturur.
 * 
 * Race condition korumalı: Unique partial index sayesinde
 * aynı anda iki paralel istek gelse bile sadece biri session oluşturur.
 * 
 * Transaction içinde çağrılabilir (client parametresi ile).
 * 
 * @returns Session kaydı
 */
export async function getOrCreateOpenSession(
  businessId: string,
  tableId: string,
  client?: PoolClient
): Promise<TableSession> {
  const db = client ?? pool;

  // 1. Önce var olan open session'ı kontrol et
  const existingResult = await db.query(
    `SELECT * FROM table_sessions 
     WHERE business_id = $1 AND table_id = $2 AND status = 'open'
     LIMIT 1`,
    [businessId, tableId]
  );

  if (existingResult.rowCount === 1) {
    return existingResult.rows[0] as TableSession;
  }

  // 2. Yoksa yeni oluştur — race condition'a karşı dayanıklı INSERT
  try {
    const insertResult = await db.query(
      `INSERT INTO table_sessions (business_id, table_id, status, opened_at, updated_at)
       VALUES ($1, $2, 'open', NOW(), NOW())
       RETURNING *`,
      [businessId, tableId]
    );
    return insertResult.rows[0] as TableSession;
  } catch (err: any) {
    // 3. Unique violation (23505) — aynı anda başka istek session açmış
    // Tekrar oku ve dön
    if (err?.code === '23505') {
      const retryResult = await db.query(
        `SELECT * FROM table_sessions 
         WHERE business_id = $1 AND table_id = $2 AND status = 'open'
         LIMIT 1`,
        [businessId, tableId]
      );
      if (retryResult.rowCount === 1) {
        return retryResult.rows[0] as TableSession;
      }
    }
    throw err;
  }
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