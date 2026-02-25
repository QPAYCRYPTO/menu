import type { NextFunction, Request, Response } from 'express';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { logger } from '../logger/logger.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('Kaynak bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appError = err instanceof AppError ? err : new AppError('Sunucu hatası.', 500, APP_ERROR_CODES.INTERNAL_ERROR);

  logger.error({
    message: appError.message,
    request_id: req.requestId,
    business_id: req.ctx?.businessId,
    code: appError.code,
    status_code: appError.statusCode,
    details: appError.details
  });

  res.status(appError.statusCode).json({
    message: appError.message,
    code: appError.code,
    requestId: req.requestId
  });
}
