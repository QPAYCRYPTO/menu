import type { NextFunction, Request, Response } from 'express';
import { redis } from '../db/redis.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';

type SlidingWindowOptions = {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
  includeEmail?: boolean;
  includeTableId?: boolean;
  /** Personel oturum yenileme: IP + sekme (aynı Wi-Fi'deki personel birbirinin hakkını yemesin) */
  includeTabId?: boolean;
};

function createSlidingWindowRateLimiter(options: SlidingWindowOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || 'unknown';
    const email = options.includeEmail ? String(req.body?.email ?? '').toLowerCase() : '';
    const now = Date.now();
    const minScore = now - options.windowMs;
    const tableId = options.includeTableId ? String(req.body?.table_id ?? '').slice(0, 64) : '';
    const tabId = options.includeTabId ? String(req.body?.tab_id ?? '').slice(0, 64) : '';
    const key = options.includeTableId
      ? `${options.keyPrefix}:${ip}:${tableId}`
      : options.includeTabId
      ? `${options.keyPrefix}:${ip}:${tabId}`
      : `${options.keyPrefix}:${ip}:${email}`;

    await redis.zremrangebyscore(key, 0, minScore);
    await redis.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);
    const count = await redis.zcard(key);
    await redis.pexpire(key, options.windowMs);

    if (count > options.maxRequests) {
      next(new AppError('Çok fazla istek. Lütfen tekrar deneyin.', 429, APP_ERROR_CODES.RATE_LIMITED));
      return;
    }

    next();
  };
}

export const loginRateLimit = createSlidingWindowRateLimiter({
  keyPrefix: 'rl:auth:login',
  maxRequests: 5,
  windowMs: 60_000,
  includeEmail: true
});

/** Oturum açıkken şifre değiştirme: mevcut şifreyi deneme-yanılmaya karşı */
export const changePasswordRateLimit = createSlidingWindowRateLimiter({
  keyPrefix: 'rl:auth:change-password',
  maxRequests: 5,
  windowMs: 60_000
});

export const requestResetRateLimit = createSlidingWindowRateLimiter({
  keyPrefix: 'rl:auth:request-reset',
  maxRequests: 3,
  windowMs: 60_000,
  includeEmail: true
});

export const publicMenuRateLimit = createSlidingWindowRateLimiter({
  keyPrefix: 'rl:public:menu',
  maxRequests: 60,
  windowMs: 60_000
});

// Aynı restoranda müşteriler aynı IP'yi (Wi-Fi/NAT) paylaşabilir → IP + masa bazlı
export const publicOrderRateLimit = createSlidingWindowRateLimiter({
  keyPrefix: 'rl:public:order',
  maxRequests: 10,
  windowMs: 60_000,
  includeTableId: true
});

// Personel girişi / oturum yenileme: müşteri menüsüyle aynı kovayı paylaşmaz.
// Aynı kafede herkes aynı IP'den (Wi-Fi/NAT) gelir; menü trafiği personeli oturumdan atmamalı.
export const waiterSessionRateLimit = createSlidingWindowRateLimiter({
  keyPrefix: 'rl:waiter:session',
  maxRequests: 30,
  windowMs: 60_000,
  includeTabId: true
});

export const waiterLoginRateLimit = createSlidingWindowRateLimiter({
  keyPrefix: 'rl:waiter:login',
  maxRequests: 10,
  windowMs: 60_000,
  includeEmail: true
});

export const publicCallRateLimit = createSlidingWindowRateLimiter({
  keyPrefix: 'rl:public:call',
  maxRequests: 10,
  windowMs: 60_000,
  includeTableId: true
});
