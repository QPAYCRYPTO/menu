import { Router } from 'express';
import { loginSchema, refreshSchema, requestResetSchema, resetPasswordSchema } from '@menu/shared';
import { APP_ERROR_CODES, AppError } from '../errors/AppError.js';
import { loginRateLimit, requestResetRateLimit } from '../middleware/rateLimit.js';
import { createPasswordResetToken, login, refresh, resetPassword } from '../services/authService.js';
import { sendPasswordResetMail } from '../services/mailService.js';

export const authRoutes = Router();

authRoutes.post('/login', loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz giriş verisi.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const tokens = await login(parsed.data.email, parsed.data.password);
  if (!tokens) {
    throw new AppError('E-posta veya şifre hatalı.', 401, APP_ERROR_CODES.UNAUTHORIZED);
  }

  res.status(200).json(tokens);
});

authRoutes.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz token verisi.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  const accessToken = await refresh(parsed.data.refresh_token);
  if (!accessToken) {
    throw new AppError('Refresh token geçersiz.', 401, APP_ERROR_CODES.UNAUTHORIZED);
  }

  res.status(200).json({ access_token: accessToken });
});

// apps/api/src/routes/authRoutes.ts
authRoutes.post('/request-reset', requestResetRateLimit, async (req, res) => {
  const parsed = requestResetSchema.safeParse(req.body);

  if (parsed.success) {
    try {
      const token = await createPasswordResetToken(parsed.data.email);
      if (token) {
        await sendPasswordResetMail(parsed.data.email, token);
      }
    } catch (error) {
      console.error('Mail gönderim hatası:', error);
      res.status(500).json({ message: String(error) });
      return;
    }
  }

  res.status(200).json({ message: 'İstek alındı.' });
});

authRoutes.post('/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Geçersiz şifre sıfırlama verisi.', 400, APP_ERROR_CODES.BAD_REQUEST);
  }

  await resetPassword(parsed.data.token, parsed.data.new_password);

  res.status(200).json({ message: 'İşlem tamamlandı.' });
});
