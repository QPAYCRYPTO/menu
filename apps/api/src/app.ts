// apps/api/src/app.ts
import 'express-async-errors';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env.js';
import { authRoutes } from './routes/authRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { publicRoutes } from './routes/publicRoutes.js';
import { superAdminRoutes } from './routes/superAdminRoutes.js';
import { tableRoutes } from './routes/tableRoutes.js';
import { orderRoutes } from './routes/orderRoutes.js';
import { customerOrderRoutes } from './routes/customerOrderRoutes.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { sessionRoutes } from './routes/sessionRoutes.js';
import { ownerRoutes } from './routes/ownerRoutes.js';
import { waiterAdminRoutes } from './routes/waiterAdminRoutes.js';
import { waiterPublicRoutes } from './routes/waiterPublicRoutes.js';
import { errorLogIngestRoutes, superAdminErrorRoutes } from './routes/errorLogRoutes.js';

export function createApp() {
  const app = express();

  // Cloudflare + Railway proxy arkasında çalışıyoruz
  // Trust proxy: gerçek client IP'sini X-Forwarded-For header'ından al
  // 'true' yerine sayı kullan: Railway → 1 hop, Cloudflare → 1 hop = 2
  // 1 hop: Railway proxy'sini güven, ama Cloudflare hala doğru IP geçiriyor
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(cors({
    origin: env.webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Super-Admin-Secret', 'X-Tab-ID'],
    maxAge: 86400
  }));

  app.use(requestId);
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use('/uploads', express.static(path.resolve('src/public/uploads')));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/auth', authRoutes);
  app.use('/api/auth', authRoutes);

  // ÖNCE: Spesifik route'lar
  app.use('/api/admin/tables', tableRoutes);
  app.use('/api/admin/orders', orderRoutes);
  app.use('/api/admin/sessions', sessionRoutes);
  app.use('/api/admin/waiters', waiterAdminRoutes);

  // SONRA: Genel admin route'u (catch-all)
  app.use('/admin', adminRoutes);
  app.use('/api/admin', adminRoutes);
 

  // Public route'lar
  app.use('/api/public', publicRoutes);
  app.use('/api/public', customerOrderRoutes);
  app.use('/api/public/waiter', waiterPublicRoutes); 

  // Frontend hata logu kabul endpoint'i (rate-limited, public)
  app.use('/api/error-log', errorLogIngestRoutes);

  // Süper admin route'ları
  app.use('/api/superadmin', superAdminRoutes);
  app.use('/api/superadmin/errors', superAdminErrorRoutes);


  // Owner (patron) route'ları — sadece owner + superadmin erişebilir
  app.use('/api/owner', ownerRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}