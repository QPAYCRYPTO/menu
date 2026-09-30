// apps/api/src/services/orderHistoryService.ts
// Siparişler → Geçmiş: filtreli liste, özet ve Excel (.xlsx) çıktısı.
//
// - Yalnızca yemek siparişleri (type='order'); garson çağrıları geçmişe karışmaz.
// - Durum: Teslim | İptal | İade. İade = mutfak başladıktan sonra iptal edilmiş sipariş
//   (preparing_at dolu ya da onaylanmış iade talebi var). 021 öncesi siparişlerde preparing_at yok →
//   onaylı talep yoksa "İptal" sayılır.
// - Sipariş no: işletmede o günün (İstanbul saati) kaçıncı siparişi — mutfak ekranıyla aynı numara.
import ExcelJS from 'exceljs';
import { pool } from '../db/postgres.js';

export type HistoryStatus = 'all' | 'delivered' | 'cancelled' | 'refunded';

export type HistoryFilters = {
  from: string;          // ISO tarih-saat (dahil)
  to: string;            // ISO tarih-saat (hariç)
  status: HistoryStatus;
  tableId?: string;
  waiterId?: string;     // personel id ya da 'customer' (müşteri QR siparişleri)
  q?: string;            // ürün adı ya da masa
};

export type HistoryRow = {
  id: string;
  order_no: number;
  table_id: string | null;
  table_name: string;
  status: 'delivered' | 'cancelled';
  is_refund: boolean;
  note: string | null;
  waiter_id: string | null;
  waiter_name: string | null;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by_email: string | null;
  refund_requested_by: string | null;
  total_int: number;
  items: Array<{ product_name: string; quantity: number; price_int: number; note: string | null }>;
};

export type HistorySummary = {
  count: number;
  delivered_count: number;
  revenue_int: number;
  cancelled_count: number;
  refund_count: number;
  lost_int: number;
  avg_delivery_min: number | null;
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

/**
 * Ortak FROM/WHERE. `base` CTE'si numaralanmış siparişleri, filtrelerden önce üretir
 * (sipariş no filtreden etkilenmesin).
 */
function buildQuery(businessId: string, f: HistoryFilters) {
  const params: unknown[] = [businessId, f.from, f.to];
  const where: string[] = [`b.status IN ('delivered', 'cancelled')`, `b.created_at >= $2::timestamptz`, `b.created_at < $3::timestamptz`];

  if (f.status === 'delivered') where.push(`b.status = 'delivered'`);
  if (f.status === 'cancelled') where.push(`b.status = 'cancelled' AND NOT b.is_refund`);
  if (f.status === 'refunded') where.push(`b.status = 'cancelled' AND b.is_refund`);
  if (f.tableId) { params.push(f.tableId); where.push(`b.table_id = $${params.length}`); }
  if (f.waiterId === 'customer') where.push(`b.waiter_id IS NULL`);
  else if (f.waiterId) { params.push(f.waiterId); where.push(`b.waiter_id = $${params.length}`); }
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, m => '\\' + m)}%`);
    const p = `$${params.length}`;
    where.push(`(b.table_name ILIKE ${p} OR EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = b.id AND x.product_name ILIKE ${p}))`);
  }

  // Numaralandırma: aralığın ilk gününün başından itibaren (İstanbul günü)
  const cte = `
    WITH base AS (
      SELECT o.*,
             ROW_NUMBER() OVER (
               PARTITION BY (o.created_at AT TIME ZONE '${TZ}')::date
               ORDER BY o.created_at, o.id
             )::int AS order_no,
             (o.status = 'cancelled' AND (
                o.preparing_at IS NOT NULL OR EXISTS (
                  SELECT 1 FROM order_change_requests r
                  WHERE r.order_id = o.id AND r.kind = 'order_cancel' AND r.status = 'approved'
                )
             )) AS is_refund
      FROM orders o
      WHERE o.business_id = $1 AND o.type = 'order'
        AND o.created_at >= ((($2::timestamptz AT TIME ZONE '${TZ}')::date)::timestamp AT TIME ZONE '${TZ}')
        AND o.created_at < $3::timestamptz
    ),
    filtered AS (
      SELECT b.* FROM base b WHERE ${where.join(' AND ')}
    ),
    totals AS (
      SELECT oi.order_id, COALESCE(SUM(oi.quantity * oi.price_int), 0)::int AS total_int
      FROM order_items oi JOIN filtered f ON f.id = oi.order_id
      GROUP BY oi.order_id
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
            COUNT(*) FILTER (WHERE f.status = 'delivered')::int AS delivered_count,
            COALESCE(SUM(t.total_int) FILTER (WHERE f.status = 'delivered'), 0)::int AS revenue_int,
            COUNT(*) FILTER (WHERE f.status = 'cancelled' AND NOT f.is_refund)::int AS cancelled_count,
            COUNT(*) FILTER (WHERE f.status = 'cancelled' AND f.is_refund)::int AS refund_count,
            COALESCE(SUM(t.total_int) FILTER (WHERE f.status = 'cancelled'), 0)::int AS lost_int,
            ROUND(AVG(EXTRACT(EPOCH FROM (f.delivered_at - f.created_at)) / 60)
                  FILTER (WHERE f.status = 'delivered' AND f.delivered_at IS NOT NULL))::int AS avg_delivery_min
     FROM filtered f LEFT JOIN totals t ON t.order_id = f.id`,
    params
  );

  const rowsResult = await pool.query(
    `${cte}
     SELECT f.id, f.order_no, f.table_id, f.table_name, f.status, f.is_refund, f.note, f.waiter_id, w.name AS waiter_name,
            f.created_at, f.preparing_at, f.ready_at, f.delivered_at, f.cancelled_at, f.cancel_reason,
            u.email AS cancelled_by_email,
            (SELECT r.waiter_name FROM order_change_requests r
              WHERE r.order_id = f.id AND r.kind = 'order_cancel' AND r.status = 'approved' LIMIT 1) AS refund_requested_by,
            COALESCE(t.total_int, 0)::int AS total_int,
            COALESCE((SELECT json_agg(json_build_object('product_name', oi.product_name, 'quantity', oi.quantity,
                                                        'price_int', oi.price_int, 'note', oi.note) ORDER BY oi.created_at)
                      FROM order_items oi WHERE oi.order_id = f.id), '[]') AS items
     FROM filtered f
     LEFT JOIN totals t ON t.order_id = f.id
     LEFT JOIN waiters w ON w.id = f.waiter_id
     LEFT JOIN users u ON u.id = f.cancelled_by
     ORDER BY f.created_at DESC
     LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params
  );

  const summary: HistorySummary = summaryResult.rows[0];
  return { rows: rowsResult.rows, total: summary.count, summary };
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

