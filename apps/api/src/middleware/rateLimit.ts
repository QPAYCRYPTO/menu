import type { NextFunction, Request, Response } from 'express';
import { redis } from '../db/redis.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';

type SlidingWindowOptions = {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
  includeEmail?: boolean;
};

function createSlidingWindowRateLimiter(options: SlidingWindowOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || 'unknown';
    const email = options.includeEmail ? String(req.body?.email ?? '').toLowerCase() : '';
    const now = Date.now();
    const minScore = now - options.windowMs;
    const key = `${options.keyPrefix}:${ip}:${email}`;

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
