// apps/api/src/routes/ownerRoutes.ts
// Owner (patron) için rapor endpoint'leri
// Yalnızca 'owner' ve 'superadmin' erişebilir
// İleride her sekme için ayrı endpoint eklenebilir ama şu an tek endpoint tüm rapor verisini döner

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';

export const ownerRoutes = Router();
ownerRoutes.use(requireAuth);
ownerRoutes.use(requireOwner);

// ISO date (YYYY-MM-DD) veya full ISO timestamp kabul eder
const dateRangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1)
});

/**
 * GET /api/owner/reports/overview?from=2026-04-01&to=2026-04-19
 * Tek istekte tüm rapor verisini döner.
 */
ownerRoutes.get('/reports/overview', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const parsed = dateRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz tarih aralığı.' });
    return;
  }

  // from = gün başı, to = gün sonu (23:59:59.999)
  const fromDate = new Date(parsed.data.from);
  const toDate = new Date(parsed.data.to);
  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(23, 59, 59, 999);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    res.status(400).json({ message: 'Geçersiz tarih.' });
    return;
  }

  if (fromDate > toDate) {
    res.status(400).json({ message: '"from" tarihi "to" tarihinden büyük olamaz.' });
    return;
  }

  try {
    // Tüm sorguları paralel çalıştır
    const [
      kpiResult,
      hourlyResult,
      dailyResult,
      topQtyResult,
      topRevResult,
      tablesResult,
      cancelResult,
      cashShortageResult,
      avgPrepResult
    ] = await Promise.all([
      // KPI: delivered sipariş sayısı, toplam ciro, ortalama adisyon, iptal oranı
      pool.query(
        `
        SELECT 
          COUNT(*) FILTER (WHERE o.status = 'delivered')::int as delivered_count,
          COUNT(*) FILTER (WHERE o.status = 'cancelled')::int as cancelled_count,
          COALESCE(
            SUM(
              CASE WHEN o.status = 'delivered' 
                THEN (SELECT COALESCE(SUM(oi.quantity * oi.price_int), 0) 
                      FROM order_items oi WHERE oi.order_id = o.id)
                ELSE 0 
              END
            ), 0
          )::int as total_revenue
        FROM orders o
        WHERE o.business_id = $1
          AND o.type = 'order'
          AND o.created_at >= $2 
          AND o.created_at <= $3
        `,
        [businessId, fromDate, toDate]
      ),

      // Saatlik dağılım (0-23)
      pool.query(
        `
        SELECT 
          EXTRACT(HOUR FROM o.created_at)::int as hour,
          COUNT(*)::int as orders,
          COALESCE(SUM(oi.quantity * oi.price_int), 0)::int as revenue
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.business_id = $1
          AND o.type = 'order'
          AND o.status = 'delivered'
          AND o.created_at >= $2 
          AND o.created_at <= $3
        GROUP BY EXTRACT(HOUR FROM o.created_at)
        ORDER BY hour
        `,
        [businessId, fromDate, toDate]
      ),

      // Günlük trend
      pool.query(
        `
        SELECT 
          DATE(o.created_at) as date,
          COUNT(*)::int as orders,
          COALESCE(SUM(oi.quantity * oi.price_int), 0)::int as revenue
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.business_id = $1
          AND o.type = 'order'
          AND o.status = 'delivered'
          AND o.created_at >= $2 
          AND o.created_at <= $3
        GROUP BY DATE(o.created_at)
        ORDER BY date
        `,
        [businessId, fromDate, toDate]
      ),

      // Top ürünler (adet)
      pool.query(
        `
        SELECT 
          oi.product_name as name,
          SUM(oi.quantity)::int as quantity,
          SUM(oi.quantity * oi.price_int)::int as revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id = $1
          AND o.type = 'order'
          AND o.status = 'delivered'
          AND o.created_at >= $2 
          AND o.created_at <= $3
        GROUP BY oi.product_name
        ORDER BY quantity DESC
        LIMIT 10
        `,
        [businessId, fromDate, toDate]
      ),

      // Top ürünler (ciro)
      pool.query(
        `
        SELECT 
          oi.product_name as name,
          SUM(oi.quantity)::int as quantity,
          SUM(oi.quantity * oi.price_int)::int as revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id = $1
          AND o.type = 'order'
          AND o.status = 'delivered'
          AND o.created_at >= $2 
          AND o.created_at <= $3
        GROUP BY oi.product_name
        ORDER BY revenue DESC
        LIMIT 10
        `,
        [businessId, fromDate, toDate]
      ),

      // Masa performansı (ciro ve sipariş sayısı)
      pool.query(
        `
        SELECT 
          o.table_name as name,
          COUNT(DISTINCT o.id)::int as orders,
          COALESCE(SUM(oi.quantity * oi.price_int), 0)::int as revenue
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.business_id = $1
          AND o.type = 'order'
          AND o.status = 'delivered'
          AND o.created_at >= $2 
          AND o.created_at <= $3
        GROUP BY o.table_name
        ORDER BY revenue DESC
        LIMIT 20
        `,
        [businessId, fromDate, toDate]
      ),

      // İptal sebep dağılımı
      pool.query(
        `
        SELECT 
          SPLIT_PART(cancel_reason, ':', 1) as reason_code,
          COUNT(*)::int as count,
          COALESCE(
            SUM(
              (SELECT COALESCE(SUM(oi.quantity * oi.price_int), 0) 
               FROM order_items oi WHERE oi.order_id = o.id)
            ), 0
          )::int as total_amount
        FROM orders o
        WHERE o.business_id = $1
          AND o.type = 'order'
          AND o.status = 'cancelled'
          AND o.created_at >= $2 
          AND o.created_at <= $3
          AND o.cancel_reason IS NOT NULL
        GROUP BY SPLIT_PART(cancel_reason, ':', 1)
        ORDER BY count DESC
        `,
        [businessId, fromDate, toDate]
      ),

      // Kasa açığı (no_payment ile iptal edilenlerin toplamı)
      pool.query(
        `
        SELECT 
          COALESCE(
            SUM(
              (SELECT COALESCE(SUM(oi.quantity * oi.price_int), 0) 
               FROM order_items oi WHERE oi.order_id = o.id)
            ), 0
          )::int as total
        FROM orders o
        WHERE o.business_id = $1
          AND o.status = 'cancelled'
          AND o.cancel_reason LIKE 'no_payment%'
          AND o.created_at >= $2 
          AND o.created_at <= $3
        `,
        [businessId, fromDate, toDate]
      ),

      // Ortalama hazırlama süresi (saniye)
      pool.query(
        `
        SELECT 
          AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)))::int as avg_prep_seconds
        FROM orders
        WHERE business_id = $1
          AND type = 'order'
          AND status = 'delivered'
          AND delivered_at IS NOT NULL
          AND created_at >= $2 
          AND created_at <= $3
        `,
        [businessId, fromDate, toDate]
      )
    ]);

    const kpi = kpiResult.rows[0];
    const deliveredCount = kpi.delivered_count;
    const cancelledCount = kpi.cancelled_count;
    const totalRevenue = kpi.total_revenue;
    const totalAttempted = deliveredCount + cancelledCount;

    const overview = {
      range: {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      },
      kpi: {
        revenue_int: totalRevenue,
        delivered_count: deliveredCount,
        cancelled_count: cancelledCount,
        average_ticket_int: deliveredCount > 0 ? Math.round(totalRevenue / deliveredCount) : 0,
        cancellation_rate: totalAttempted > 0
          ? Math.round((cancelledCount / totalAttempted) * 1000) / 10  // 1 ondalık (örn 5.8)
          : 0,
        avg_prep_seconds: avgPrepResult.rows[0]?.avg_prep_seconds || 0
      },
      hourly: hourlyResult.rows,
      daily: dailyResult.rows.map(r => ({
        date: r.date,
        orders: r.orders,
        revenue: r.revenue
      })),
      top_products_by_quantity: topQtyResult.rows,
      top_products_by_revenue: topRevResult.rows,
      tables: tablesResult.rows,
      cancellations: cancelResult.rows,
      cash_shortage_int: cashShortageResult.rows[0]?.total || 0
    };

    res.status(200).json(overview);
  } catch (error) {
    console.error('Rapor hatası:', error);
    res.status(500).json({ message: 'Rapor oluşturulamadı.' });
  }
});