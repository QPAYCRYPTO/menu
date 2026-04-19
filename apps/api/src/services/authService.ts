// apps/api/src/services/authService.ts
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { pool } from '../db/postgres.js';
import { env } from '../config/env.js';

type TokenPair = {
  access_token: string;
  refresh_token: string;
  role: 'admin' | 'superadmin' | 'owner';
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

function createAccessToken(payload: { user_id: string; business_id: string | null; email: string; role: string; password_version: number }): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpiresIn as any });
}

export async function login(email: string, password: string): Promise<TokenPair | null> {
  // Kullanıcı + işletme durumu birlikte çek
  // superadmin'in business_id'si NULL olabilir, ona LEFT JOIN
  const result = await pool.query(
    `SELECT 
       u.id, u.business_id, u.email, u.password_hash, u.role, u.password_version,
       b.is_active AS business_active
     FROM users u
     LEFT JOIN businesses b ON b.id = u.business_id
     WHERE u.email = $1 AND u.is_active = TRUE`,
    [email.toLowerCase()]
  );

  if (result.rowCount !== 1) return null;

  const user = result.rows[0];
  const passwordValid = await argon2.verify(user.password_hash, password);
  if (!passwordValid) return null;

  // İşletmeye bağlı kullanıcılar için işletme aktif olmalı
  // (superadmin business_id NULL olabilir, ona dokunma)
  if (user.business_id !== null && user.business_active === false) {
    return null; // işletme pasif → login red
  }

  const role = user.role ?? 'admin';

  const access_token = createAccessToken({
    user_id: user.id,
    business_id: user.business_id,
    email: user.email,
    role,
    password_version: user.password_version ?? 1
  });

  const refresh_token = generateOpaqueToken();
  const refresh_token_hash = hashToken(refresh_token);

  await pool.query(
    `UPDATE users SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2`,
    [refresh_token_hash, user.id]
  );

  return { access_token, refresh_token, role };
}

export async function refresh(refreshToken: string): Promise<string | null> {
  const refreshTokenHash = hashToken(refreshToken);

  const result = await pool.query(
    `SELECT 
       u.id, u.business_id, u.email, u.role, u.password_version,
       b.is_active AS business_active
     FROM users u
     LEFT JOIN businesses b ON b.id = u.business_id
     WHERE u.refresh_token_hash = $1 AND u.is_active = TRUE`,
    [refreshTokenHash]
  );

  if (result.rowCount !== 1) return null;

  const user = result.rows[0];

  // İşletme pasifse refresh verme
  if (user.business_id !== null && user.business_active === false) {
    return null;
  }

  return createAccessToken({
    user_id: user.id,
    business_id: user.business_id,
    email: user.email,
    role: user.role ?? 'admin',
    password_version: user.password_version ?? 1
  });
}

export async function createPasswordResetToken(email: string): Promise<string | null> {
  // Şifre sıfırlama linki: işletme pasif olsa bile verelim mi?
  // Verelim — kullanıcı sonradan aktive olabilir, linkin işine yaraması için
  const result = await pool.query(
    `SELECT id, business_id, email
     FROM users
     WHERE email = $1 AND is_active = TRUE`,
    [email.toLowerCase()]
  );

  if (result.rowCount !== 1) return null;

  const user = result.rows[0];
  const token = generateOpaqueToken();
  const token_hash = hashToken(token);

  await pool.query(
    `INSERT INTO password_resets (id, business_id, user_id, email, token_hash, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 minutes', NOW(), NOW())`,
    [randomUUID(), user.business_id, user.id, user.email, token_hash]
  );

  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const resetResult = await client.query(
      `SELECT id, business_id, user_id
       FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (resetResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      return false;
    }

    const resetRow = resetResult.rows[0];
    const passwordHash = await argon2.hash(newPassword);

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           refresh_token_hash = NULL,
           password_version = password_version + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, resetRow.user_id]
    );

    await client.query(
      `UPDATE password_resets SET used_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [resetRow.id]
    );

    await client.query('COMMIT');
    return true;
  } catch {
    await client.query('ROLLBACK');
    return false;
  } finally {
    client.release();
  }
}