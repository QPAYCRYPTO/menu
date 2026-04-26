// apps/api/src/services/waiterService.ts
// Garson modülü iş mantığı
// v2: Yetkiler, email/şifre girişi, status (active/on_leave/inactive)

import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { pool } from '../db/postgres.js';

export type WaiterStatus = 'active' | 'on_leave' | 'inactive';

export type WaiterPermissions = {
  can_delete_items: boolean;
  can_merge_tables: boolean;
  can_transfer_table: boolean;
  can_see_other_tables: boolean;
  can_add_note: boolean;
  can_use_break: boolean;
};

export const DEFAULT_PERMISSIONS: WaiterPermissions = {
  can_delete_items: false,
  can_merge_tables: false,
  can_transfer_table: false,
  can_see_other_tables: true,
  can_add_note: true,
  can_use_break: true
};

export type Waiter = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  status: WaiterStatus;
  permissions: WaiterPermissions;
  created_at: string;
  updated_at: string;
};

export type WaiterSession = {
  id: string;
  waiter_id: string;
  business_id: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
};

export type WaiterWithToken = {
  waiter: Waiter;
  token: string;
  session_id: string;
  expires_at: string;
};

export type WaiterAuthResult =
  | { ok: true; waiter: Waiter; session_id: string | null }
  | { ok: false; reason: 'invalid_token' | 'expired' | 'revoked' | 'waiter_inactive' | 'business_suspended' | 'module_disabled' | 'invalid_credentials' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

// Waiter row'u normalize et (permissions JSONB olarak gelir)
function rowToWaiter(row: any): Waiter {
  return {
    id: row.id,
    business_id: row.business_id,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    is_active: row.is_active,
    status: row.status,
    permissions: row.permissions ?? DEFAULT_PERMISSIONS,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * İşletme için yeni garson oluştur.
 */
export async function createWaiter(
  businessId: string,
  input: {
    name: string;
    phone?: string;
    email?: string;
    password?: string;
    permissions?: Partial<WaiterPermissions>;
  }
): Promise<Waiter> {
  const flagCheck = await pool.query(
    `SELECT waiter_module_enabled FROM businesses WHERE id = $1 AND is_active = TRUE`,
    [businessId]
  );

  if (flagCheck.rowCount !== 1) {
    throw new Error('İşletme bulunamadı.');
  }

  if (flagCheck.rows[0].waiter_module_enabled !== true) {
    throw new Error('Garson modülü bu işletme için kapalı.');
  }

  const hasEmail = !!input.email?.trim();
  const hasPassword = !!input.password;

  if (hasEmail && !hasPassword) {
    throw new Error('Email ile giriş için şifre gerekli.');
  }

  if (hasEmail) {
    const existing = await pool.query(
      `SELECT id FROM waiters WHERE business_id = $1 AND LOWER(email) = LOWER($2)`,
      [businessId, input.email!.trim()]
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw new Error('Bu email zaten kullanılıyor.');
    }
  }

  const passwordHash = hasPassword ? await argon2.hash(input.password!) : null;
  const permissions = { ...DEFAULT_PERMISSIONS, ...(input.permissions ?? {}) };

  const result = await pool.query(
    `INSERT INTO waiters
       (id, business_id, name, phone, email, password_hash, permissions, status, is_active, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7::jsonb, 'active', TRUE, NOW(), NOW())
     RETURNING *`,
    [
      randomUUID(),
      businessId,
      input.name.trim(),
      input.phone?.trim() ?? null,
      input.email?.trim().toLowerCase() ?? null,
      passwordHash,
      JSON.stringify(permissions)
    ]
  );

  return rowToWaiter(result.rows[0]);
}

/**
 * İşletmenin garsonlarını listele.
 */
export async function listWaiters(
  businessId: string,
  options: { onlyActive?: boolean } = {}
): Promise<Waiter[]> {
  const whereActive = options.onlyActive ? `AND status = 'active'` : ``;

  const result = await pool.query(
    `SELECT * FROM waiters
     WHERE business_id = $1
     ${whereActive}
     ORDER BY
       CASE status
         WHEN 'active' THEN 1
         WHEN 'on_leave' THEN 2
         WHEN 'inactive' THEN 3
       END,
       created_at DESC`,
    [businessId]
  );

  return result.rows.map(rowToWaiter);
}

export async function getWaiterById(
  businessId: string,
  waiterId: string
): Promise<Waiter | null> {
  const result = await pool.query(
    `SELECT * FROM waiters WHERE id = $1 AND business_id = $2`,
    [waiterId, businessId]
  );
  return result.rowCount === 1 ? rowToWaiter(result.rows[0]) : null;
}

/**
 * Garson detaylarını güncelle (isim, telefon, email, yetkiler).
 * Şifre ayrı endpoint ile (setWaiterPassword).
 */
export async function updateWaiterDetails(
  businessId: string,
  waiterId: string,
  input: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    permissions?: Partial<WaiterPermissions>;
  }
): Promise<Waiter | null> {
  const current = await getWaiterById(businessId, waiterId);
  if (!current) return null;

  if (input.email && input.email.trim().toLowerCase() !== current.email) {
    const existing = await pool.query(
      `SELECT id FROM waiters WHERE business_id = $1 AND LOWER(email) = LOWER($2) AND id != $3`,
      [businessId, input.email.trim(), waiterId]
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw new Error('Bu email zaten başka bir garsonda kayıtlı.');
    }
  }

  const newPermissions = input.permissions
    ? { ...current.permissions, ...input.permissions }
    : current.permissions;

  const result = await pool.query(
    `UPDATE waiters
     SET
       name = COALESCE($1, name),
       phone = $2,
       email = $3,
       permissions = $4::jsonb,
       updated_at = NOW()
     WHERE id = $5 AND business_id = $6
     RETURNING *`,
    [
      input.name?.trim() ?? null,
      input.phone !== undefined ? (input.phone?.trim() ?? null) : current.phone,
      input.email !== undefined ? (input.email?.trim().toLowerCase() ?? null) : current.email,
      JSON.stringify(newPermissions),
      waiterId,
      businessId
    ]
  );

  return result.rowCount === 1 ? rowToWaiter(result.rows[0]) : null;
}

/**
 * Garsonun şifresini ayarla/sıfırla (sadece admin).
 */
export async function setWaiterPassword(
  businessId: string,
  waiterId: string,
  newPassword: string | null
): Promise<boolean> {
  const passwordHash = newPassword ? await argon2.hash(newPassword) : null;

  const result = await pool.query(
    `UPDATE waiters
     SET password_hash = $1, updated_at = NOW()
     WHERE id = $2 AND business_id = $3
     RETURNING id`,
    [passwordHash, waiterId, businessId]
  );

  return result.rowCount === 1;
}

/**
 * Garson durumunu değiştir.
 */
export async function setWaiterStatus(
  businessId: string,
  waiterId: string,
  newStatus: WaiterStatus
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const isActive = newStatus === 'active';

    const updateResult = await client.query(
      `UPDATE waiters
       SET status = $1, is_active = $2, updated_at = NOW()
       WHERE id = $3 AND business_id = $4
       RETURNING id`,
      [newStatus, isActive, waiterId, businessId]
    );

    if (updateResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      return false;
    }

    if (!isActive) {
      await client.query(
        `UPDATE waiter_sessions
         SET revoked_at = NOW()
         WHERE waiter_id = $1 AND revoked_at IS NULL`,
        [waiterId]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Garsonu kalıcı sil.
 */
export async function deleteWaiter(
  businessId: string,
  waiterId: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM waiters WHERE id = $1 AND business_id = $2 RETURNING id`,
    [waiterId, businessId]
  );
  return result.rowCount === 1;
}

/**
 * Yeni QR token üret.
 */
export async function generateWaiterToken(
  businessId: string,
  waiterId: string,
  hoursValid: number
): Promise<WaiterWithToken | null> {
  if (hoursValid < 1 || hoursValid > 12) {
    throw new Error('Geçerlilik süresi 1-12 saat arası olmalı.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const waiterResult = await client.query(
      `SELECT * FROM waiters
       WHERE id = $1 AND business_id = $2 AND status = 'active'`,
      [waiterId, businessId]
    );

    if (waiterResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      return null;
    }

    const waiter = rowToWaiter(waiterResult.rows[0]);

    await client.query(
      `UPDATE waiter_sessions
       SET revoked_at = NOW()
       WHERE waiter_id = $1 AND revoked_at IS NULL`,
      [waiterId]
    );

    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);

    const sessionInsert = await client.query(
      `INSERT INTO waiter_sessions
         (id, waiter_id, business_id, token_hash, expires_at, created_at)
       VALUES
         ($1, $2, $3, $4, NOW() + ($5 || ' hours')::interval, NOW())
       RETURNING id, expires_at`,
      [randomUUID(), waiter.id, businessId, tokenHash, hoursValid.toString()]
    );

    await client.query('COMMIT');

    return {
      waiter,
      token: rawToken,
      session_id: sessionInsert.rows[0].id,
      expires_at: sessionInsert.rows[0].expires_at
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listActiveSessionsForWaiter(
  businessId: string,
  waiterId: string
): Promise<WaiterSession[]> {
  const result = await pool.query(
    `SELECT id, waiter_id, business_id, expires_at, revoked_at, created_at, last_used_at
     FROM waiter_sessions
     WHERE waiter_id = $1 AND business_id = $2
       AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [waiterId, businessId]
  );
  return result.rows as WaiterSession[];
}

export async function revokeWaiterSession(
  businessId: string,
  sessionId: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE waiter_sessions
     SET revoked_at = NOW()
     WHERE id = $1 AND business_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [sessionId, businessId]
  );
  return result.rowCount === 1;
}

/**
 * QR token ile doğrulama.
 */
export async function authenticateWaiterByToken(rawToken: string): Promise<WaiterAuthResult> {
  const tokenHash = hashToken(rawToken);

  const result = await pool.query(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       s.revoked_at,
       w.*,
       b.is_active AS business_active,
       b.waiter_module_enabled
     FROM waiter_sessions s
     INNER JOIN waiters w ON w.id = s.waiter_id
     INNER JOIN businesses b ON b.id = w.business_id
     WHERE s.token_hash = $1`,
    [tokenHash]
  );

  if (result.rowCount !== 1) {
    return { ok: false, reason: 'invalid_token' };
  }

  const row = result.rows[0];

  if (row.revoked_at !== null) return { ok: false, reason: 'revoked' };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  if (row.status !== 'active') return { ok: false, reason: 'waiter_inactive' };
  if (row.business_active !== true) return { ok: false, reason: 'business_suspended' };
  if (row.waiter_module_enabled !== true) return { ok: false, reason: 'module_disabled' };

  await pool.query(
    `UPDATE waiter_sessions SET last_used_at = NOW() WHERE id = $1`,
    [row.session_id]
  );

  return {
    ok: true,
    waiter: rowToWaiter(row),
    session_id: row.session_id
  };
}

/**
 * Email + şifre ile garson girişi.
 */
export async function authenticateWaiterByEmail(
  email: string,
  password: string
): Promise<WaiterAuthResult> {
  const result = await pool.query(
    `SELECT
       w.*,
       b.is_active AS business_active,
       b.waiter_module_enabled
     FROM waiters w
     INNER JOIN businesses b ON b.id = w.business_id
     WHERE LOWER(w.email) = LOWER($1)`,
    [email.trim()]
  );

  if (result.rowCount !== 1) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  const row = result.rows[0];

  if (!row.password_hash) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  const passwordValid = await argon2.verify(row.password_hash, password);
  if (!passwordValid) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (row.status !== 'active') return { ok: false, reason: 'waiter_inactive' };
  if (row.business_active !== true) return { ok: false, reason: 'business_suspended' };
  if (row.waiter_module_enabled !== true) return { ok: false, reason: 'module_disabled' };

  return {
    ok: true,
    waiter: rowToWaiter(row),
    session_id: null
  };
}

/**
 * İşletmenin garson modülünü aç/kapat.
 */
export async function setWaiterModuleEnabled(
  businessId: string,
  enabled: boolean,
  client?: PoolClient
): Promise<boolean> {
  const db = client ?? pool;
  const result = await db.query(
    `UPDATE businesses
     SET waiter_module_enabled = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id`,
    [enabled, businessId]
  );
  return result.rowCount === 1;
}