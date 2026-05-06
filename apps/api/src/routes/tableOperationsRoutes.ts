// apps/api/src/routes/tableOperationsRoutes.ts
// Masa operasyonları: taşıma, birleştirme, sipariş transferi
// YENİ DOSYA — mevcut hiçbir route'a dokunulmadı
//
// app.ts'e 2 satır mount eklenecek:
//   app.use('/api/admin/table-operations', adminTableOperationsRoutes);
//   app.use('/api/public/waiter/table-operations', waiterTableOperationsRoutes);
//
// Neden 2 ayrı router?
//   Admin → JWT token → requireAuth middleware
//   Garson → opaque token → requireWaiterAuth middleware
//   Her iki durumda da aynı servis fonksiyonları çağrılır.

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireWaiterAuth } from '../middleware/waiterAuth.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import {
  moveSession,
  mergeSessions,
  transferOrders,
} from '../services/tableOperationsService.js';

// ─────────────────────────────────────────────────────────────────────────────
// TİP: Her iki aktör için ortak yapı
// ─────────────────────────────────────────────────────────────────────────────
type ActorInfo = {
  actorId: string;
  actorName: string;
  actorType: 'admin' | 'waiter';
  businessId: string;
  permissions: Record<string, boolean>;
};

// Admin'den aktör bilgisi çıkar (req.ctx)
function resolveAdminActor(req: any): ActorInfo {
  return {
    actorId: req.ctx!.userId!,
    actorName: 'Admin',
    actorType: 'admin',
    businessId: req.ctx!.businessId!,
    permissions: {}, // admin tüm işlemlere yetkili
  };
}

// Garsondan aktör bilgisi çıkar (req.waiter)
function resolveWaiterActor(req: any): ActorInfo {
  return {
    actorId: req.waiter!.id,
    actorName: req.waiter!.name,
    actorType: 'waiter',
    businessId: req.waiter!.business_id,
    permissions: req.waiter!.permissions ?? {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA'LAR (her iki router da aynı şemaları kullanır)
// ─────────────────────────────────────────────────────────────────────────────
const moveSchema = z.object({
  session_id: z.string().uuid(),
  target_table_id: z.string().uuid(),
});

const mergeSchema = z.object({
  source_session_id: z.string().uuid(),
  target_session_id: z.string().uuid(),
});

const transferOrdersSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1),
  target_session_id: z.string().uuid(),
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMİN ROUTER — JWT auth, tüm işlemlere yetkili
// ─────────────────────────────────────────────────────────────────────────────
export const adminTableOperationsRoutes = Router();
adminTableOperationsRoutes.use(requireAuth);

// POST /api/admin/table-operations/move
adminTableOperationsRoutes.post('/move', async (req, res) => {
  const actor = resolveAdminActor(req);

  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await moveSession({
    businessId: actor.businessId,
    sessionId: parsed.data.session_id,
    targetTableId: parsed.data.target_table_id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorType: actor.actorType,
  });

  res.status(200).json(result);
});

// POST /api/admin/table-operations/merge
adminTableOperationsRoutes.post('/merge', async (req, res) => {
  const actor = resolveAdminActor(req);

  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await mergeSessions({
    businessId: actor.businessId,
    sourceSessionId: parsed.data.source_session_id,
    targetSessionId: parsed.data.target_session_id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorType: actor.actorType,
  });

  res.status(200).json(result);
});

// POST /api/admin/table-operations/transfer-orders
adminTableOperationsRoutes.post('/transfer-orders', async (req, res) => {
  const actor = resolveAdminActor(req);

  const parsed = transferOrdersSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await transferOrders({
    businessId: actor.businessId,
    orderIds: parsed.data.order_ids,
    targetSessionId: parsed.data.target_session_id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorType: actor.actorType,
  });

  res.status(200).json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GARSON ROUTER — opaque token auth, permission kontrolü var
// ─────────────────────────────────────────────────────────────────────────────
export const waiterTableOperationsRoutes = Router();
waiterTableOperationsRoutes.use(requireWaiterAuth);

// POST /api/public/waiter/table-operations/move
waiterTableOperationsRoutes.post('/move', async (req, res) => {
  const actor = resolveWaiterActor(req);

  if (!actor.permissions.can_transfer_table) {
    throw new AppError('Bu işlem için yetkiniz yok.', 403, APP_ERROR_CODES.FORBIDDEN);
  }

  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await moveSession({
    businessId: actor.businessId,
    sessionId: parsed.data.session_id,
    targetTableId: parsed.data.target_table_id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorType: actor.actorType,
  });

  res.status(200).json(result);
});

// POST /api/public/waiter/table-operations/merge
waiterTableOperationsRoutes.post('/merge', async (req, res) => {
  const actor = resolveWaiterActor(req);

  if (!actor.permissions.can_merge_tables) {
    throw new AppError('Bu işlem için yetkiniz yok.', 403, APP_ERROR_CODES.FORBIDDEN);
  }

  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await mergeSessions({
    businessId: actor.businessId,
    sourceSessionId: parsed.data.source_session_id,
    targetSessionId: parsed.data.target_session_id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorType: actor.actorType,
  });

  res.status(200).json(result);
});

// POST /api/public/waiter/table-operations/transfer-orders
waiterTableOperationsRoutes.post('/transfer-orders', async (req, res) => {
  const actor = resolveWaiterActor(req);

  if (!actor.permissions.can_transfer_table) {
    throw new AppError('Bu işlem için yetkiniz yok.', 403, APP_ERROR_CODES.FORBIDDEN);
  }

  const parsed = transferOrdersSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz istek.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await transferOrders({
    businessId: actor.businessId,
    orderIds: parsed.data.order_ids,
    targetSessionId: parsed.data.target_session_id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorType: actor.actorType,
  });

  res.status(200).json(result);
});