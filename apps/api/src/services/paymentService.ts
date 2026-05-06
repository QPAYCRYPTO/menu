// apps/api/src/services/paymentService.ts
// Ödeme işlemleri: item bazlı tahsilat, masa kapatma
// YENİ DOSYA — mevcut hiçbir dosyaya dokunulmadı
//
// Akış:
//   1. Admin ödeme ekranını açar → getSessionBillDetails() ile adisyonu çeker
//   2. Kişi kişi item seçer → payItems() ile tahsil eder (üzeri çizili olur)
//   3. Tüm itemlar ödendi → closeTableAfterPayment() ile masayı kapatır
//   4. Yeni sipariş geldiyse → getNewOrdersAfterPaymentStart() ile kontrol eder

import { pool } from '../db/postgres.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';

// ----------------------------------------------------------------------------
// TİPLER
// ----------------------------------------------------------------------------
export type BillItem = {
  item_id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  price_int: number;
  note: string | null;
  is_paid: boolean;
  paid_at: string | null;
  order_status: string;
  order_created_at: string;
};

export type BillSummary = {
  session_id: string;
  table_name: string;
  opened_at: string;
  merge_group_id: string | null;
  total_int: number;
  paid_int: number;
  remaining_int: number;
  items: BillItem[];
};

// ----------------------------------------------------------------------------
// 1. ADISYON DETAYI
// Ödeme ekranı açılınca session'daki tüm item'ları getirir.
// cancelled siparişler dahil edilmez.
// ----------------------------------------------------------------------------
export async function getSessionBillDetails(
  businessId: string,
  sessionId: string
): Promise<BillSummary> {
  // Session kontrol
  const sessionResult = await pool.query(
    `SELECT s.*, t.name AS table_name
     FROM table_sessions s
     INNER JOIN tables t ON t.id = s.table_id
     WHERE s.id = $1 AND s.business_id = $2
       AND s.status IN ('open', 'merged')`,
    [sessionId, businessId]
  );

  if (sessionResult.rowCount !== 1) {
    throw new AppError('Oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  const session = sessionResult.rows[0];

  // Tüm item'ları getir (cancelled order'lar hariç)
  const itemsResult = await pool.query(
    `SELECT
       oi.id           AS item_id,
       oi.order_id,
       oi.product_name,
       oi.quantity,
       oi.price_int,
       oi.note,
       oi.is_paid,
       oi.paid_at,
       o.status        AS order_status,
       o.created_at    AS order_created_at
     FROM orders o
     INNER JOIN order_items oi ON oi.order_id = o.id
     WHERE o.session_id = $1
       AND o.business_id = $2
       AND o.status != 'cancelled'
       AND o.type = 'order'
     ORDER BY o.created_at ASC, oi.created_at ASC`,
    [sessionId, businessId]
  );

  const items: BillItem[] = itemsResult.rows;

  // Toplamları hesapla
  const totalInt = items.reduce((sum, i) => sum + i.price_int * i.quantity, 0);
  const paidInt  = items
    .filter(i => i.is_paid)
    .reduce((sum, i) => sum + i.price_int * i.quantity, 0);

  return {
    session_id:     sessionId,
    table_name:     session.table_name,
    opened_at:      session.opened_at,
    merge_group_id: session.merge_group_id ?? null,
    total_int:      totalInt,
    paid_int:       paidInt,
    remaining_int:  totalInt - paidInt,
    items,
  };
}

// ----------------------------------------------------------------------------
// 2. ITEM TAHSİLATI
// Seçili item'ları ödendi olarak işaretle.
// Bir order'daki tüm item'lar ödendiyse orders.paid_at da güncellenir.
// ----------------------------------------------------------------------------
export async function payItems(params: {
  businessId: string;
  sessionId: string;
  itemIds: string[];
  paymentMethod: 'cash' | 'card' | 'other';
}): Promise<{
  paid_count: number;
  remaining_int: number;
  fully_paid_order_ids: string[];
}> {
  const { businessId, sessionId, itemIds, paymentMethod } = params;

  if (!itemIds.length) {
    throw new AppError('En az 1 ürün seçmelisiniz.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Session kontrolü
    const sessionResult = await client.query(
      `SELECT id FROM table_sessions
       WHERE id = $1 AND business_id = $2 AND status = 'open'
       FOR UPDATE`,
      [sessionId, businessId]
    );

    if (sessionResult.rowCount !== 1) {
      throw new AppError('Açık oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
    }

    // Item'ları kontrol et: aynı session'a ait, zaten ödenmemiş olmalı
    const itemsResult = await client.query(
      `SELECT oi.id, oi.order_id, oi.is_paid
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE oi.id = ANY($1::uuid[])
         AND o.session_id = $2
         AND o.business_id = $3
         AND o.status != 'cancelled'
       FOR UPDATE OF oi`,
      [itemIds, sessionId, businessId]
    );

    if (itemsResult.rowCount !== itemIds.length) {
      throw new AppError(
        'Bazı ürünler bulunamadı veya bu masaya ait değil.',
        400,
        APP_ERROR_CODES.BAD_REQUEST
      );
    }

    const alreadyPaid = itemsResult.rows.filter((i: any) => i.is_paid);
    if (alreadyPaid.length > 0) {
      throw new AppError(
        'Seçili ürünlerden bazıları zaten ödenmiş.',
        409,
        APP_ERROR_CODES.BAD_REQUEST
      );
    }

    // Item'ları öde
    await client.query(
      `UPDATE order_items
       SET is_paid = TRUE, paid_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [itemIds]
    );

    // Hangi order'ların tüm item'ları ödendi? → orders.paid_at doldur
    const affectedOrderIds = [...new Set(itemsResult.rows.map((i: any) => i.order_id))];

    const fullyPaidOrderIds: string[] = [];

    for (const orderId of affectedOrderIds) {
      const unpaidResult = await client.query(
        `SELECT COUNT(*) AS cnt
         FROM order_items
         WHERE order_id = $1 AND is_paid = FALSE`,
        [orderId]
      );
      const unpaidCount = parseInt(unpaidResult.rows[0].cnt, 10);

      if (unpaidCount === 0) {
        await client.query(
          `UPDATE orders
           SET paid_at = NOW(), payment_method = $1, updated_at = NOW()
           WHERE id = $2`,
          [paymentMethod, orderId]
        );
        fullyPaidOrderIds.push(orderId);
      }
    }

    // Kalan tutarı hesapla
    const remainingResult = await client.query(
      `SELECT COALESCE(SUM(oi.price_int * oi.quantity), 0) AS remaining
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       WHERE o.session_id = $1
         AND o.business_id = $2
         AND o.status != 'cancelled'
         AND oi.is_paid = FALSE`,
      [sessionId, businessId]
    );

    const remainingInt = parseInt(remainingResult.rows[0].remaining, 10);

    await client.query('COMMIT');

    return {
      paid_count: itemIds.length,
      remaining_int: remainingInt,
      fully_paid_order_ids: fullyPaidOrderIds,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// 3. MASA KAPATMA (ödeme sonrası)
// Tüm item'lar ödendikten sonra masayı kapatır.
// Ödenmemiş item varsa → 409 + kaç tane kaldığını döner.
// Birleşik masalar varsa (merge_group_id) hepsini kapatır.
// ----------------------------------------------------------------------------
export async function closeTableAfterPayment(params: {
  businessId: string;
  sessionId: string;
  closedBy: string;
  forceClose?: boolean; // true ise ödenmemiş item'lar olsa bile kapatır
}): Promise<{
  closed_session_ids: string[];
  unpaid_items_count: number;
  forced: boolean;
}> {
  const { businessId, sessionId, closedBy, forceClose = false } = params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Ana session'ı kilitle
    const sessionResult = await client.query(
      `SELECT * FROM table_sessions
       WHERE id = $1 AND business_id = $2 AND status = 'open'
       FOR UPDATE`,
      [sessionId, businessId]
    );

    if (sessionResult.rowCount !== 1) {
      throw new AppError('Açık oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
    }

    const session = sessionResult.rows[0];

    // Ödenmemiş item kontrolü
    const unpaidResult = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       WHERE o.session_id = $1
         AND o.business_id = $2
         AND o.status != 'cancelled'
         AND oi.is_paid = FALSE`,
      [sessionId, businessId]
    );

    const unpaidCount = parseInt(unpaidResult.rows[0].cnt, 10);

    if (unpaidCount > 0 && !forceClose) {
      await client.query('ROLLBACK');
      return {
        closed_session_ids: [],
        unpaid_items_count: unpaidCount,
        forced: false,
      };
    }

    // Kapatılacak session ID listesi
    // Birleşik masalar varsa (merge_group_id) ana session + merged olanlar
    let sessionIdsToClose: string[] = [sessionId];

    if (session.merge_group_id) {
      // merge_group_id'yi paylaşan diğer 'open' session'ları da kapat
      const groupResult = await client.query(
        `SELECT id FROM table_sessions
         WHERE merge_group_id = $1
           AND business_id = $2
           AND status = 'open'
           AND id != $3
         FOR UPDATE`,
        [session.merge_group_id, businessId, sessionId]
      );
      sessionIdsToClose = [
        ...sessionIdsToClose,
        ...groupResult.rows.map((r: any) => r.id),
      ];
    }

    // Tüm ilgili session'ları kapat
    await client.query(
      `UPDATE table_sessions
       SET status = 'closed',
           closed_at = NOW(),
           closed_by = $1,
           updated_at = NOW()
       WHERE id = ANY($2::uuid[])
         AND business_id = $3`,
      [closedBy, sessionIdsToClose, businessId]
    );

    await client.query('COMMIT');

    return {
      closed_session_ids: sessionIdsToClose,
      unpaid_items_count: unpaidCount,
      forced: forceClose,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// 4. YENİ SİPARİŞ KONTROLÜ
// Ödeme ekranı açıkken yeni sipariş geldi mi kontrol eder.
// SSE yerine admin "Yenile" veya polling ile çağırır.
// payment_start_at: admin ödeme ekranını açtığı an (frontend tutar, bize gönderir)
// ----------------------------------------------------------------------------
export async function getNewOrdersSincePaymentStart(
  businessId: string,
  sessionId: string,
  paymentStartAt: string
): Promise<{
  new_orders_count: number;
  new_orders: { id: string; table_name: string; created_at: string }[];
}> {
  const result = await pool.query(
    `SELECT id, table_name, created_at
     FROM orders
     WHERE session_id = $1
       AND business_id = $2
       AND type = 'order'
       AND status != 'cancelled'
       AND created_at > $3::timestamptz
     ORDER BY created_at ASC`,
    [sessionId, businessId, paymentStartAt]
  );

  return {
    new_orders_count: result.rowCount ?? 0,
    new_orders: result.rows,
  };
}