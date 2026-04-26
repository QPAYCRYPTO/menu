// apps/api/src/middleware/waiterAuth.ts
// Garson token'ını doğrulayan middleware
// Her istekte Authorization header'ındaki QR token'ı doğrular,
// req'e waiter bilgisini ekler

import type { NextFunction, Request, Response } from 'express';
import { authenticateWaiterByToken, Waiter } from '../services/waiterService.js';

// Express Request'e waiter alanı ekle
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      waiter?: Waiter;
      waiterSessionId?: string;
    }
  }
}

export async function requireWaiterAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, reason: 'no_token' });
    return;
  }

  const token = header.slice(7);
  const result = await authenticateWaiterByToken(token);

  if (!result.ok) {
    res.status(401).json({ ok: false, reason: result.reason });
    return;
  }

  req.waiter = result.waiter;
  req.waiterSessionId = result.session_id ?? undefined;
  next();
}