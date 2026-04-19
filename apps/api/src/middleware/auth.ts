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
      `SELECT password_version, role FROM users WHERE id = $1 AND is_active = TRUE`,
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

      // DB'deki güncel role'ü al (payload stale olabilir)
      const currentRole: string = result.rows[0].role;

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
// ROL KONTROLÜ — requireAuth'tan SONRA kullanılmalı
// ─────────────────────────────────────────────────────────────

/**
 * Belirtilen rollerden birine sahip kullanıcıları geçirir.
 * Örn: requireRole('owner', 'superadmin')
 */
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

/**
 * Sadece 'owner' ve 'superadmin' rolüne izin verir.
 * Patron dashboard ve raporlar için.
 */
export const requireOwner = requireRole('owner', 'superadmin');

/**
 * Sadece 'admin' ve 'superadmin' rolüne izin verir.
 * Operasyonel yönetim (sipariş, masa, ürün) için.
 */
export const requireAdmin = requireRole('admin', 'superadmin');

/**
 * Sadece 'superadmin' rolüne izin verir.
 * Çok-işletmeli SaaS yönetim panelleri için.
 */
export const requireSuperAdmin = requireRole('superadmin');