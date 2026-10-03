// apps/api/src/services/orderHistoryService.ts
// Siparişler → Geçmiş: MASA (adisyon) bazlı. Bir satır = hesabı kapatılmış bir masa oturumu
// (table_sessions.status = 'closed'); o masada verilen bütün siparişler tek satırda toplanır.
//
// - No: işletmede o günün (İstanbul saati) kaçıncı kapanan hesabı — kapanış saatine göre.
// - Brüt  = teslim edilen siparişlerin kalemleri (kasa ile aynı kural)
//   İndirim / İkram = iptal edilmemiş indirim kayıtları; Net = Brüt − İndirim − İkram
//   Tahsilat = iptal edilmemiş ödemeler (yönteme göre)
// - İptal = mutfak başlamadan iptal edilen sipariş. İade = mutfak başladıktan sonra iptal edilen
//   sipariş (preparing_at dolu ya da onaylı iade talebi) + mutfak başladıktan sonra iptal edilen kalemler.
// - Birleştirilen masaların (status='merged') siparişleri hedef hesaba taşındığı için ayrı satır olmaz.
// - Henüz kapanmamış masalar burada yer almaz (Kasa / Siparişler ekranındadır).
import ExcelJS from 'exceljs';
import { pool } from '../db/postgres.js';

export type HistoryStatus = 'all' | 'cancelled' | 'refunded' | 'discounted';

export type HistoryFilters = {
  from: string;          // ISO tarih-saat (dahil) — kapanış saatine göre
  to: string;            // ISO tarih-saat (hariç)
  status: HistoryStatus;
  tableId?: string;
  waiterId?: string;     // personel id ya da 'customer' (müşteri QR siparişi olan hesaplar)
  q?: string;            // ürün adı ya da masa
};

export type HistoryItem = { product_name: string; price_int: number; quantity: number };

export type HistoryRow = {
  id: string;            // table_sessions.id
  no: number;
  table_id: string | null;
  table_name: string;
  opened_at: string;
  closed_at: string;
  auto_closed: boolean;
  closed_by_email: string | null;
  order_count: number;
  item_count: number;
  gross_int: number;
  discount_int: number;
  complimentary_int: number;
  net_int: number;
  paid_int: number;
  cash_int: number;
  card_int: number;
  meal_card_int: number;
  cancel_count: number;
  cancelled_int: number;
  refund_count: number;
  refund_int: number;
  staff: string[];        // siparişi alan personel (müşteri QR ise 'Müşteri (QR)')
  items: HistoryItem[];   // teslim edilen kalemler, ürün + fiyata göre birleştirilmiş
};

export type HistorySummary = {
  count: number;
  gross_int: number;
  discount_int: number;
  complimentary_int: number;
  net_int: number;
  paid_int: number;
  cancel_count: number;
  cancelled_int: number;
  refund_count: number;
  refund_int: number;
  avg_stay_min: number | null;
};

const TZ = 'Europe/Istanbul';

export const REASON_LABELS: Record<string, string> = {
  customer_cancelled: 'Müşteri vazgeçti',
  customer_left: 'Müşteri gitti',
  not_claimed: 'Hazır ama alıcı yok',
  no_payment: 'Ödemeden gitti',
  wrong_order: 'Yanlış sipariş',
  out_of_stock: 'Stok yok',
  other: 'Diğer'
};

export function reasonLabel(raw: string | null): string {
  if (!raw) return '';
  const [code, ...rest] = raw.split(':');
  const label = REASON_LABELS[code.trim()];
  if (!label) return raw;
  const text = rest.join(':').trim();
  return text ? `${label} — ${text}` : label;
}

/** Sipariş iade mi (mutfak başladıktan sonra iptal)? `o` = orders takma adı */
const IS_REFUND_SQL = `(o.status = 'cancelled' AND (
  o.preparing_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM order_change_requests r
    WHERE r.order_id = o.id AND r.kind = 'order_cancel' AND r.status = 'approved')))`;

/**
 * `base`: aralıkta kapanan hesaplar (numara filtreden önce verilir).
 * `stats`: her hesabın tutarları ve sayıları. `filtered`: filtre uygulanmış hali.
 */
