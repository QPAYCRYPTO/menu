// apps/api/src/routes/superAdminRoutes.ts
import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { pool } from '../db/postgres.js';
import { env } from '../config/env.js';

const createBusinessSchema = z.object({
  business_name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  password: z.string().min(8)
});

function requireSuperAdmin(req: any, res: any, next: any) {
  const secret = req.headers['x-super-admin-secret'];
  if (!secret || secret !== env.superAdminSecret) {
    res.status(401).json({ message: 'Yetkisiz erişim.' });
    return;
  }
  next();
}

export const superAdminRoutes = Router();
superAdminRoutes.use(requireSuperAdmin);

// Tüm işletmeleri listele
superAdminRoutes.get('/businesses', async (_req, res) => {
  const result = await pool.query(`
    SELECT 
      b.id, b.name, b.slug, b.is_active, b.created_at,
      u.email,
      (SELECT COUNT(*) FROM categories c WHERE c.business_id = b.id) as category_count,
      (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id) as product_count
    FROM businesses b
    LEFT JOIN users u ON u.business_id = b.id
    ORDER BY b.created_at DESC
  `);
  res.status(200).json(result.rows);
});

// Yeni işletme + kullanıcı oluştur
superAdminRoutes.post('/businesses', async (req, res) => {
  const parsed = createBusinessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz veri.', errors: parsed.error.issues });
    return;
  }

  const { business_name, slug, email, password } = parsed.data;

  const existing = await pool.query('SELECT id FROM businesses WHERE slug = $1', [slug]);
  if (existing.rowCount! > 0) {
    res.status(400).json({ message: 'Bu slug zaten kullanılıyor.' });
    return;
  }

  const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser.rowCount! > 0) {
    res.status(400).json({ message: 'Bu e-posta zaten kullanılıyor.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const businessId = randomUUID();
    const userId = randomUUID();

    await client.query(
      `INSERT INTO businesses (id, name, slug, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW(), NOW())`,
      [businessId, business_name, slug]
    );

    const passwordHash = await argon2.hash(password);
    await client.query(
      `INSERT INTO users (id, business_id, email, password_hash, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())`,
      [userId, businessId, email.toLowerCase(), passwordHash]
    );

    await client.query('COMMIT');
    res.status(201).json({ business_id: businessId, user_id: userId, slug, email });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// İşletmeyi aktif/pasif yap
superAdminRoutes.put('/businesses/:id', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  const result = await pool.query(
    `UPDATE businesses SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, slug, is_active`,
    [is_active, id]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  res.status(200).json(result.rows[0]);
});

// İşletme şifresini sıfırla
superAdminRoutes.put('/businesses/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  if (!new_password || new_password.length < 8) {
    res.status(400).json({ message: 'Şifre en az 8 karakter olmalıdır.' });
    return;
  }

  const passwordHash = await argon2.hash(new_password);
  const result = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE business_id = $2 RETURNING id`,
    [passwordHash, id]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    return;
  }

  res.status(200).json({ message: 'Şifre güncellendi.' });
});