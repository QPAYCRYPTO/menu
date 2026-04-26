// apps/api/src/middleware/waiterAuth.ts
// Garson token'ını doğrulayan middleware
// Her istekte Authorization header'ındaki QR token'ı doğrular,
// req'e waiter bilgisini ekler.
//
// CHANGELOG:
// - SSE için query param token desteği (EventSource header gönderemiyor)

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

  // 1) Header'dan token oku (Bearer xxx)
  let token: string | null = null;
  if (header?.startsWith('Bearer ')) {
    token = header.slice(7).trim();
  }

  // 2) SSE için query param fallback (browser EventSource header gönderemez)
  if (!token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({ ok: false, reason: 'no_token' });
    return;
  }

  const result = await authenticateWaiterByToken(token);

  if (!result.ok) {
    res.status(401).json({ ok: false, reason: result.reason });
    return;
  }

  req.waiter = result.waiter;
  req.waiterSessionId = result.session_id ?? undefined;
  next();
}