// apps/api/src/services/paymentLedgerService.ts
// Kasa Aşama 2 — ödeme kaydı (payments) ve indirim/ikram (discounts)
//
//   Toplam  = hesaptaki (iptal edilmemiş) kalemlerin toplamı
//   İndirim = iptal edilmemiş indirim + ikram kayıtları
//   Ödenen  = iptal edilmemiş ödemeler
//   Kalan   = Toplam − İndirim − Ödenen
//
// Ürün seçerek ödeme: kalemler order_items.is_paid ile işaretlenir, ödeme kaydı item_ids'i tutar
// (ödeme iptal edilince işaret geri alınır). Tutarla ödeme kalem işaretlemez.

import type { PoolClient } from 'pg';
import { pool } from '../db/postgres.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { getSessionBillDetails, type BillItem } from './paymentService.js';

export type PaymentMethodKey = 'cash' | 'card' | 'meal_card';

type Queryable = Pick<PoolClient, 'query'>;

export type Ledger = { total_int: number; discount_int: number; paid_int: number; remaining_int: number };

/** Hesabın toplam / indirim / ödenen / kalan tutarları (tek sorgu). */
export async function computeLedger(db: Queryable, businessId: string, sessionId: string): Promise<Ledger> {
  const r = await db.query(
    `SELECT
       (SELECT COALESCE(SUM(oi.price_int * oi.quantity), 0)
          FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.session_id = $1 AND o.business_id = $2 AND o.type = 'order' AND o.status <> 'cancelled')::int AS total_int,
       (SELECT COALESCE(SUM(amount_int), 0) FROM discounts
         WHERE session_id = $1 AND business_id = $2 AND voided_at IS NULL)::int AS discount_int,
       (SELECT COALESCE(SUM(amount_int), 0) FROM payments
         WHERE session_id = $1 AND business_id = $2 AND voided_at IS NULL)::int AS paid_int`,
    [sessionId, businessId]
  );
  const { total_int, discount_int, paid_int } = r.rows[0];
  return { total_int, discount_int, paid_int, remaining_int: total_int - discount_int - paid_int };
}

