// apps/api/src/routes/errorLogRoutes.ts
//
// Hata logu route'ları:
//   POST /api/error-log              — frontend'den hata kabul (public, rate-limited)
//   GET  /api/superadmin/errors      — liste (filtreli)
//   GET  /api/superadmin/errors/stats — dashboard özeti
//   GET  /api/superadmin/errors/:id  — detay
//   PATCH /api/superadmin/errors/:id — status değişim (resolved/ignored)
//
// Mount edilirken iki ayrı path kullanılır:
//   app.use('/api/error-log', errorLogIngestRoutes)
//   app.use('/api/superadmin/errors', superAdminErrorRoutes)

import { Router } from 'express';
import { z } from 'zod';
import {
  logError,
  listErrors,
  getErrorById,
  updateErrorStatus,
  getErrorStats
} from '../services/errorLogService.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { publicMenuRateLimit } from '../middleware/rateLimit.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import type { ErrorSeverity } from '../errors/AppError.js';

// ===================================================================
// 1) FRONTEND INGEST — POST /api/error-log
// ===================================================================
//
// Frontend'den gelen hatalar (crash, onerror, 5xx response) burayla yazılır.
// Public endpoint (login zorunlu değil) — login öncesi de hata yakalanmalı.
// Rate limit korumalı (yoksa abuse vektörü olur).

export const errorLogIngestRoutes = Router();

const ingestSchema = z.object({
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).optional().nullable(),
  context: z.record(z.unknown()).optional().nullable(),
  // Frontend kendi business_id'sini gönderebilir (login'liyse)
  // Ama biz sunucu tarafında JWT'den de okuyacağız, JWT öncelikli.
  business_id: z.string().uuid().optional().nullable(),
  // Frontend tipi: hangi sayfa, hangi component vb.
  url: z.string().max(500).optional().nullable(),
  user_agent: z.string().max(500).optional().nullable()
});

errorLogIngestRoutes.post('/', publicMenuRateLimit, async (req, res) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    // Frontend hata gönderme isteği bozuksa sessizce kabul et (404'a düşürmeyelim)
    res.status(204).send();
    return;
  }

  const data = parsed.data;

  // Frontend'den gelen severity'ye CRITICAL veya HIGH güvenmiyoruz —
  // saldırgan SMS bombardımanı için CRITICAL gönderebilir. MEDIUM'a düşürelim.
  // Sadece backend kendi severity'sini olduğu gibi atayabilir.
  const safeSeverity: ErrorSeverity =
    data.severity === 'CRITICAL' ? 'HIGH' : data.severity;

  // Context'i zenginleştir (server-side bilgiler ekle)
  const enrichedContext: Record<string, unknown> = {
    ...(data.context ?? {}),
    url: data.url ?? null,
    user_agent: data.user_agent ?? req.get('user-agent') ?? null,
    ip: req.ip,
    received_at: new Date().toISOString()
  };

  // Boş string'leri null'a çevir (UUID kolonları için zorunlu — '' UUID olarak kabul edilmez)
  const ctxBusinessId = req.ctx?.businessId && req.ctx.businessId.length > 0 ? req.ctx.businessId : null;
  const ctxUserId = req.ctx?.userId && req.ctx.userId.length > 0 ? req.ctx.userId : null;
  const bodyBusinessId = data.business_id && data.business_id.length > 0 ? data.business_id : null;

  logError({
    severity: safeSeverity,
    source: 'frontend',
    // JWT varsa oradan al, yoksa body'deki business_id'yi (kontrolsüz, bilgi amaçlı)
    business_id: ctxBusinessId ?? bodyBusinessId,
    user_id: ctxUserId,
    message: data.message,
    stack: data.stack ?? null,
    context: enrichedContext,
    fingerprint_extra: data.url ?? undefined
  });

  // Hızlı 204 dön — frontend bekletilmesin
  res.status(204).send();
});

// ===================================================================
// 2) SÜPER ADMIN — GET / PATCH endpoint'leri
// ===================================================================

export const superAdminErrorRoutes = Router();

// requireAuth → JWT doğrula
// requireSuperAdmin → role kontrolü
superAdminErrorRoutes.use(requireAuth);
superAdminErrorRoutes.use(requireSuperAdmin);

// --- GET /api/superadmin/errors/stats (dashboard widget)
superAdminErrorRoutes.get('/stats', async (_req, res) => {
  const stats = await getErrorStats();
  res.status(200).json(stats);
});

// --- GET /api/superadmin/errors (liste + filtre)
const listQuerySchema = z.object({
  severity: z.string().optional(), // virgülle ayrı: 'CRITICAL,HIGH'
  source: z.string().optional(),
  status: z.string().optional(),
  business_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  since: z.string().optional(), // ISO date
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

function splitCsv<T extends string>(value: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
  return parts.length > 0 ? parts : undefined;
}

superAdminErrorRoutes.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError('Geçersiz filtre parametreleri.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const q = parsed.data;
  const result = await listErrors({
    severity: splitCsv(q.severity, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const),
    source: splitCsv(q.source, ['backend', 'frontend', 'external', 'database'] as const),
    status: splitCsv(q.status, ['new', 'investigating', 'resolved', 'ignored'] as const),
    business_id: q.business_id,
    search: q.search,
    since: q.since,
    limit: q.limit ?? 50,
    offset: q.offset ?? 0
  });

  res.status(200).json(result);
});

// --- GET /api/superadmin/errors/:id (detay)
const idParamSchema = z.object({ id: z.string().uuid() });

superAdminErrorRoutes.get('/:id', async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new AppError('Geçersiz id.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const error = await getErrorById(parsed.data.id);
  if (!error) {
    throw new AppError('Hata kaydı bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  res.status(200).json(error);
});

// --- PATCH /api/superadmin/errors/:id (resolve / ignore)
const updateBodySchema = z.object({
  status: z.enum(['investigating', 'resolved', 'ignored']),
  resolution_note: z.string().max(2000).optional().nullable()
});

superAdminErrorRoutes.patch('/:id', async (req, res) => {
  const idParsed = idParamSchema.safeParse(req.params);
  const bodyParsed = updateBodySchema.safeParse(req.body);

  if (!idParsed.success || !bodyParsed.success) {
    throw new AppError('Geçersiz parametre.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  // Boş string'leri null'a çevir (UUID kolonları için)
  const userId = req.ctx?.userId && req.ctx.userId.length > 0 ? req.ctx.userId : null;
  const updated = await updateErrorStatus(
    idParsed.data.id,
    bodyParsed.data.status,
    userId,
    bodyParsed.data.resolution_note
  );

  if (!updated) {
    throw new AppError('Hata kaydı bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  res.status(200).json({ ok: true });
});