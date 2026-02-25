import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { publicMenuRateLimit } from '../middleware/rateLimit.js';
import { getPublicMenuBySlug } from '../services/menuService.js';

const slugParamsSchema = z.object({
  slug: z.string().min(1).max(120)
});

export const publicRoutes = Router();

publicRoutes.get('/menu/:slug', publicMenuRateLimit, async (req, res) => {
  const parsed = slugParamsSchema.safeParse(req.params);

  if (!parsed.success) {
    throw new AppError('Geçersiz slug parametresi.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const menu = await getPublicMenuBySlug(parsed.data.slug);

  if (!menu) {
    throw new AppError('Menü bulunamadı.', 404, APP_ERROR_CODES.NOT_FOUND);
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json(menu);
});

publicRoutes.get('/qr/:slug', (req, res) => {
  const parsed = slugParamsSchema.safeParse(req.params);

  if (!parsed.success) {
    throw new AppError('Geçersiz slug parametresi.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const url = `${env.appUrl}/menu/${parsed.data.slug}`;

  const html = `<!doctype html>
  <html lang="tr">
  <head><meta charset="UTF-8" /><title>QR Menü</title></head>
  <body style="font-family: Arial; margin: 2rem;">
    <h1>QR Menü Bağlantısı</h1>
    <p>Bağlantı: <a href="${url}">${url}</a></p>
    <small style="position: fixed; bottom: 8px; left: 8px; opacity: .7;">Powered by ${env.brand}</small>
  </body>
  </html>`;

  res.status(200).type('html').send(html);
});
