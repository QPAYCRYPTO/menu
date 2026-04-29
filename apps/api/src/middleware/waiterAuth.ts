// apps/api/src/middleware/waiterAuth.ts
// CHANGELOG v3:
// - X-Tab-ID header desteği (tab-bound session doğrulama)
// - tab_id varsa: authenticateWaiterByTokenAndTab kullan (yeni güvenli yol)
// - tab_id yoksa: authenticateWaiterByToken kullan (geriye uyumlu)
// - SSE için query param fallback korundu
//
// GEÇİŞ STRATEJİSİ:
//   Frontend güncellenince tüm istekler X-Tab-ID gönderecek.
//   Bu sırada tab_id olmayan istekler (eski frontend versiyonu) hala çalışır.
//   Migration tamamlandıktan sonra eski yol kaldırılabilir.

import type { NextFunction, Request, Response } from 'express';
import {
  authenticateWaiterByToken,
  authenticateWaiterByTokenAndTab,
  Waiter
} from '../services/waiterService.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      waiter?: Waiter;
      waiterSessionId?: string;
      waiterTabId?: string;
    }
  }
}

export async function requireWaiterAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;

  // 1) Token oku — header veya query param (SSE için)
  let token: string | null = null;
  if (header?.startsWith('Bearer ')) {
    token = header.slice(7).trim();
  }
  if (!token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({ ok: false, reason: 'no_token' });
    return;
  }

  // 2) Tab ID oku — header veya query param (SSE için)
  let tabId: string | null = null;
  const tabHeader = req.headers['x-tab-id'];
  if (typeof tabHeader === 'string' && tabHeader.trim().length > 0) {
    tabId = tabHeader.trim();
  }
  if (!tabId && typeof req.query.tab_id === 'string') {
    tabId = req.query.tab_id.trim();
  }

  // 3) Tab ID varsa → güvenli yol (token + tab kontrolü)
  // Tab ID yoksa → eski yol (geriye uyumlu, frontend güncellenene kadar)
  const result = tabId
    ? await authenticateWaiterByTokenAndTab(token, tabId)
    : await authenticateWaiterByToken(token);

  if (!result.ok) {
    res.status(401).json({ ok: false, reason: result.reason });
    return;
  }

  req.waiter = result.waiter;
  req.waiterSessionId = result.session_id ?? undefined;
  req.waiterTabId = tabId ?? undefined;
  next();
}