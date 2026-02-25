import type { RequestContext, SessionUser } from '@menu/shared';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      requestId?: string;
      ctx?: RequestContext;
    }
  }
}

export {};