function buildQuery(businessId: string, f: HistoryFilters) {
  const params: unknown[] = [businessId, f.from, f.to];
  const where: string[] = [`s.closed_at >= $2::timestamptz`];

  if (f.status === 'cancelled') where.push(`s.cancel_count > 0`);
  if (f.status === 'refunded') where.push(`s.refund_count > 0`);
  if (f.status === 'discounted') where.push(`(s.discount_int + s.complimentary_int) > 0`);
  if (f.tableId) { params.push(f.tableId); where.push(`s.table_id = $${params.length}`); }
  if (f.waiterId === 'customer') {
    where.push(`EXISTS (SELECT 1 FROM orders o WHERE o.session_id = s.id AND o.type = 'order' AND o.waiter_id IS NULL)`);
  } else if (f.waiterId) {
    params.push(f.waiterId);
    where.push(`EXISTS (SELECT 1 FROM orders o WHERE o.session_id = s.id AND o.type = 'order' AND o.waiter_id = $${params.length})`);
  }
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, m => '\\' + m)}%`);
    const p = `$${params.length}`;
    where.push(`(s.table_name ILIKE ${p} OR EXISTS (
      SELECT 1 FROM orders o JOIN order_items x ON x.order_id = o.id
      WHERE o.session_id = s.id AND o.type = 'order' AND x.product_name ILIKE ${p}))`);
  }

  // Numaralandırma: aralığın ilk gününün başından itibaren (İstanbul günü)
  const cte = `
    WITH base AS (
      SELECT ts.id, ts.table_id, ts.opened_at, ts.closed_at, ts.closed_by, ts.auto_closed,
             ROW_NUMBER() OVER (
               PARTITION BY (ts.closed_at AT TIME ZONE '${TZ}')::date
               ORDER BY ts.closed_at, ts.id
             )::int AS no
      FROM table_sessions ts
      WHERE ts.business_id = $1 AND ts.status = 'closed' AND ts.closed_at IS NOT NULL
        AND ts.closed_at >= ((($2::timestamptz AT TIME ZONE '${TZ}')::date)::timestamp AT TIME ZONE '${TZ}')
        AND ts.closed_at < $3::timestamptz
    ),
    stats AS (
      SELECT b.*, COALESCE(t.name, '—') AS table_name, u.email AS closed_by_email,
             og.order_count, og.gross_int, og.item_count, og.cancel_count, og.cancelled_int,
             og.refund_order_count + ic.cnt AS refund_count, og.refund_order_int + ic.amount AS refund_int,
             dc.discount_int, dc.complimentary_int, pm.paid_int, pm.cash_int, pm.card_int, pm.meal_card_int
      FROM base b
      LEFT JOIN tables t ON t.id = b.table_id AND t.business_id = $1
      LEFT JOIN users u ON u.id = b.closed_by
      CROSS JOIN LATERAL (
        SELECT COUNT(DISTINCT o.id)::int AS order_count,
               COALESCE(SUM(oi.quantity * oi.price_int) FILTER (WHERE o.status = 'delivered'), 0)::int AS gross_int,
               COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'delivered'), 0)::int AS item_count,
               COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled' AND NOT ${IS_REFUND_SQL})::int AS cancel_count,
               COALESCE(SUM(oi.quantity * oi.price_int) FILTER (WHERE o.status = 'cancelled' AND NOT ${IS_REFUND_SQL}), 0)::int AS cancelled_int,
               COUNT(DISTINCT o.id) FILTER (WHERE ${IS_REFUND_SQL})::int AS refund_order_count,
               COALESCE(SUM(oi.quantity * oi.price_int) FILTER (WHERE ${IS_REFUND_SQL}), 0)::int AS refund_order_int
        FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.session_id = b.id AND o.business_id = $1 AND o.type = 'order'
      ) og
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt, COALESCE(SUM(c.quantity * c.price_int), 0)::int AS amount
        FROM order_item_cancellations c JOIN orders o ON o.id = c.order_id
        WHERE o.session_id = b.id AND o.business_id = $1 AND NOT c.whole_order
      ) ic
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(amount_int) FILTER (WHERE type = 'discount'), 0)::int AS discount_int,
               COALESCE(SUM(amount_int) FILTER (WHERE type = 'complimentary'), 0)::int AS complimentary_int
        FROM discounts WHERE session_id = b.id AND business_id = $1 AND voided_at IS NULL
      ) dc
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(amount_int), 0)::int AS paid_int,
               COALESCE(SUM(amount_int) FILTER (WHERE method = 'cash'), 0)::int AS cash_int,
               COALESCE(SUM(amount_int) FILTER (WHERE method = 'card'), 0)::int AS card_int,
               COALESCE(SUM(amount_int) FILTER (WHERE method = 'meal_card'), 0)::int AS meal_card_int
        FROM payments WHERE session_id = b.id AND business_id = $1 AND voided_at IS NULL
      ) pm
    ),
    filtered AS (
      SELECT s.* FROM stats s WHERE ${where.join(' AND ')}
    )`;
  return { cte, params };
}

export async function getOrderHistory(
  businessId: string, f: HistoryFilters, page: number, pageSize: number
): Promise<{ rows: HistoryRow[]; total: number; summary: HistorySummary }> {
  const { cte, params } = buildQuery(businessId, f);

  const summaryResult = await pool.query(
    `${cte}
     SELECT COUNT(*)::int AS count,
            COALESCE(SUM(gross_int), 0)::int AS gross_int,
            COALESCE(SUM(discount_int), 0)::int AS discount_int,
            COALESCE(SUM(complimentary_int), 0)::int AS complimentary_int,
            COALESCE(SUM(gross_int - discount_int - complimentary_int), 0)::int AS net_int,
            COALESCE(SUM(paid_int), 0)::int AS paid_int,
            COALESCE(SUM(cancel_count), 0)::int AS cancel_count,
            COALESCE(SUM(cancelled_int), 0)::int AS cancelled_int,
            COALESCE(SUM(refund_count), 0)::int AS refund_count,
            COALESCE(SUM(refund_int), 0)::int AS refund_int,
            ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 60))::int AS avg_stay_min
     FROM filtered`,
    params
  );

  const rowsResult = await pool.query(
    `${cte}
     SELECT f.id, f.no, f.table_id, f.table_name, f.opened_at, f.closed_at, f.auto_closed, f.closed_by_email,
            f.order_count, f.item_count, f.gross_int, f.discount_int, f.complimentary_int,
            (f.gross_int - f.discount_int - f.complimentary_int)::int AS net_int,
            f.paid_int, f.cash_int, f.card_int, f.meal_card_int,
            f.cancel_count, f.cancelled_int, f.refund_count, f.refund_int,
            COALESCE((
              SELECT array_agg(DISTINCT COALESCE(w.name, 'Müşteri (QR)'))
              FROM orders o LEFT JOIN waiters w ON w.id = o.waiter_id
              WHERE o.session_id = f.id AND o.type = 'order'
            ), '{}') AS staff,
            COALESCE((
              SELECT json_agg(json_build_object('product_name', g.product_name, 'price_int', g.price_int, 'quantity', g.quantity)
                              ORDER BY g.first_at)
              FROM (
                SELECT oi.product_name, oi.price_int, SUM(oi.quantity)::int AS quantity, MIN(oi.created_at) AS first_at
                FROM orders o JOIN order_items oi ON oi.order_id = o.id
                WHERE o.session_id = f.id AND o.type = 'order' AND o.status = 'delivered'
                GROUP BY oi.product_name, oi.price_int
              ) g
            ), '[]') AS items
     FROM filtered f
     ORDER BY f.closed_at DESC, f.id
     LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params
  );

  const summary: HistorySummary = summaryResult.rows[0];
  return { rows: rowsResult.rows, total: summary.count, summary };
}

