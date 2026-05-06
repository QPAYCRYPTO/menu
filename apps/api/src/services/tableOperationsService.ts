// apps/api/src/services/tableOperationsService.ts
// Masa operasyonları: taşıma, birleştirme, sipariş transferi
// Migration 012 ile eklenen alanları kullanır.
// Her operasyon transaction içinde çalışır (FOR UPDATE ile race condition koruması).

import { pool } from '../db/postgres.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';

// ----------------------------------------------------------------------------
// YARDIMCI: waiter_activity_log'a kayıt yaz
// ----------------------------------------------------------------------------
async function logActivity(
  client: any,
  params: {
    businessId: string;
    waiterId: string | null;
    waiterName: string;
    action: string;
    targetType?: string;
    targetId?: string;
    targetName?: string;
    metadata?: Record<string, any>;
  }
) {
  await client.query(
    `INSERT INTO waiter_activity_log
       (business_id, waiter_id, waiter_name, action, target_type, target_id, target_name, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.businessId,
      params.waiterId ?? null,
      params.waiterName,
      params.action,
      params.targetType ?? null,
      params.targetId ?? null,
      params.targetName ?? null,
      JSON.stringify(params.metadata ?? {}),
    ]
  );
}

// ----------------------------------------------------------------------------
// 1. MASA TAŞIMA
// Tüm session'ı (ve bağlı tüm siparişleri) başka boş masaya taşır.
// Kaynak masa yeşile döner, hedef masa kırmızı olur.
// ----------------------------------------------------------------------------
export async function moveSession(params: {
  businessId: string;
  sessionId: string;
  targetTableId: string;
  actorId: string;       // admin userId veya waiter id
  actorName: string;
  actorType: 'admin' | 'waiter';
}) {
  const { businessId, sessionId, targetTableId, actorId, actorName, actorType } = params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Kaynağı kilitle ve kontrol et
    const sourceResult = await client.query(
      `SELECT s.*, t.name AS table_name
       FROM table_sessions s
       INNER JOIN tables t ON t.id = s.table_id
       WHERE s.id = $1 AND s.business_id = $2 AND s.status = 'open'
       FOR UPDATE`,
      [sessionId, businessId]
    );

    if (sourceResult.rowCount !== 1) {
      throw new AppError('Açık oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
    }

    const source = sourceResult.rows[0];

    // 2. Hedef masayı kontrol et (aynı işletme, aktif, boş)
    const targetTableResult = await client.query(
      `SELECT t.*, s.id AS open_session_id
       FROM tables t
       LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status = 'open'
       WHERE t.id = $1 AND t.business_id = $2 AND t.is_active = TRUE
       FOR UPDATE OF t`,
      [targetTableId, businessId]
    );

    if (targetTableResult.rowCount !== 1) {
      throw new AppError('Hedef masa bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
    }

    const targetTable = targetTableResult.rows[0];

    if (targetTable.open_session_id) {
      throw new AppError(
        'Hedef masa dolu. Önce o masayı boşaltın veya birleştirme yapın.',
        409,
        APP_ERROR_CODES.BAD_REQUEST
      );
    }

    if (targetTableId === source.table_id) {
      throw new AppError('Kaynak ve hedef masa aynı olamaz.', 400, APP_ERROR_CODES.BAD_REQUEST);
    }

    // 3. Session'ın table_id'sini güncelle
    await client.query(
      `UPDATE table_sessions
       SET table_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [targetTableId, sessionId]
    );

    // 4. Bu session'daki tüm siparişlerin table_name'ini güncelle (denormalized alan)
    await client.query(
      `UPDATE orders
       SET table_name = $1, updated_at = NOW()
       WHERE session_id = $2 AND business_id = $3`,
      [targetTable.name, sessionId, businessId]
    );

    // 5. Audit log
    await logActivity(client, {
      businessId,
      waiterId: actorType === 'waiter' ? actorId : null,
      waiterName: actorName,
      action: 'table_transferred',
      targetType: 'session',
      targetId: sessionId,
      targetName: `${source.table_name} → ${targetTable.name}`,
      metadata: {
        from_table_id: source.table_id,
        from_table_name: source.table_name,
        to_table_id: targetTableId,
        to_table_name: targetTable.name,
        session_id: sessionId,
        actor_type: actorType,
      },
    });

    await client.query('COMMIT');

    return {
      session_id: sessionId,
      from_table: { id: source.table_id, name: source.table_name },
      to_table: { id: targetTableId, name: targetTable.name },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// 2. MASA BİRLEŞTİRME
// Source session'ın tüm siparişleri target session'a taşınır.
// Source session status='merged' olur ve kapanır.
// Her iki session da aynı merge_group_id'yi paylaşır (görsel için).
// 3+ masa birleştirilebilir: target'ın mevcut merge_group_id'si varsa o kullanılır.
// ----------------------------------------------------------------------------
export async function mergeSessions(params: {
  businessId: string;
  sourceSessionId: string;
  targetSessionId: string;
  actorId: string;
  actorName: string;
  actorType: 'admin' | 'waiter';
}) {
  const { businessId, sourceSessionId, targetSessionId, actorId, actorName, actorType } = params;

  if (sourceSessionId === targetSessionId) {
    throw new AppError('Kaynak ve hedef oturum aynı olamaz.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Source session'ı kilitle
    const sourceResult = await client.query(
      `SELECT s.*, t.name AS table_name
       FROM table_sessions s
       INNER JOIN tables t ON t.id = s.table_id
       WHERE s.id = $1 AND s.business_id = $2 AND s.status = 'open'
       FOR UPDATE`,
      [sourceSessionId, businessId]
    );

    if (sourceResult.rowCount !== 1) {
      throw new AppError('Kaynak oturum bulunamadı veya açık değil.', 404, APP_ERROR_CODES.NOT_FOUND);
    }

    // 2. Target session'ı kilitle
    const targetResult = await client.query(
      `SELECT s.*, t.name AS table_name
       FROM table_sessions s
       INNER JOIN tables t ON t.id = s.table_id
       WHERE s.id = $1 AND s.business_id = $2 AND s.status = 'open'
       FOR UPDATE`,
      [targetSessionId, businessId]
    );

    if (targetResult.rowCount !== 1) {
      throw new AppError('Hedef oturum bulunamadı veya açık değil.', 404, APP_ERROR_CODES.NOT_FOUND);
    }

    const source = sourceResult.rows[0];
    const target = targetResult.rows[0];

    // 3. merge_group_id belirle:
    //    Target'ta zaten varsa onu kullan (3+ masa birleştirme senaryosu)
    //    Yoksa yeni UUID üret
    const mergeGroupId: string = target.merge_group_id
      ?? source.merge_group_id
      ?? (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;

    // 4. Source'daki tüm siparişleri target session'a taşı
    await client.query(
      `UPDATE orders
       SET session_id = $1,
           table_name = $2,
           updated_at = NOW()
       WHERE session_id = $3 AND business_id = $4`,
      [targetSessionId, target.table_name, sourceSessionId, businessId]
    );

    // 5. cached_total'ı target'a ekle
    await client.query(
      `UPDATE table_sessions
       SET cached_total_int = cached_total_int + $1,
           merge_group_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [source.cached_total_int, mergeGroupId, targetSessionId]
    );

    // 6. Source session'ı 'merged' olarak kapat
    await client.query(
      `UPDATE table_sessions
       SET status = 'merged',
           closed_at = NOW(),
           merged_into_session_id = $1,
           merge_group_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [targetSessionId, mergeGroupId, sourceSessionId]
    );

    // 7. Audit log
    await logActivity(client, {
      businessId,
      waiterId: actorType === 'waiter' ? actorId : null,
      waiterName: actorName,
      action: 'tables_merged',
      targetType: 'session',
      targetId: targetSessionId,
      targetName: `${source.table_name} → ${target.table_name}`,
      metadata: {
        source_session_id: sourceSessionId,
        source_table_id: source.table_id,
        source_table_name: source.table_name,
        target_session_id: targetSessionId,
        target_table_id: target.table_id,
        target_table_name: target.table_name,
        merge_group_id: mergeGroupId,
        actor_type: actorType,
      },
    });

    await client.query('COMMIT');

    return {
      merge_group_id: mergeGroupId,
      source: { session_id: sourceSessionId, table_name: source.table_name, status: 'merged' },
      target: { session_id: targetSessionId, table_name: target.table_name, status: 'open' },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// 3. SİPARİŞ TRANSFERİ
// Seçili siparişleri (order_ids) başka bir session'a taşır.
// Hedef session açık olmalı. Kaynak session açık kalır (kalan siparişlerle).
// Tüm durumlardaki siparişler taşınabilir (cancelled hariç).
// ----------------------------------------------------------------------------
export async function transferOrders(params: {
  businessId: string;
  orderIds: string[];
  targetSessionId: string;
  actorId: string;
  actorName: string;
  actorType: 'admin' | 'waiter';
}) {
  const { businessId, orderIds, targetSessionId, actorId, actorName, actorType } = params;

  if (!orderIds.length) {
    throw new AppError('En az 1 sipariş seçmelisiniz.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Hedef session'ı kilitle ve kontrol et
    const targetResult = await client.query(
      `SELECT s.*, t.name AS table_name
       FROM table_sessions s
       INNER JOIN tables t ON t.id = s.table_id
       WHERE s.id = $1 AND s.business_id = $2 AND s.status = 'open'
       FOR UPDATE`,
      [targetSessionId, businessId]
    );

    if (targetResult.rowCount !== 1) {
      throw new AppError('Hedef oturum bulunamadı veya açık değil.', 404, APP_ERROR_CODES.NOT_FOUND);
    }

    const target = targetResult.rows[0];

    // 2. Taşınacak siparişleri kontrol et
    //    - Aynı işletmeye ait olmalı
    //    - cancelled OLMAMALI
    //    - Zaten hedef session'da OLMAMALI
    const ordersResult = await client.query(
      `SELECT o.id, o.session_id, o.status, o.table_name,
              s.table_id AS source_table_id,
              t.name AS source_table_name
       FROM orders o
       INNER JOIN table_sessions s ON s.id = o.session_id
       INNER JOIN tables t ON t.id = s.table_id
       WHERE o.id = ANY($1::uuid[])
         AND o.business_id = $2
         AND o.status != 'cancelled'
       FOR UPDATE OF o`,
      [orderIds, businessId]
    );

    if (ordersResult.rowCount !== orderIds.length) {
      throw new AppError(
        'Bazı siparişler bulunamadı, iptal edilmiş veya bu işletmeye ait değil.',
        400,
        APP_ERROR_CODES.BAD_REQUEST
      );
    }

    // Hedef session'a zaten ait sipariş var mı kontrol
    const alreadyInTarget = ordersResult.rows.filter(
      (o: any) => o.session_id === targetSessionId
    );
    if (alreadyInTarget.length > 0) {
      throw new AppError(
        'Seçili siparişlerden bazıları zaten hedef masada.',
        400,
        APP_ERROR_CODES.BAD_REQUEST
      );
    }

    const sourceTableName = ordersResult.rows[0]?.source_table_name ?? 'Bilinmiyor';

    // 3. Siparişleri taşı
    await client.query(
      `UPDATE orders
       SET session_id = $1,
           table_name = $2,
           updated_at = NOW()
       WHERE id = ANY($3::uuid[]) AND business_id = $4`,
      [targetSessionId, target.table_name, orderIds, businessId]
    );

    // 4. cached_total'ları güncelle
    //    Taşınan siparişlerin toplam tutarını hesapla
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(oi.price_int * oi.quantity), 0) AS total
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE o.id = ANY($1::uuid[]) AND o.status = 'delivered'`,
      [orderIds]
    );
    const movedTotal = parseInt(totalResult.rows[0].total, 10);

    if (movedTotal > 0) {
      // Source session'dan düş, target'a ekle
      // Source session_id'sini orderlar taşındıktan sonra artık bilmiyoruz,
      // ama orijinal siparişlerde vardı. İlk satırdan al (hepsi aynı session'daysa)
      const sourceSessionId = ordersResult.rows[0]?.session_id;
      if (sourceSessionId && sourceSessionId !== targetSessionId) {
        await client.query(
          `UPDATE table_sessions
           SET cached_total_int = GREATEST(cached_total_int - $1, 0),
               updated_at = NOW()
           WHERE id = $2`,
          [movedTotal, sourceSessionId]
        );
      }

      await client.query(
        `UPDATE table_sessions
         SET cached_total_int = cached_total_int + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [movedTotal, targetSessionId]
      );
    }

    // 5. Audit log
    await logActivity(client, {
      businessId,
      waiterId: actorType === 'waiter' ? actorId : null,
      waiterName: actorName,
      action: 'orders_transferred',
      targetType: 'session',
      targetId: targetSessionId,
      targetName: `${sourceTableName} → ${target.table_name}`,
      metadata: {
        order_ids: orderIds,
        order_count: orderIds.length,
        source_table_name: sourceTableName,
        target_session_id: targetSessionId,
        target_table_name: target.table_name,
        actor_type: actorType,
      },
    });

    await client.query('COMMIT');

    return {
      transferred_count: orderIds.length,
      target: { session_id: targetSessionId, table_name: target.table_name },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}