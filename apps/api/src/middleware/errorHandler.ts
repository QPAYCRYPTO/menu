// apps/api/src/middleware/errorHandler.ts
import type { NextFunction, Request, Response } from 'express';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { logger } from '../logger/logger.js';
import { logError } from '../services/errorLogService.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('Kaynak bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appError = err instanceof AppError ? err : new AppError('Sunucu hatası.', 500, APP_ERROR_CODES.INTERNAL_ERROR);

  // Pino'ya yaz (Railway log'larında görünsün — eskisi gibi)
  logger.error({
    message: appError.message,
    request_id: req.requestId,
    business_id: req.ctx?.businessId,
    code: appError.code,
    status_code: appError.statusCode,
    details: appError.details,
    original_error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });

  // DB'ye de yaz (süper admin paneli için) — sadece HIGH ve üstü severity
  // Düşük seviyeli hataları (404, 400, validation) loglamayız → spam olur
  if (shouldPersistToErrorLog(appError)) {
    logError({
      severity: appError.severity,
      source: 'backend',
      business_id: req.ctx?.businessId ?? null,
      user_id: req.ctx?.userId ?? null,
      message: appError.message,
      stack: err instanceof Error ? err.stack ?? null : null,
      context: {
        request_id: req.requestId,
        method: req.method,
        path: req.path,
        status_code: appError.statusCode,
        code: appError.code,
        ip: req.ip,
        user_agent: req.get('user-agent') ?? null,
        details: appError.details ?? null,
        original_error: err instanceof Error && err !== appError ? err.message : null
      },
      fingerprint_extra: `${req.method}:${req.path}`
    });
  }

  res.status(appError.statusCode).json({
    message: appError.message,
    code: appError.code,
    requestId: req.requestId
  });
}

/**
 * Hata DB'ye log'lansın mı?
 *
 * Kural: Sadece HIGH ve üstü severity DB'ye yazılır.
 * - CRITICAL/HIGH: Kesin yaz (gerçek sorunlar)
 * - MEDIUM: Şimdilik yazma (Faz 2'de aktif edilebilir)
 * - LOW: Yazma (404, validation, kullanıcı hatası — spam olur)
 *
 * Ayrıca: Rate limit (429) hataları yazılmaz — zaten korumamız çalışıyor demek.
 */
function shouldPersistToErrorLog(err: AppError): boolean {
  // Rate limit — koruması çalışıyor demek, log'lamaya gerek yok
  if (err.code === APP_ERROR_CODES.RATE_LIMITED) return false;

  // Sadece HIGH ve üstü severity DB'ye gider
  return err.severity === 'CRITICAL' || err.severity === 'HIGH';
}