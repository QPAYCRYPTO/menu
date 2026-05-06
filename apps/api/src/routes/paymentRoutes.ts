// apps/api/src/routes/paymentRoutes.ts
// Ödeme ekranı endpoint'leri — sadece admin erişir
// YENİ DOSYA — mevcut hiçbir dosyaya dokunulmadı
//
// app.ts'e mount:
//   app.use('/api/admin/payment', paymentRoutes);   ← spesifik route'lardan önce

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import {
  getSessionBillDetails,
  payItems,
  closeTableAfterPayment,
  getNewOrdersSincePaymentStart
} from '../services/paymentService.js';

export const paymentRoutes = Router();
paymentRoutes.use(requireAuth);

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

paymentRoutes.post('/pay-items', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const parsed = payItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await payItems({
    businessId,
    sessionId: parsed.data.session_id,
    itemIds: parsed.data.item_ids,
    paymentMethod: parsed.data.payment_method
  });

  res.status(200).json(result);
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
  force_close: z.boolean().default(false)
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
    forceClose: parsed.data.force_close
  });

  // Ödenmemiş item var ve force_close=false → 409 döner, kapanmaz
  if (result.closed_session_ids.length === 0 && !parsed.data.force_close) {
    res.status(409).json({
      message: 'Ödenmemiş ürünler var. Önce tahsil edin veya force_close=true gönderin.',
      unpaid_items_count: result.unpaid_items_count,
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