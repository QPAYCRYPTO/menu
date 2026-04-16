// apps/api/src/middleware/auth.ts
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SessionUser } from '@menu/shared';
import { env } from '../config/env.js';
import { pool } from '../db/postgres.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Yetkisiz erişim.' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as SessionUser & { password_version?: number };

    if (!payload.user_id) {
      res.status(401).json({ message: 'Geçersiz oturum.' });
      return;
    }

    // password_version kontrolü
    pool.query(
      `SELECT password_version FROM users WHERE id = $1 AND is_active = TRUE`,
      [payload.user_id]
    ).then(result => {
      if (result.rowCount !== 1) {
        res.status(401).json({ message: 'Kullanıcı bulunamadı.' });
        return;
      }

      const dbVersion = result.rows[0].password_version;
      if (payload.password_version !== dbVersion) {
        res.status(401).json({ message: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });
        return;
      }

      req.user = payload;
      req.ctx = {
        requestId: req.requestId || req.ctx?.requestId || '',
        userId: payload.user_id,
        businessId: payload.business_id ?? ''
      };
      next();
    }).catch(() => {
      res.status(500).json({ message: 'Sunucu hatası.' });
    });

  } catch {
    res.status(401).json({ message: 'Geçersiz oturum.' });
  }
}