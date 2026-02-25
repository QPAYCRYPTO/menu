import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { pool } from '../db/postgres.js';
import { env } from '../config/env.js';

type TokenPair = {
  access_token: string;
  refresh_token: string;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

function createAccessToken(payload: { user_id: string; business_id: string; email: string }): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpiresIn });
}

export async function login(email: string, password: string): Promise<TokenPair | null> {
  const result = await pool.query(
    `SELECT id, business_id, email, password_hash
     FROM users
     WHERE email = $1 AND is_active = TRUE`,
    [email.toLowerCase()]
  );

  if (result.rowCount !== 1) {
    return null;
  }

  const user = result.rows[0];
  const passwordValid = await argon2.verify(user.password_hash, password);
  if (!passwordValid) {
    return null;
  }

  const access_token = createAccessToken({
    user_id: user.id,
    business_id: user.business_id,
    email: user.email
  });

  const refresh_token = generateOpaqueToken();
  const refresh_token_hash = hashToken(refresh_token);

  await pool.query(
    `UPDATE users
     SET refresh_token_hash = $1,
         updated_at = NOW()
     WHERE id = $2 AND business_id = $3`,
    [refresh_token_hash, user.id, user.business_id]
  );

  return { access_token, refresh_token };
}

export async function refresh(refreshToken: string): Promise<string | null> {
  const refreshTokenHash = hashToken(refreshToken);

  const result = await pool.query(
    `SELECT id, business_id, email
     FROM users
     WHERE refresh_token_hash = $1 AND is_active = TRUE`,
    [refreshTokenHash]
  );

  if (result.rowCount !== 1) {
    return null;
  }

  const user = result.rows[0];

  return createAccessToken({
    user_id: user.id,
    business_id: user.business_id,
    email: user.email
  });
}

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT id, business_id, email
     FROM users
     WHERE email = $1 AND is_active = TRUE`,
    [email.toLowerCase()]
  );

  if (result.rowCount !== 1) {
    return null;
  }

  const user = result.rows[0];
  const token = generateOpaqueToken();
  const token_hash = hashToken(token);

  await pool.query(
    `INSERT INTO password_resets (id, business_id, user_id, email, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 minutes')`,
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
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
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
           updated_at = NOW()
       WHERE id = $2 AND business_id = $3`,
      [passwordHash, resetRow.user_id, resetRow.business_id]
    );

    await client.query(
      `UPDATE password_resets
       SET used_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
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
