// apps/api/src/services/paymentService.ts
// Ödeme işlemleri: item bazlı tahsilat, masa kapatma
// YENİ DOSYA — mevcut hiçbir dosyaya dokunulmadı
//
// Akış:
//   1. Admin ödeme ekranını açar → getSessionBillDetails() ile adisyonu çeker
//   2. Tahsilat: paymentLedgerService.createPayment() (ürün seçerek ya da tutarla; payments tablosu)
//   3. Tüm itemlar ödendi → closeTableAfterPayment() ile masayı kapatır
//   4. Yeni sipariş geldiyse → getNewOrdersAfterPaymentStart() ile kontrol eder

import { pool } from '../db/postgres.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { findActiveSessionById } from './sessionService.js';
import { computeLedger } from './paymentLedgerService.js';

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
  // Merged session verildiyse zincirin sonundaki açık session'ın adisyonu gösterilir
  const active = await findActiveSessionById(businessId, sessionId);
  if (!active) {
    throw new AppError('Oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  // Session kontrol
  const sessionResult = await pool.query(
    `SELECT s.*, t.name AS table_name
     FROM table_sessions s
     INNER JOIN tables t ON t.id = s.table_id
     WHERE s.id = $1 AND s.business_id = $2
       AND s.status = 'open'`,
    [active.id, businessId]
  );

  if (sessionResult.rowCount !== 1) {
    throw new AppError('Oturum bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  const session = sessionResult.rows[0];
  sessionId = session.id;

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
// 3. MASA KAPATMA (ödeme sonrası)
// Tüm item'lar ödendikten sonra masayı kapatır.
// Ödenmemiş item varsa → 409 + kaç tane kaldığını döner.
// Birleşik masalar varsa (merge_group_id) hepsini kapatır.
// ----------------------------------------------------------------------------
export type OpenOrderDecision = 'customer_left' | 'no_payment';

// Ödenmemiş ürünü olan, henüz teslim edilmemiş sipariş (kapatmadan önce karar ister)
export type OpenOrderRequiringDecision = {
  order_id: string;
  table_name: string;
  status: string;
  created_at: string;
  unpaid_total_int: number;
  items: { product_name: string; quantity: number; is_paid: boolean }[];
};

const OPEN_ORDER_CANCEL_REASONS: Record<OpenOrderDecision, string> = {
  customer_left: 'customer_left: Masa kapatılırken iptal edildi',
  no_payment: 'no_payment: Masa kapatılırken zayi sayıldı',
};

export async function closeTableAfterPayment(params: {
  businessId: string;
  sessionId: string;
  closedBy: string;
  forceClose?: boolean; // true ise ödenmemiş item'lar olsa bile kapatır
  // forceClose'da ödenmemiş açık (pending/preparing/ready) siparişlerin her biri için karar zorunlu
  openOrderDecisions?: { order_id: string; decision: OpenOrderDecision }[];
}): Promise<{
  closed_session_ids: string[];
  unpaid_items_count: number;
  remaining_int: number;
  forced: boolean;
  open_orders_requiring_decision: OpenOrderRequiringDecision[];
  cancelled_orders: { order_id: string; table_name: string; reason: string }[];
}> {
  const { businessId, sessionId, closedBy, forceClose = false, openOrderDecisions = [] } = params;
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

    // Ödenmemiş tutar kontrolü (Kasa Aşama 2): kalan = toplam − indirim − ödemeler.
    // Kalan varsa ödenmemiş (ikram edilmemiş) kalem sayısı bilgi olarak döner.
    const ledger = await computeLedger(client, businessId, sessionId);
    let unpaidCount = 0;
    if (ledger.remaining_int > 0) {
      const unpaidResult = await client.query(
        `SELECT COUNT(*) AS cnt
         FROM orders o
         INNER JOIN order_items oi ON oi.order_id = o.id
         WHERE o.session_id = $1
           AND o.business_id = $2
           AND o.status != 'cancelled'
           AND o.type = 'order'
           AND oi.is_paid = FALSE
           AND NOT EXISTS (SELECT 1 FROM discounts d WHERE d.order_item_id = oi.id AND d.voided_at IS NULL)`,
        [sessionId, businessId]
      );
      unpaidCount = Math.max(parseInt(unpaidResult.rows[0].cnt, 10), 1);
    }

    // Kalan tutar sıfırlanmadan (tahsilat / ikram / indirim) hesap kapanmaz — forceClose bunu aşamaz;
    // forceClose yalnızca teslim edilmemiş siparişler için verilen kararları uygular.
    if (unpaidCount > 0) {
      await client.query('ROLLBACK');
      return {
        closed_session_ids: [],
        unpaid_items_count: unpaidCount,
        remaining_int: ledger.remaining_int,
        forced: false,
        open_orders_requiring_decision: [],
        cancelled_orders: [],
      };
    }

    // Ödenmemiş ürünü olan açık siparişler: kapalı masada mutfakta takılı kalmasınlar.
    // Her biri için "İptal Et" (customer_left) veya "Zayi Say" (no_payment) kararı zorunlu.
    // Önce kilitle (mutfak bu arada durum değiştiremesin), sonra detayı çek.
    await client.query(
      `SELECT id FROM orders
       WHERE session_id = $1 AND business_id = $2
         AND type = 'order' AND status IN ('pending', 'preparing', 'ready')
       FOR UPDATE`,
      [sessionId, businessId]
    );

    const openOrdersResult = await client.query(
      `SELECT
         o.id AS order_id, o.table_name, o.status, o.created_at,
         COALESCE(SUM(oi.price_int * oi.quantity) FILTER (WHERE oi.is_paid = FALSE), 0)::int AS unpaid_total_int,
         COALESCE(
           json_agg(
             json_build_object('product_name', oi.product_name, 'quantity', oi.quantity, 'is_paid', oi.is_paid)
             ORDER BY oi.created_at
           ) FILTER (WHERE oi.id IS NOT NULL),
           '[]'
         ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.session_id = $1 AND o.business_id = $2
         AND o.type = 'order' AND o.status IN ('pending', 'preparing', 'ready')
       GROUP BY o.id
       HAVING BOOL_OR(oi.is_paid = FALSE) OR COUNT(oi.id) = 0
       ORDER BY o.created_at ASC`,
      [sessionId, businessId]
    );
    const openOrders: OpenOrderRequiringDecision[] = openOrdersResult.rows;

    const decisionByOrder = new Map(openOrderDecisions.map(d => [d.order_id, d.decision]));
    if (openOrders.some(o => !decisionByOrder.has(o.order_id))) {
      // Karar eksik → hiçbir şey değişmez, liste admin'e döner
      await client.query('ROLLBACK');
      return {
        closed_session_ids: [],
        unpaid_items_count: unpaidCount,
        remaining_int: ledger.remaining_int,
        forced: false,
        open_orders_requiring_decision: openOrders,
        cancelled_orders: [],
      };
    }

    // Kararları uygula (teslim edilmemiş siparişler → cached_total_int'e hiç eklenmemişti, düşülecek bir şey yok)
    const cancelledOrders: { order_id: string; table_name: string; reason: string }[] = [];
    for (const order of openOrders) {
      const reason = OPEN_ORDER_CANCEL_REASONS[decisionByOrder.get(order.order_id)!];
      await client.query(
        `UPDATE orders
         SET status = 'cancelled',
             cancelled_at = NOW(),
             cancelled_by = $1,
             cancel_reason = $2,
             updated_at = NOW()
         WHERE id = $3 AND business_id = $4`,
        [closedBy, reason, order.order_id, businessId]
      );
      cancelledOrders.push({ order_id: order.order_id, table_name: order.table_name, reason });
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

    // Bu session'lara birleştirilmiş (merged) kaynak masaları da kapat.
    // Zincir (A → B → C) recursive izlenir; merge_group_id zincirde farklı olabildiği için
    // grup yerine merged_into_session_id kullanılır. closed_at birleştirme anı olarak korunur.
    const mergedClosed = await client.query(
      `WITH RECURSIVE feeders AS (
         SELECT id FROM table_sessions
         WHERE business_id = $1 AND status = 'merged'
           AND merged_into_session_id = ANY($2::uuid[])
         UNION
         SELECT s.id FROM table_sessions s
         INNER JOIN feeders f ON s.merged_into_session_id = f.id
         WHERE s.business_id = $1 AND s.status = 'merged'
       )
       UPDATE table_sessions
       SET status = 'closed',
           closed_by = $3,
           updated_at = NOW()
       WHERE id IN (SELECT id FROM feeders)
       RETURNING id`,
      [businessId, sessionIdsToClose, closedBy]
    );
    sessionIdsToClose = [
      ...sessionIdsToClose,
      ...mergedClosed.rows.map((r: any) => r.id),
    ];

    await client.query('COMMIT');

    return {
      closed_session_ids: sessionIdsToClose,
      unpaid_items_count: unpaidCount,
      remaining_int: ledger.remaining_int,
      forced: forceClose,
      open_orders_requiring_decision: [],
      cancelled_orders: cancelledOrders,
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