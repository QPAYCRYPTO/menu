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

    // Kullanıcı + işletme aktif mi kontrol et
    // superadmin'in business_id'si null olabilir; onun için LEFT JOIN
    pool.query(
      `SELECT 
         u.password_version, 
         u.role,
         u.business_id,
         b.is_active AS business_active
       FROM users u
       LEFT JOIN businesses b ON b.id = u.business_id
       WHERE u.id = $1 AND u.is_active = TRUE`,
      [payload.user_id]
    ).then(result => {
      if (result.rowCount !== 1) {
        res.status(401).json({ message: 'Kullanıcı bulunamadı veya pasif.' });
        return;
      }

      const row = result.rows[0];
      const dbVersion = row.password_version;
      const currentRole: string = row.role;
      const businessId: string | null = row.business_id;
      const businessActive: boolean | null = row.business_active;

      if (payload.password_version !== dbVersion) {
        res.status(401).json({ message: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });
        return;
      }

      // İşletmeye bağlı kullanıcılarda işletme aktif olmalı
      // (superadmin'in business_id'si null olabilir, ona dokunmayız)
      if (businessId !== null && businessActive === false) {
        res.status(403).json({ message: 'İşletmeniz pasif durumda. Lütfen yönetici ile iletişime geçin.' });
        return;
      }

      req.user = { ...payload, role: currentRole } as any;
      req.ctx = {
        requestId: req.requestId || req.ctx?.requestId || '',
        userId: payload.user_id,
        businessId: payload.business_id ?? '',
        role: currentRole
      } as any;
      next();
    }).catch(() => {
      res.status(500).json({ message: 'Sunucu hatası.' });
    });

  } catch {
    res.status(401).json({ message: 'Geçersiz oturum.' });
  }
}

// ─────────────────────────────────────────────────────────────
// ROL KONTROLÜ
// ─────────────────────────────────────────────────────────────

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req.ctx as any)?.role || (req.user as any)?.role;

    if (!role) {
      res.status(401).json({ message: 'Yetkisiz erişim.' });
      return;
    }

    if (!allowedRoles.includes(role)) {
      res.status(403).json({ message: 'Bu işlem için yetkiniz yok.' });
      return;
    }

    next();
  };
}

export const requireOwner = requireRole('owner', 'superadmin');
export const requireAdmin = requireRole('admin', 'superadmin');
export const requireSuperAdmin = requireRole('superadmin');