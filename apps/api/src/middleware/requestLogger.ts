import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    logger.info({
      message: 'http_request',
      request_id: req.requestId,
      business_id: req.ctx?.businessId,
      method: req.method,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: Date.now() - start
    });
  });

  next();
}
