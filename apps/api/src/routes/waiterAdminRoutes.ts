// apps/api/src/routes/waiterAdminRoutes.ts
// Admin'in garson yönetim endpoint'leri — v2
// Yetki, email, şifre, status desteği eklendi

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import {
  createWaiter,
  listWaiters,
  getWaiterById,
  updateWaiterDetails,
  setWaiterPassword,
  setWaiterStatus,
  deleteWaiter,
  generateWaiterToken,
  listActiveSessionsForWaiter,
  revokeWaiterSession
} from '../services/waiterService.js';

export const waiterAdminRoutes = Router();

waiterAdminRoutes.use(requireAuth);
waiterAdminRoutes.use(requireAdmin);

// ─────────────────────────────────────────────────────────────
// VALIDATION SCHEMAS
// ─────────────────────────────────────────────────────────────

const permissionsSchema = z.object({
  can_delete_items: z.boolean().optional(),
  can_merge_tables: z.boolean().optional(),
  can_transfer_table: z.boolean().optional(),
  can_see_other_tables: z.boolean().optional(),
  can_add_note: z.boolean().optional(),
  can_use_break: z.boolean().optional()
});

const createWaiterSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
  password: z.string().min(8).max(100).optional().or(z.literal('')),
  permissions: permissionsSchema.optional()
});

const updateWaiterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().max(200).nullable().optional().or(z.literal('')),
  permissions: permissionsSchema.optional()
});

const setPasswordSchema = z.object({
  password: z.string().min(8).max(100).nullable()
});

const setStatusSchema = z.object({
  status: z.enum(['active', 'on_leave', 'inactive'])
});

const generateTokenSchema = z.object({
  hours_valid: z.number().int().min(1).max(12)
});

const paramsIdSchema = z.object({
  id: z.string().uuid()
});

const paramsSessionSchema = z.object({
  session_id: z.string().uuid()
});

// ─────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────

// GET /api/admin/waiters
waiterAdminRoutes.get('/', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }
  const waiters = await listWaiters(businessId);
  res.status(200).json(waiters);
});

// POST /api/admin/waiters
waiterAdminRoutes.post('/', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const parsed = createWaiterSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  // Boş string'leri undefined'a çevir
  const data = parsed.data;
  const input = {
    name: data.name,
    phone: data.phone || undefined,
    email: data.email || undefined,
    password: data.password || undefined,
    permissions: data.permissions
  };

  try {
    const waiter = await createWaiter(businessId, input);
    res.status(201).json(waiter);
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (msg.includes('modülü')) {
      throw new AppError('Garson modülü bu işletme için kapalı.', 403, APP_ERROR_CODES.FORBIDDEN);
    }
    if (msg.includes('email') || msg.includes('şifre')) {
      res.status(400).json({ message: msg });
      return;
    }
    throw err;
  }
});

// GET /api/admin/waiters/:id
waiterAdminRoutes.get('/:id', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const parsed = paramsIdSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const waiter = await getWaiterById(businessId, parsed.data.id);
  if (!waiter) {
    res.status(404).json({ message: 'Garson bulunamadı.' });
    return;
  }

  res.status(200).json(waiter);
});

// PATCH /api/admin/waiters/:id
// Body: { name?, phone?, email?, permissions? }
waiterAdminRoutes.patch('/:id', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const paramsParsed = paramsIdSchema.safeParse(req.params);
  const bodyParsed = updateWaiterSchema.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  // Boş string'leri null'a çevir (email için)
  const data = bodyParsed.data;
  const input = {
    name: data.name,
    phone: data.phone === undefined ? undefined : (data.phone || null),
    email: data.email === undefined ? undefined : ((data.email && data.email !== '') ? data.email : null),
    permissions: data.permissions
  };

  try {
    const waiter = await updateWaiterDetails(businessId, paramsParsed.data.id, input);
    if (!waiter) {
      res.status(404).json({ message: 'Garson bulunamadı.' });
      return;
    }
    res.status(200).json(waiter);
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (msg.includes('email')) {
      res.status(400).json({ message: msg });
      return;
    }
    throw err;
  }
});

// PUT /api/admin/waiters/:id/password
// Admin şifre belirler/sıfırlar
// Body: { password: string | null }  (null verirse şifre kaldırılır)
waiterAdminRoutes.put('/:id/password', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const paramsParsed = paramsIdSchema.safeParse(req.params);
  const bodyParsed = setPasswordSchema.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const ok = await setWaiterPassword(businessId, paramsParsed.data.id, bodyParsed.data.password);
  if (!ok) {
    res.status(404).json({ message: 'Garson bulunamadı.' });
    return;
  }

  res.status(200).json({ ok: true });
});

// PUT /api/admin/waiters/:id/status
// Body: { status: 'active' | 'on_leave' | 'inactive' }
waiterAdminRoutes.put('/:id/status', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const paramsParsed = paramsIdSchema.safeParse(req.params);
  const bodyParsed = setStatusSchema.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const ok = await setWaiterStatus(businessId, paramsParsed.data.id, bodyParsed.data.status);
  if (!ok) {
    res.status(404).json({ message: 'Garson bulunamadı.' });
    return;
  }

  res.status(200).json({ ok: true, status: bodyParsed.data.status });
});

// DELETE /api/admin/waiters/:id
// Kalıcı sil
waiterAdminRoutes.delete('/:id', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const parsed = paramsIdSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const ok = await deleteWaiter(businessId, parsed.data.id);
  if (!ok) {
    res.status(404).json({ message: 'Garson bulunamadı.' });
    return;
  }

  res.status(200).json({ ok: true });
});

// POST /api/admin/waiters/:id/token
waiterAdminRoutes.post('/:id/token', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const paramsParsed = paramsIdSchema.safeParse(req.params);
  const bodyParsed = generateTokenSchema.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    throw new AppError('Geçersiz parametre (hours_valid 1-12).', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const result = await generateWaiterToken(
    businessId,
    paramsParsed.data.id,
    bodyParsed.data.hours_valid
  );

  if (!result) {
    res.status(404).json({ message: 'Garson bulunamadı veya aktif değil.' });
    return;
  }

  res.status(201).json({
    token: result.token,
    expires_at: result.expires_at,
    session_id: result.session_id,
    waiter_id: result.waiter.id,
    waiter_name: result.waiter.name,
    waiter_phone: result.waiter.phone
  });
});

// GET /api/admin/waiters/:id/sessions
waiterAdminRoutes.get('/:id/sessions', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const parsed = paramsIdSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const sessions = await listActiveSessionsForWaiter(businessId, parsed.data.id);
  res.status(200).json(sessions);
});

// POST /api/admin/waiters/sessions/:session_id/revoke
waiterAdminRoutes.post('/sessions/:session_id/revoke', async (req, res) => {
  const businessId = (req.ctx as any)?.businessId;
  if (!businessId) {
    throw new AppError('İşletme bulunamadı.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const parsed = paramsSessionSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const ok = await revokeWaiterSession(businessId, parsed.data.session_id);
  if (!ok) {
    res.status(404).json({ message: 'Oturum bulunamadı.' });
    return;
  }

  res.status(200).json({ ok: true });
});