// ─────────────────────────────────────────────────────────────
// Detay: bir hesabın siparişleri (zaman sırasıyla), ödemeleri ve indirimleri
// ─────────────────────────────────────────────────────────────

export type HistoryOrder = {
  id: string;
  status: string;
  is_refund: boolean;
  note: string | null;
  waiter_name: string | null;
  created_at: string;
  preparing_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by_email: string | null;
  refund_requested_by: string | null;
  total_int: number;
  items: Array<{ product_name: string; quantity: number; price_int: number; note: string | null }>;
  cancellations: Array<{
    product_name: string; quantity: number; price_int: number; reason_code: string; reason_text: string | null;
    order_status: string; whole_order: boolean; actor_name: string; approved_by_email: string | null; created_at: string;
  }>;
};

export async function getHistorySessionDetail(businessId: string, sessionId: string) {
  const [orders, payments, discounts] = await Promise.all([
    pool.query(
      `SELECT o.id, o.status, ${IS_REFUND_SQL} AS is_refund, o.note, w.name AS waiter_name,
              o.created_at, o.preparing_at, o.delivered_at, o.cancelled_at, o.cancel_reason,
              u.email AS cancelled_by_email,
              (SELECT r.waiter_name FROM order_change_requests r
                WHERE r.order_id = o.id AND r.kind = 'order_cancel' AND r.status = 'approved' LIMIT 1) AS refund_requested_by,
              COALESCE((SELECT SUM(oi.quantity * oi.price_int) FROM order_items oi WHERE oi.order_id = o.id), 0)::int AS total_int,
              COALESCE((SELECT json_agg(json_build_object('product_name', oi.product_name, 'quantity', oi.quantity,
                                                          'price_int', oi.price_int, 'note', oi.note) ORDER BY oi.created_at)
                        FROM order_items oi WHERE oi.order_id = o.id), '[]') AS items,
              COALESCE((SELECT json_agg(json_build_object('product_name', c.product_name, 'quantity', c.quantity,
                                                          'price_int', c.price_int, 'reason_code', c.reason_code,
                                                          'reason_text', c.reason_text, 'order_status', c.order_status,
                                                          'whole_order', c.whole_order, 'actor_name', c.actor_name,
                                                          'approved_by_email', cu.email, 'created_at', c.created_at)
                                        ORDER BY c.created_at)
                        FROM order_item_cancellations c LEFT JOIN users cu ON cu.id = c.approved_by
                        WHERE c.order_id = o.id), '[]') AS cancellations
       FROM orders o
       JOIN table_sessions ts ON ts.id = o.session_id AND ts.business_id = $1
       LEFT JOIN waiters w ON w.id = o.waiter_id
       LEFT JOIN users u ON u.id = o.cancelled_by
       WHERE o.session_id = $2 AND o.business_id = $1 AND o.type = 'order'
       ORDER BY o.created_at, o.id`,
      [businessId, sessionId]
    ),
    pool.query(
      `SELECT p.id, p.amount_int, p.method, p.note, p.created_at, p.voided_at, p.void_reason,
              cu.email AS collected_by_email, vu.email AS voided_by_email
       FROM payments p
       LEFT JOIN users cu ON cu.id = p.collected_by
       LEFT JOIN users vu ON vu.id = p.voided_by
       WHERE p.session_id = $2 AND p.business_id = $1
       ORDER BY p.created_at`,
      [businessId, sessionId]
    ),
    pool.query(
      `SELECT d.id, d.type, d.amount_int, d.percent, d.applies_to, d.note, d.created_at, d.voided_at,
              oi.product_name, cu.email AS created_by_email
       FROM discounts d
       LEFT JOIN order_items oi ON oi.id = d.order_item_id
       LEFT JOIN users cu ON cu.id = d.created_by
       WHERE d.session_id = $2 AND d.business_id = $1
       ORDER BY d.created_at`,
      [businessId, sessionId]
    )
  ]);
  return {
    orders: orders.rows as HistoryOrder[],
    payments: payments.rows,
    discounts: discounts.rows
  };
}

