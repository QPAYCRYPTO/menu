import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SessionUser } from '@menu/shared';
import { env } from '../config/env.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Yetkisiz erişim.' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as SessionUser;

    if (!payload.user_id || !payload.business_id) {
      res.status(401).json({ message: 'Geçersiz oturum.' });
      return;
    }

    req.user = payload;
    req.ctx = {
      requestId: req.requestId || req.ctx?.requestId || '',
      userId: payload.user_id,
      businessId: payload.business_id
    };
    next();
  } catch {
    res.status(401).json({ message: 'Geçersiz oturum.' });
  }
}
