// apps/api/src/routes/ledgerRoutes.ts
// Kasa Aşama 2 — ödeme kaydı ve indirim/ikram uçları (yalnızca admin)
//
//   POST   /api/admin/payments            { session_id, amount_int?, method, note?, item_ids? }
//   DELETE /api/admin/payments/:id        { reason }            → ödeme iptali
//   POST   /api/admin/discounts           { session_id, type, applies_to, amount_int?, percent?, order_item_id?, note? }
//   DELETE /api/admin/discounts/:id                             → indirimi kaldır
//
// Başarılı her yazma "tables_changed" yayınlar (kasa ekranları kendini yeniler).

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { publishTablesChangedOnSuccess } from '../middleware/realtime.js';
import { createDiscount, createPayment, voidDiscount, voidPayment } from '../services/paymentLedgerService.js';

const idParam = z.object({ id: z.string().uuid() });

// ─── ÖDEMELER ───────────────────────────────────────────────────────────────
export const paymentsRoutes = Router();
paymentsRoutes.use(requireAuth);
paymentsRoutes.use(requireAdmin);
paymentsRoutes.use(publishTablesChangedOnSuccess('payment'));

const createPaymentSchema = z.object({
  session_id: z.string().uuid(),
  amount_int: z.number().int().positive().max(100_000_000).optional(),
  method: z.enum(['cash', 'card', 'meal_card']),
  note: z.string().trim().max(200).optional(),
  item_ids: z.array(z.string().uuid()).max(500).optional()
}).refine(v => v.amount_int != null || (v.item_ids?.length ?? 0) > 0, { message: 'Tutar ya da ürün seçin.' });

paymentsRoutes.post('/', async (req, res) => {
  const parsed = createPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? 'Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }
  const d = parsed.data;
  const result = await createPayment({
    businessId: req.ctx!.businessId!,
    sessionId: d.session_id,
    userId: req.ctx!.userId!,
    amountInt: d.amount_int,
    method: d.method,
    note: d.note || null,
    itemIds: d.item_ids
  });
  res.status(201).json(result);
});

const voidSchema = z.object({
  reason: z.string({ required_error: 'İptal sebebi yazın.' }).trim().min(2, 'İptal sebebi yazın.').max(200)
});

paymentsRoutes.delete('/:id', async (req, res) => {
  const p = idParam.safeParse(req.params);
  const b = voidSchema.safeParse(req.body ?? {});
  if (!p.success) throw new AppError('Geçersiz ödeme.', 400, APP_ERROR_CODES.BAD_REQUEST);
  if (!b.success) throw new AppError(b.error.issues[0]?.message ?? 'İptal sebebi yazın.', 400, APP_ERROR_CODES.BAD_REQUEST);
  const result = await voidPayment({
    businessId: req.ctx!.businessId!,
    paymentId: p.data.id,
    userId: req.ctx!.userId!,
    reason: b.data.reason
  });
  res.status(200).json(result);
});

// ─── İNDİRİM / İKRAM ────────────────────────────────────────────────────────
export const discountsRoutes = Router();
discountsRoutes.use(requireAuth);
discountsRoutes.use(requireAdmin);
discountsRoutes.use(publishTablesChangedOnSuccess('discount'));

const createDiscountSchema = z.object({
  session_id: z.string().uuid(),
  type: z.enum(['discount', 'complimentary']),
  applies_to: z.enum(['session', 'item']),
  amount_int: z.number().int().positive().max(100_000_000).optional(),
  percent: z.number().int().min(1).max(100).optional(),
  order_item_id: z.string().uuid().optional(),
  note: z.string().trim().max(200).optional()
}).refine(v => v.type === 'complimentary' || v.amount_int != null || v.percent != null, {
  message: 'İndirim için tutar ya da yüzde girin.'
}).refine(v => v.applies_to === 'session' || !!v.order_item_id, { message: 'Ürün seçin.' });

discountsRoutes.post('/', async (req, res) => {
  const parsed = createDiscountSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? 'Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }
  const d = parsed.data;
  const result = await createDiscount({
    businessId: req.ctx!.businessId!,
    sessionId: d.session_id,
    userId: req.ctx!.userId!,
    type: d.type,
    appliesTo: d.applies_to,
    amountInt: d.amount_int,
    percent: d.percent,
    orderItemId: d.order_item_id,
    note: d.note
  });
  res.status(200).json(result);
});

discountsRoutes.delete('/:id', async (req, res) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) throw new AppError('Geçersiz indirim.', 400, APP_ERROR_CODES.BAD_REQUEST);
  const result = await voidDiscount({ businessId: req.ctx!.businessId!, discountId: p.data.id, userId: req.ctx!.userId! });
  res.status(200).json(result);
});
