import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.trim() ? incoming : randomUUID();

  req.requestId = id;
  req.ctx = { requestId: id };
  res.setHeader('x-request-id', id);
  next();
}
