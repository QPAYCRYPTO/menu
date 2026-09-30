// apps/api/src/routes/paymentRoutes.ts
// Ödeme ekranı endpoint'leri — sadece admin erişir
// YENİ DOSYA — mevcut hiçbir dosyaya dokunulmadı
//
// app.ts'e mount:
//   app.use('/api/admin/payment', paymentRoutes);   ← spesifik route'lardan önce

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { publishOrder } from '../db/redisPubSub.js';
import { publishTablesChangedOnSuccess } from '../middleware/realtime.js';
import {
  getSessionBillDetails,
  closeTableAfterPayment,
  getNewOrdersSincePaymentStart
} from '../services/paymentService.js';
import { createPayment } from '../services/paymentLedgerService.js';

export const paymentRoutes = Router();
paymentRoutes.use(requireAuth);
paymentRoutes.use(requireAdmin);
paymentRoutes.use(publishTablesChangedOnSuccess('payment'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payment/session/:session_id
// Ödeme ekranı açılınca çağrılır — adisyon detayı
// Tüm item'ları is_paid durumlarıyla döner
// ─────────────────────────────────────────────────────────────────────────────
const sessionIdParam = z.object({
  session_id: z.string().uuid()
});

paymentRoutes.get('/session/:session_id', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const parsed = sessionIdParam.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz session id.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const bill = await getSessionBillDetails(businessId, parsed.data.session_id);
  res.status(200).json(bill);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/payment/pay-items
// Seçili item'ları öde
//
// Body:
//   session_id     UUID
//   item_ids       UUID[]   — ödenecek item'lar
//   payment_method 'cash' | 'card' | 'other'
// ─────────────────────────────────────────────────────────────────────────────
const payItemsSchema = z.object({
  session_id: z.string().uuid(),
  item_ids: z.array(z.string().uuid()).min(1),
  payment_method: z.enum(['cash', 'card', 'other']).default('cash')
});

// Geriye uyumluluk: artık ödeme kaydı (payments) üzerinden işler
paymentRoutes.post('/pay-items', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const parsed = payItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await createPayment({
    businessId,
    sessionId: parsed.data.session_id,
    userId: req.ctx!.userId!,
    itemIds: parsed.data.item_ids,
    method: parsed.data.payment_method === 'other' ? 'meal_card' : parsed.data.payment_method
  });

  res.status(200).json({
    paid_count: parsed.data.item_ids.length,
    remaining_int: result.ledger.remaining_int,
    fully_paid_order_ids: result.fully_paid_order_ids
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/payment/close-table
// Tüm ödemeler alındı → masayı kapat
//
// Body:
//   session_id    UUID
//   force_close   boolean (default false)
//                 true ise ödenmemiş item olsa bile kapatır
// ─────────────────────────────────────────────────────────────────────────────
const closeTableSchema = z.object({
  session_id: z.string().uuid(),
  force_close: z.boolean().default(false),
  open_order_decisions: z.array(z.object({
    order_id: z.string().uuid(),
    decision: z.enum(['customer_left', 'no_payment'])
  })).max(200).default([])
});

paymentRoutes.post('/close-table', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const userId = req.ctx!.userId!;

  const parsed = closeTableSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await closeTableAfterPayment({
    businessId,
    sessionId: parsed.data.session_id,
    closedBy: userId,
    forceClose: parsed.data.force_close,
    openOrderDecisions: parsed.data.open_order_decisions
  });

  // Ödenmemiş açık sipariş var ve her biri için karar gönderilmedi → 409, kapanmaz
  if (result.open_orders_requiring_decision.length > 0) {
    res.status(409).json({
      message: 'Ödenmemiş açık siparişler var. Her biri için "İptal Et" veya "Zayi Say" seçin.',
      code: 'OPEN_ORDERS_REQUIRE_DECISION',
      unpaid_items_count: result.unpaid_items_count,
      open_orders: result.open_orders_requiring_decision
    });
    return;
  }

  // İptal/zayi edilen siparişler mutfak ekranından düşsün
  for (const order of result.cancelled_orders) {
    try {
      await publishOrder(businessId, {
        type: 'order_cancelled',
        order_id: order.order_id,
        table_name: order.table_name,
        order_type: 'order',
        reason: order.reason
      });
    } catch {
      // yut
    }
  }

  // Ödenmemiş item var ve force_close=false → 409 döner, kapanmaz
  if (result.closed_session_ids.length === 0 && !parsed.data.force_close) {
    res.status(409).json({
      message: 'Ödenmemiş ürünler var. Önce tahsil edin veya force_close=true gönderin.',
      unpaid_items_count: result.unpaid_items_count,
      remaining_int: result.remaining_int,
      code: 'UNPAID_ITEMS_EXIST'
    });
    return;
  }

  res.status(200).json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payment/new-orders/:session_id?since=ISO_TIMESTAMP
// Ödeme ekranı açıkken yeni sipariş geldi mi kontrol eder
// Admin polling ile çağırır (her 10-15sn)
// ─────────────────────────────────────────────────────────────────────────────
const newOrdersQuery = z.object({
  since: z.string().min(1)
});

paymentRoutes.get('/new-orders/:session_id', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const paramParsed = sessionIdParam.safeParse(req.params);
  if (!paramParsed.success) {
    throw new AppError('Geçersiz session id.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const queryParsed = newOrdersQuery.safeParse(req.query);
  if (!queryParsed.success) {
    throw new AppError('since parametresi zorunludur (ISO timestamp).', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await getNewOrdersSincePaymentStart(
    businessId,
    paramParsed.data.session_id,
    queryParsed.data.since
  );

  res.status(200).json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/payment/customer-bill-view
// Müşteri adisyon görüntüleme toggle
// Body: { enabled: boolean }
// ─────────────────────────────────────────────────────────────────────────────
const billViewSchema = z.object({
  enabled: z.boolean()
});

paymentRoutes.patch('/customer-bill-view', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const parsed = billViewSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek (enabled: true/false).', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const { pool } = await import('../db/postgres.js');
  const result = await pool.query(
    `UPDATE businesses
     SET customer_can_view_bill = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, customer_can_view_bill`,
    [parsed.data.enabled, businessId]
  );

  if (result.rowCount !== 1) {
    throw new AppError('İşletme bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  res.status(200).json({
    ok: true,
    customer_can_view_bill: result.rows[0].customer_can_view_bill
  });
});