/** Filtre seçenekleri: masalar ve personel (silinmiş/pasifler dahil — geçmişte görünebilirler) */
export async function getHistoryOptions(businessId: string) {
  const [tables, waiters] = await Promise.all([
    pool.query(`SELECT id, name FROM tables WHERE business_id = $1 ORDER BY sort_order, name`, [businessId]),
    pool.query(`SELECT id, name FROM waiters WHERE business_id = $1 ORDER BY name`, [businessId])
  ]);
  return { tables: tables.rows, waiters: waiters.rows };
}

// ─────────────────────────────────────────────────────────────
// Excel (.xlsx)
// ─────────────────────────────────────────────────────────────

const EXPORT_LIMIT = 5_000;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { timeZone: TZ }) : '';
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '';
}
function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

const STATUS_FILTER_LABEL: Record<HistoryStatus, string> = {
  all: 'Tümü', cancelled: 'İptal olanlar', refunded: 'İade olanlar', discounted: 'İndirim / ikram olanlar'
};

export async function buildHistoryWorkbook(
  businessId: string, businessName: string, f: HistoryFilters, mode: 'tables' | 'items', filterText: string
): Promise<{ buffer: Buffer; truncated: boolean }> {
  const { rows, summary } = await getOrderHistory(businessId, f, 1, EXPORT_LIMIT);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AtlasQR';
  wb.created = new Date();

  const money = '#,##0.00 "TL"';
  const headerStyle = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF073F46' } };
    row.alignment = { vertical: 'middle' };
    row.height = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };

  if (mode === 'tables') {
    const ws = wb.addWorksheet('Masalar');
    ws.columns = [
      { header: 'Tarih', key: 'date', width: 12 },
      { header: 'No', key: 'no', width: 6 },
      { header: 'Masa', key: 'table', width: 14 },
      { header: 'Açılış', key: 'open', width: 8 },
      { header: 'Kapanış', key: 'close', width: 8 },
      { header: 'Süre (dk)', key: 'stay', width: 9 },
      { header: 'Personel', key: 'staff', width: 22 },
      { header: 'Ürünler', key: 'items', width: 48 },
      { header: 'Adet', key: 'qty', width: 7 },
      { header: 'Brüt', key: 'gross', width: 13, style: { numFmt: money } },
      { header: 'İndirim', key: 'discount', width: 12, style: { numFmt: money } },
      { header: 'İkram', key: 'comp', width: 12, style: { numFmt: money } },
      { header: 'Net', key: 'net', width: 13, style: { numFmt: money } },
      { header: 'Nakit', key: 'cash', width: 12, style: { numFmt: money } },
      { header: 'Kart', key: 'card', width: 12, style: { numFmt: money } },
      { header: 'Yemek Kartı', key: 'meal', width: 12, style: { numFmt: money } },
      { header: 'İptal', key: 'cancel', width: 7 },
      { header: 'İade', key: 'refund', width: 7 },
      { header: 'İptal + İade Tutarı', key: 'lost', width: 16, style: { numFmt: money } },
      { header: 'Kapatan', key: 'closedBy', width: 24 }
    ];
    for (const r of rows) {
      ws.addRow({
        date: fmtDate(r.closed_at), no: r.no, table: r.table_name,
        open: fmtTime(r.opened_at), close: fmtTime(r.closed_at), stay: minutesBetween(r.opened_at, r.closed_at),
        staff: r.staff.join(', '),
        items: r.items.map(i => `${i.quantity}× ${i.product_name}`).join(', '),
        qty: r.item_count,
        gross: r.gross_int / 100, discount: r.discount_int / 100, comp: r.complimentary_int / 100, net: r.net_int / 100,
        cash: r.cash_int / 100, card: r.card_int / 100, meal: r.meal_card_int / 100,
        cancel: r.cancel_count, refund: r.refund_count, lost: (r.cancelled_int + r.refund_int) / 100,
        closedBy: r.auto_closed ? 'Otomatik' : r.closed_by_email ?? ''
      });
    }
    headerStyle(ws);
  } else {
    const ws = wb.addWorksheet('Ürünler');
    ws.columns = [
      { header: 'Tarih', key: 'date', width: 12 },
      { header: 'No', key: 'no', width: 6 },
      { header: 'Masa', key: 'table', width: 14 },
      { header: 'Kapanış', key: 'close', width: 8 },
      { header: 'Ürün', key: 'product', width: 28 },
      { header: 'Adet', key: 'qty', width: 7 },
      { header: 'Birim Fiyat', key: 'price', width: 13, style: { numFmt: money } },
      { header: 'Tutar', key: 'total', width: 13, style: { numFmt: money } }
    ];
    for (const r of rows) {
      for (const i of r.items) {
        ws.addRow({
          date: fmtDate(r.closed_at), no: r.no, table: r.table_name, close: fmtTime(r.closed_at),
          product: i.product_name, qty: i.quantity, price: i.price_int / 100, total: (i.quantity * i.price_int) / 100
        });
      }
    }
    headerStyle(ws);
  }

  // Özet sayfası
  const s = wb.addWorksheet('Özet');
  s.columns = [{ key: 'k', width: 28 }, { key: 'v', width: 40 }];
  const add = (k: string, v: string | number, isMoney = false) => {
    const row = s.addRow({ k, v });
    row.getCell(1).font = { bold: true };
    if (isMoney) row.getCell(2).numFmt = money;
  };
  add('İşletme', businessName);
  add('Rapor', mode === 'tables' ? 'Masa bazlı (kapanan hesaplar)' : 'Ürün bazlı (kapanan hesaplar)');
  add('Filtre', filterText);
  add('Durum filtresi', STATUS_FILTER_LABEL[f.status]);
  add('Oluşturulma', new Date().toLocaleString('tr-TR', { timeZone: TZ }));
  s.addRow({});
  add('Kapanan masa', summary.count);
  add('Brüt satış', summary.gross_int / 100, true);
  add('İndirim', summary.discount_int / 100, true);
  add('İkram', summary.complimentary_int / 100, true);
  add('Net ciro', summary.net_int / 100, true);
  add('Tahsilat', summary.paid_int / 100, true);
  add('İptal (sipariş)', summary.cancel_count);
  add('İade (sipariş + ürün)', summary.refund_count);
  add('İptal + iade tutarı', (summary.cancelled_int + summary.refund_int) / 100, true);
  add('Ortalama oturma süresi (dk)', summary.avg_stay_min ?? '—');
  if (summary.count > EXPORT_LIMIT) {
    s.addRow({});
    add('Uyarı', `İlk ${EXPORT_LIMIT} hesap aktarıldı; aralığı daraltın.`);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, truncated: summary.count > EXPORT_LIMIT };
}
