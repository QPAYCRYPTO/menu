// apps/api/src/middleware/realtime.ts
// Masa/adisyon durumunu değiştiren yazma işlemleri başarıyla bitince diğer ekranlara
// (admin, diğer garsonlar) "tables_changed" olayı yayınlar. Ekranlar bu olayla kendini yeniler.

import type { NextFunction, Request, Response } from 'express';
import { publishOrder } from '../db/redisPubSub.js';

export function publishTablesChangedOnSuccess(reason: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') {
      next();
      return;
    }
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const businessId = (req.ctx as any)?.businessId || req.waiter?.business_id;
      if (!businessId) return;
      publishOrder(businessId, { type: 'tables_changed', reason, path: req.path }).catch(() => {
        // yayın hatası isteği etkilemesin
      });
    });
    next();
  };
}
