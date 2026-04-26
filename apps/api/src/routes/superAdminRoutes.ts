// apps/api/src/routes/superAdminRoutes.ts
import { Router } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { pool } from '../db/postgres.js';
import { env } from '../config/env.js';
import { setWaiterModuleEnabled } from '../services/waiterService.js';

const createBusinessSchema = z.object({
  business_name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-_]+$/, 'Slug sadece küçük harf, rakam, tire ve alt çizgi içerebilir.'),
  email: z.string().email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır.')
});

const createOwnerSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır.')
});

const resetOwnerPasswordSchema = z.object({
  new_password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır.')
});

function requireSuperAdmin(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Yetkisiz erişim.' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as any;
    if (payload.role !== 'superadmin') {
      res.status(403).json({ message: 'Bu işlem için yetkiniz yok.' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ message: 'Geçersiz token.' });
  }
}

export const superAdminRoutes = Router();
superAdminRoutes.use(requireSuperAdmin);

// ─────────────────────────────────────────────────────────────
// İŞLETMELER
// ─────────────────────────────────────────────────────────────

superAdminRoutes.get('/businesses', async (_req, res) => {
  const result = await pool.query(`
    SELECT 
      b.id, b.name, b.slug, b.is_active, b.waiter_module_enabled, b.created_at,
      (
        SELECT u.email 
        FROM users u 
        WHERE u.business_id = b.id AND u.role = 'admin' 
        ORDER BY u.created_at ASC 
        LIMIT 1
      ) as admin_email,
      (
        SELECT COUNT(*)::int
        FROM users u
        WHERE u.business_id = b.id AND u.role = 'owner' AND u.is_active = TRUE
      ) as owner_count,
      (SELECT COUNT(*) FROM categories c WHERE c.business_id = b.id) as category_count,
      (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id) as product_count
    FROM businesses b
    ORDER BY b.created_at DESC
  `);
  res.status(200).json(result.rows);
});

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

  const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
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
      `INSERT INTO users (id, business_id, email, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'admin', TRUE, NOW(), NOW())`,
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

  // İşletme pasif yapıldıysa o işletmenin tüm kullanıcılarının
  // password_version'ını artırarak mevcut oturumları iptal et.
  if (is_active === false) {
    await pool.query(
      `UPDATE users 
       SET password_version = password_version + 1, updated_at = NOW()
       WHERE business_id = $1`,
      [id]
    );
  }

  res.status(200).json(result.rows[0]);
});

superAdminRoutes.put('/businesses/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  if (!new_password || new_password.length < 8) {
    res.status(400).json({ message: 'Şifre en az 8 karakter olmalıdır.' });
    return;
  }

  const passwordHash = await argon2.hash(new_password);
  const result = await pool.query(
    `UPDATE users 
     SET password_hash = $1, password_version = password_version + 1, updated_at = NOW() 
     WHERE business_id = $2 AND role = 'admin' 
     RETURNING id`,
    [passwordHash, id]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Admin kullanıcı bulunamadı.' });
    return;
  }

  res.status(200).json({ message: 'Şifre güncellendi.' });
});

// ─────────────────────────────────────────────────────────────
// OWNER CRUD
// ─────────────────────────────────────────────────────────────

superAdminRoutes.get('/businesses/:id/owners', async (req, res) => {
  const { id } = req.params;

  const biz = await pool.query('SELECT id FROM businesses WHERE id = $1', [id]);
  if (biz.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  const result = await pool.query(
    `SELECT id, email, is_active, created_at, updated_at
     FROM users 
     WHERE business_id = $1 AND role = 'owner'
     ORDER BY created_at DESC`,
    [id]
  );
  res.status(200).json(result.rows);
});

superAdminRoutes.post('/businesses/:id/owners', async (req, res) => {
  const { id } = req.params;

  const parsed = createOwnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz veri.', errors: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  const biz = await pool.query('SELECT id FROM businesses WHERE id = $1', [id]);
  if (biz.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  const existingUser = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (existingUser.rowCount! > 0) {
    res.status(400).json({ message: 'Bu e-posta zaten kullanılıyor.' });
    return;
  }

  const userId = randomUUID();
  const passwordHash = await argon2.hash(password);

  await pool.query(
    `INSERT INTO users (id, business_id, email, password_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'owner', TRUE, NOW(), NOW())`,
    [userId, id, email.toLowerCase(), passwordHash]
  );

  res.status(201).json({
    id: userId,
    email: email.toLowerCase(),
    is_active: true,
    business_id: id
  });
});

superAdminRoutes.put('/businesses/:id/owners/:userId', async (req, res) => {
  const { id, userId } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    res.status(400).json({ message: 'is_active boolean olmalı.' });
    return;
  }

  const result = await pool.query(
    `UPDATE users 
     SET is_active = $1, password_version = password_version + 1, updated_at = NOW()
     WHERE id = $2 AND business_id = $3 AND role = 'owner'
     RETURNING id, email, is_active`,
    [is_active, userId, id]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Owner bulunamadı.' });
    return;
  }

  res.status(200).json(result.rows[0]);
});

/**
 * Owner HARD DELETE — kalıcı siler, email tekrar kullanılabilir
 */
superAdminRoutes.delete('/businesses/:id/owners/:userId', async (req, res) => {
  const { id, userId } = req.params;

  const result = await pool.query(
    `DELETE FROM users 
     WHERE id = $1 AND business_id = $2 AND role = 'owner'
     RETURNING id, email`,
    [userId, id]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Owner bulunamadı.' });
    return;
  }

  res.status(200).json({ 
    message: 'Owner kalıcı olarak silindi.',
    deleted: result.rows[0]
  });
});

superAdminRoutes.put('/businesses/:id/owners/:userId/reset-password', async (req, res) => {
  const { id, userId } = req.params;

  const parsed = resetOwnerPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0].message });
    return;
  }

  const { new_password } = parsed.data;
  const passwordHash = await argon2.hash(new_password);

  const result = await pool.query(
    `UPDATE users 
     SET password_hash = $1, password_version = password_version + 1, updated_at = NOW() 
     WHERE id = $2 AND business_id = $3 AND role = 'owner'
     RETURNING id, email`,
    [passwordHash, userId, id]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Owner bulunamadı.' });
    return;
  }

  res.status(200).json({ message: 'Şifre güncellendi.' });
});

// ─────────────────────────────────────────────────────────────────
// GARSON MODÜLÜ FLAG AÇ/KAPAT
// ─────────────────────────────────────────────────────────────────

const setWaiterModuleSchema = z.object({
  enabled: z.boolean()
});

// PATCH /api/superadmin/businesses/:id/waiter-module
// SuperAdmin bir işletme için garson modülünü açar veya kapatır
superAdminRoutes.patch('/businesses/:id/waiter-module', async (req, res) => {
  const idParsed = z.string().uuid().safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ message: 'Geçersiz işletme id.' });
    return;
  }

  const bodyParsed = setWaiterModuleSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ message: 'Geçersiz parametre (enabled: true/false).' });
    return;
  }

  const ok = await setWaiterModuleEnabled(idParsed.data, bodyParsed.data.enabled);
  if (!ok) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  res.status(200).json({ ok: true, enabled: bodyParsed.data.enabled });
});