async function lockOpenSession(client: PoolClient, businessId: string, sessionId: string) {
  const r = await client.query(
    `SELECT id FROM table_sessions WHERE id = $1 AND business_id = $2 AND status = 'open' FOR UPDATE`,
    [sessionId, businessId]
  );
  if (r.rowCount !== 1) throw new AppError('Açık hesap bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
}

async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** İkram edilmiş (iptal edilmemiş, kalem bazlı) kalemler */
async function complimentaryItemIds(db: Queryable, businessId: string, sessionId: string): Promise<Set<string>> {
  const r = await db.query(
    `SELECT order_item_id FROM discounts
     WHERE session_id = $1 AND business_id = $2 AND voided_at IS NULL
       AND applies_to = 'item' AND order_item_id IS NOT NULL`,
    [sessionId, businessId]
  );
  return new Set(r.rows.map((x: any) => x.order_item_id));
}

// ─────────────────────────────────────────────────────────────────────────────
// ÖZET: adisyon + ödemeler + indirimler + tutarlar
// ─────────────────────────────────────────────────────────────────────────────
export type SummaryItem = BillItem & { is_complimentary: boolean };

export async function getSessionSummary(businessId: string, sessionId: string) {
  // Birleşik masada zincirin sonundaki açık hesap (getSessionBillDetails çözer)
  const bill = await getSessionBillDetails(businessId, sessionId);
  const sid = bill.session_id;

  const [ledger, payments, discounts] = await Promise.all([
    computeLedger(pool, businessId, sid),
    pool.query(
      `SELECT p.id, p.amount_int, p.method, p.note, p.created_at, cardinality(p.item_ids) AS item_count,
              p.voided_at, p.void_reason,
              cu.email AS collected_by_email, vu.email AS voided_by_email
       FROM payments p
       LEFT JOIN users cu ON cu.id = p.collected_by
       LEFT JOIN users vu ON vu.id = p.voided_by
       WHERE p.session_id = $1 AND p.business_id = $2
       ORDER BY p.created_at ASC`,
      [sid, businessId]
    ),
    pool.query(
      `SELECT d.id, d.type, d.amount_int, d.percent, d.applies_to, d.order_item_id, d.note, d.created_at,
              oi.product_name, oi.quantity AS item_quantity, u.email AS created_by_email
       FROM discounts d
       LEFT JOIN order_items oi ON oi.id = d.order_item_id
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.session_id = $1 AND d.business_id = $2 AND d.voided_at IS NULL
       ORDER BY d.created_at ASC`,
      [sid, businessId]
    )
  ]);

  const comp = new Set(discounts.rows.filter((d: any) => d.applies_to === 'item' && d.order_item_id).map((d: any) => d.order_item_id));
  const items: SummaryItem[] = bill.items.map(i => ({ ...i, is_complimentary: comp.has(i.item_id) }));

  return {
    session_id: sid,
    table_name: bill.table_name,
    opened_at: bill.opened_at,
    merge_group_id: bill.merge_group_id,
    ...ledger,
    items,
    payments: payments.rows,
    discounts: discounts.rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAHSİLAT
// ─────────────────────────────────────────────────────────────────────────────
export async function createPayment(params: {
  businessId: string;
  sessionId: string;
  userId: string;
  amountInt?: number;
  method: PaymentMethodKey;
  note?: string | null;
  itemIds?: string[];
}) {
  const { businessId, sessionId, userId, method, note = null } = params;
  const itemIds = [...new Set(params.itemIds ?? [])];

  return withTx(async client => {
    await lockOpenSession(client, businessId, sessionId);
    const before = await computeLedger(client, businessId, sessionId);
    if (before.remaining_int <= 0) {
      throw new AppError('Bu hesabın ödenecek tutarı kalmadı.', 409, APP_ERROR_CODES.BAD_REQUEST);
    }

    let amount = params.amountInt ?? 0;
    const fullyPaidOrderIds: string[] = [];

    if (itemIds.length > 0) {
      // Ürün seçerek ödeme: kalemler bu hesaba ait, ödenmemiş ve ikram edilmemiş olmalı
      const items = await client.query(
        `SELECT oi.id, oi.order_id, oi.is_paid, oi.price_int * oi.quantity AS line_int
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = ANY($1::uuid[]) AND o.session_id = $2 AND o.business_id = $3
           AND o.status <> 'cancelled' AND o.type = 'order'
         FOR UPDATE OF oi`,
        [itemIds, sessionId, businessId]
      );
      if (items.rowCount !== itemIds.length) {
        throw new AppError('Bazı ürünler bulunamadı veya bu masaya ait değil.', 400, APP_ERROR_CODES.BAD_REQUEST);
      }
      if (items.rows.some((i: any) => i.is_paid)) {
        throw new AppError('Seçili ürünlerden bazıları zaten ödenmiş.', 409, APP_ERROR_CODES.BAD_REQUEST);
      }
      const comp = await complimentaryItemIds(client, businessId, sessionId);
      if (items.rows.some((i: any) => comp.has(i.id))) {
        throw new AppError('Seçili ürünlerden biri ikram edilmiş.', 409, APP_ERROR_CODES.BAD_REQUEST);
      }
      // İndirim varsa kalan, kalemlerin toplamından az olabilir → kalanla sınırla
      const itemsTotal = items.rows.reduce((s: number, i: any) => s + Number(i.line_int), 0);
      amount = Math.min(itemsTotal, before.remaining_int);

      await client.query(`UPDATE order_items SET is_paid = TRUE, paid_at = NOW() WHERE id = ANY($1::uuid[])`, [itemIds]);
      const legacyMethod = method === 'meal_card' ? 'other' : method;
      const orderIds = [...new Set(items.rows.map((i: any) => i.order_id))];
      const done = await client.query(
        `UPDATE orders o SET paid_at = NOW(), payment_method = $1, updated_at = NOW()
         WHERE o.id = ANY($2::uuid[])
           AND NOT EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.is_paid = FALSE)
         RETURNING o.id`,
        [legacyMethod, orderIds]
      );
      fullyPaidOrderIds.push(...done.rows.map((r: any) => r.id));
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppError('Geçerli bir tutar girin.', 400, APP_ERROR_CODES.BAD_REQUEST);
    }
    if (amount > before.remaining_int) {
      throw new AppError('Tutar kalan hesaptan fazla olamaz.', 409, APP_ERROR_CODES.BAD_REQUEST);
    }

    const ins = await client.query(
      `INSERT INTO payments (business_id, session_id, amount_int, method, note, item_ids, collected_by)
       VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7)
       RETURNING id, amount_int, method, note, created_at, cardinality(item_ids) AS item_count`,
      [businessId, sessionId, amount, method, note, itemIds, userId]
    );
    const ledger = await computeLedger(client, businessId, sessionId);
    return { payment: ins.rows[0], ledger, fully_paid_order_ids: fullyPaidOrderIds };
  });
}

export async function voidPayment(params: { businessId: string; paymentId: string; userId: string; reason: string }) {
  const { businessId, paymentId, userId, reason } = params;
  return withTx(async client => {
    const r = await client.query(
      `SELECT p.id, p.session_id, p.item_ids, p.voided_at, s.status AS session_status
       FROM payments p JOIN table_sessions s ON s.id = p.session_id
       WHERE p.id = $1 AND p.business_id = $2
       FOR UPDATE OF p`,
      [paymentId, businessId]
    );
    const p = r.rows[0];
    if (!p) throw new AppError('Ödeme bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
    if (p.voided_at) throw new AppError('Bu ödeme zaten iptal edilmiş.', 409, APP_ERROR_CODES.BAD_REQUEST);
    if (p.session_status !== 'open') {
      throw new AppError('Kapanmış hesabın ödemesi iptal edilemez.', 409, APP_ERROR_CODES.BAD_REQUEST);
    }

    await client.query(
      `UPDATE payments SET voided_at = NOW(), voided_by = $1, void_reason = $2 WHERE id = $3`,
      [userId, reason, paymentId]
    );
    if (p.item_ids?.length) {
      await client.query(`UPDATE order_items SET is_paid = FALSE, paid_at = NULL WHERE id = ANY($1::uuid[])`, [p.item_ids]);
      await client.query(
        `UPDATE orders SET paid_at = NULL, payment_method = NULL, updated_at = NOW()
         WHERE id IN (SELECT order_id FROM order_items WHERE id = ANY($1::uuid[]))`,
        [p.item_ids]
      );
    }
    return { session_id: p.session_id as string, ledger: await computeLedger(client, businessId, p.session_id) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// İNDİRİM / İKRAM
// ─────────────────────────────────────────────────────────────────────────────
export async function createDiscount(params: {
  businessId: string;
  sessionId: string;
  userId: string;
  type: 'discount' | 'complimentary';
  appliesTo: 'session' | 'item';
  amountInt?: number;
  percent?: number;
  orderItemId?: string;
  note?: string | null;
}) {
  const { businessId, sessionId, userId, type, appliesTo, percent, orderItemId } = params;
  const note = params.note?.trim() || null;
  if (type === 'complimentary' && !note) {
    throw new AppError('İkram için not zorunlu (kim onayladı?).', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  return withTx(async client => {
    await lockOpenSession(client, businessId, sessionId);
    const ledger = await computeLedger(client, businessId, sessionId);
    if (ledger.remaining_int <= 0) {
      throw new AppError('Bu hesabın ödenecek tutarı kalmadı.', 409, APP_ERROR_CODES.BAD_REQUEST);
    }

    let base: number;
    if (appliesTo === 'item') {
      if (!orderItemId) throw new AppError('Ürün seçin.', 400, APP_ERROR_CODES.BAD_REQUEST);
      const it = await client.query(
        `SELECT oi.id, oi.is_paid, oi.price_int * oi.quantity AS line_int
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = $1 AND o.session_id = $2 AND o.business_id = $3 AND o.status <> 'cancelled' AND o.type = 'order'`,
        [orderItemId, sessionId, businessId]
      );
      const item = it.rows[0];
      if (!item) throw new AppError('Ürün bu hesapta bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
      if (item.is_paid) throw new AppError('Ödenmiş ürüne indirim/ikram uygulanamaz.', 409, APP_ERROR_CODES.BAD_REQUEST);
      const comp = await complimentaryItemIds(client, businessId, sessionId);
      if (comp.has(orderItemId)) throw new AppError('Bu ürüne zaten indirim/ikram uygulanmış.', 409, APP_ERROR_CODES.BAD_REQUEST);
      base = Number(item.line_int);
    } else {
      // Hesap geneli: indirimler düşülmüş (henüz ödenmemiş kısım dahil) tutar üzerinden
      base = ledger.total_int - ledger.discount_int;
    }

    let amount: number;
    if (type === 'complimentary') {
      // İkram: ürünün tamamı ya da kalan hesabın tamamı
      amount = appliesTo === 'item' ? base : ledger.remaining_int;
    } else if (percent != null) {
      amount = Math.round((base * percent) / 100);
    } else {
      amount = params.amountInt ?? 0;
    }
    amount = Math.min(amount, ledger.remaining_int);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppError('Geçerli bir indirim tutarı girin.', 400, APP_ERROR_CODES.BAD_REQUEST);
    }
    if (appliesTo === 'item' && amount > base) {
      throw new AppError('İndirim ürün tutarından fazla olamaz.', 400, APP_ERROR_CODES.BAD_REQUEST);
    }

    const ins = await client.query(
      `INSERT INTO discounts (business_id, session_id, type, amount_int, percent, applies_to, order_item_id, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, type, amount_int, percent, applies_to, order_item_id, note, created_at`,
      [businessId, sessionId, type, amount, type === 'discount' ? percent ?? null : null, appliesTo,
        appliesTo === 'item' ? orderItemId : null, note, userId]
    );
    return { discount: ins.rows[0], ledger: await computeLedger(client, businessId, sessionId) };
  });
}

export async function voidDiscount(params: { businessId: string; discountId: string; userId: string }) {
  const { businessId, discountId, userId } = params;
  return withTx(async client => {
    const r = await client.query(
      `SELECT d.id, d.session_id, d.voided_at, s.status AS session_status
       FROM discounts d JOIN table_sessions s ON s.id = d.session_id
       WHERE d.id = $1 AND d.business_id = $2
       FOR UPDATE OF d`,
      [discountId, businessId]
    );
    const d = r.rows[0];
    if (!d || d.voided_at) throw new AppError('İndirim bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
    if (d.session_status !== 'open') {
      throw new AppError('Kapanmış hesabın indirimi kaldırılamaz.', 409, APP_ERROR_CODES.BAD_REQUEST);
    }
    await client.query(`UPDATE discounts SET voided_at = NOW(), voided_by = $1 WHERE id = $2`, [userId, discountId]);
    return { session_id: d.session_id as string, ledger: await computeLedger(client, businessId, d.session_id) };
  });
}