const EXPORT_LIMIT = 10_000;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { timeZone: TZ }) : '';
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '';
}
function statusLabel(r: HistoryRow): string {
  return r.status === 'delivered' ? 'Teslim' : r.is_refund ? 'İade' : 'İptal';
}
function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

const STATUS_FILTER_LABEL: Record<HistoryStatus, string> = {
  all: 'Tümü', delivered: 'Teslim', cancelled: 'İptal', refunded: 'İade'
};

export async function buildHistoryWorkbook(
  businessId: string, businessName: string, f: HistoryFilters, mode: 'orders' | 'items', filterText: string
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

  if (mode === 'orders') {
    const ws = wb.addWorksheet('Siparişler');
    ws.columns = [
      { header: 'Tarih', key: 'date', width: 12 },
      { header: 'Saat', key: 'time', width: 8 },
      { header: 'Sipariş No', key: 'no', width: 11 },
      { header: 'Masa', key: 'table', width: 14 },
      { header: 'Personel', key: 'waiter', width: 18 },
      { header: 'Ürünler', key: 'items', width: 48 },
      { header: 'Adet', key: 'qty', width: 7 },
      { header: 'Tutar', key: 'total', width: 13, style: { numFmt: money } },
      { header: 'Durum', key: 'status', width: 9 },
      { header: 'Teslim Süresi (dk)', key: 'deliveryMin', width: 17 },
      { header: 'İptal / İade Gerekçesi', key: 'reason', width: 32 },
      { header: 'Not', key: 'note', width: 24 }
    ];
    for (const r of rows) {
      ws.addRow({
        date: fmtDate(r.created_at), time: fmtTime(r.created_at), no: r.order_no, table: r.table_name,
        waiter: r.waiter_name ?? 'Müşteri (QR)',
        items: r.items.map(i => `${i.quantity}× ${i.product_name}`).join(', '),
        qty: r.items.reduce((s, i) => s + i.quantity, 0),
        total: r.total_int / 100, status: statusLabel(r),
        deliveryMin: r.status === 'delivered' ? minutesBetween(r.created_at, r.delivered_at) : null,
        reason: r.status === 'cancelled' ? reasonLabel(r.cancel_reason) : '', note: r.note ?? ''
      });
    }
    headerStyle(ws);
  } else {
    const ws = wb.addWorksheet('Ürünler');
    ws.columns = [
      { header: 'Tarih', key: 'date', width: 12 },
      { header: 'Saat', key: 'time', width: 8 },
      { header: 'Sipariş No', key: 'no', width: 11 },
      { header: 'Masa', key: 'table', width: 14 },
      { header: 'Personel', key: 'waiter', width: 18 },
      { header: 'Ürün', key: 'product', width: 28 },
      { header: 'Adet', key: 'qty', width: 7 },
      { header: 'Birim Fiyat', key: 'price', width: 13, style: { numFmt: money } },
      { header: 'Tutar', key: 'total', width: 13, style: { numFmt: money } },
      { header: 'Durum', key: 'status', width: 9 },
      { header: 'Ürün Notu', key: 'note', width: 24 }
    ];
    for (const r of rows) {
      for (const i of r.items) {
        ws.addRow({
          date: fmtDate(r.created_at), time: fmtTime(r.created_at), no: r.order_no, table: r.table_name,
          waiter: r.waiter_name ?? 'Müşteri (QR)', product: i.product_name, qty: i.quantity,
          price: i.price_int / 100, total: (i.quantity * i.price_int) / 100, status: statusLabel(r), note: i.note ?? ''
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
  add('Rapor', mode === 'orders' ? 'Sipariş bazlı' : 'Ürün bazlı');
  add('Filtre', filterText);
  add('Durum filtresi', STATUS_FILTER_LABEL[f.status]);
  add('Oluşturulma', new Date().toLocaleString('tr-TR', { timeZone: TZ }));
  s.addRow({});
  add('Sipariş sayısı', summary.count);
  add('Teslim edilen', summary.delivered_count);
  add('Ciro (teslim)', summary.revenue_int / 100, true);
  add('İptal', summary.cancelled_count);
  add('İade', summary.refund_count);
  add('İptal + iade tutarı', summary.lost_int / 100, true);
  add('Ortalama teslim süresi (dk)', summary.avg_delivery_min ?? '—');
  if (summary.count > EXPORT_LIMIT) {
    s.addRow({});
    add('Uyarı', `İlk ${EXPORT_LIMIT} sipariş aktarıldı; aralığı daraltın.`);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, truncated: summary.count > EXPORT_LIMIT };
}
