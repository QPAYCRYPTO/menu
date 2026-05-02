// apps/api/src/services/errorLogService.ts
//
// Hata logu servisi — error_log tablosuna akıllı insert.
// Listelemede businesses + users JOIN ile business_name + user_email görünür.

import { createHash } from 'crypto';
import { pool } from '../db/postgres.js';
import type { ErrorSeverity } from '../errors/AppError.js';

export type ErrorLogSource = 'backend' | 'frontend' | 'external' | 'database';

export type ErrorLogInput = {
  severity: ErrorSeverity;
  source: ErrorLogSource;
  message: string;
  stack?: string | null;
  context?: Record<string, unknown> | null;
  business_id?: string | null;
  user_id?: string | null;
  fingerprint_extra?: string;
};

function computeFingerprint(input: ErrorLogInput): string {
  const messageNorm = (input.message ?? '').slice(0, 200).trim();
  const stackFirstLine = input.stack
    ? input.stack
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('at '))
        .slice(0, 1)
        .join('')
    : '';
  const extra = input.fingerprint_extra ?? '';
  const raw = `${input.source}|${messageNorm}|${stackFirstLine}|${extra}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function logError(input: ErrorLogInput): void {
  setImmediate(() => {
    persistErrorLog(input).catch((err) => {
      console.error('[errorLogService] Insert failed:', err instanceof Error ? err.message : err);
    });
  });
}

async function persistErrorLog(input: ErrorLogInput): Promise<void> {
  const fingerprint = computeFingerprint(input);
  const contextJson = input.context ? JSON.stringify(input.context) : null;

  const existing = await pool.query(
    `SELECT id FROM error_log
     WHERE fingerprint = $1
       AND status = 'new'
       AND last_seen_at > NOW() - INTERVAL '1 hour'
     ORDER BY last_seen_at DESC
     LIMIT 1`,
    [fingerprint]
  );

  if ((existing.rowCount ?? 0) > 0) {
    await pool.query(
      `UPDATE error_log
       SET occurrence_count = occurrence_count + 1,
           last_seen_at = NOW(),
           context = COALESCE($1::jsonb, context)
       WHERE id = $2`,
      [contextJson, existing.rows[0].id]
    );
    return;
  }

  await pool.query(
    `INSERT INTO error_log
       (severity, source, business_id, user_id, message, stack, context, fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      input.severity,
      input.source,
      input.business_id ?? null,
      input.user_id ?? null,
      input.message,
      input.stack ?? null,
      contextJson,
      fingerprint
    ]
  );
}

// ===================================================================
// LİSTELEME / DETAY / GÜNCELLEME / İSTATİSTİK
// ===================================================================

export type ListErrorsFilter = {
  severity?: ErrorSeverity[];
  source?: ErrorLogSource[];
  status?: Array<'new' | 'investigating' | 'resolved' | 'ignored'>;
  business_id?: string;
  search?: string;
  since?: string;
  limit?: number;
  offset?: number;
};

export type ErrorLogRow = {
  id: string;
  severity: ErrorSeverity;
  source: ErrorLogSource;
  business_id: string | null;
  user_id: string | null;
  business_name: string | null;
  user_email: string | null;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  fingerprint: string;
  occurrence_count: number;
  status: 'new' | 'investigating' | 'resolved' | 'ignored';
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

const SELECT_COLUMNS = `
  el.id, el.severity, el.source, el.business_id, el.user_id,
  b.name AS business_name,
  u.email AS user_email,
  el.message, el.stack, el.context,
  el.fingerprint, el.occurrence_count, el.status,
  el.first_seen_at, el.last_seen_at, el.resolved_at, el.resolved_by, el.resolution_note
`;

const FROM_WITH_JOINS = `
  FROM error_log el
  LEFT JOIN businesses b ON b.id = el.business_id
  LEFT JOIN users u ON u.id = el.user_id
`;

export async function listErrors(filter: ListErrorsFilter): Promise<{
  rows: ErrorLogRow[];
  total: number;
}> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.severity && filter.severity.length > 0) {
    params.push(filter.severity);
    where.push(`el.severity = ANY($${params.length}::text[])`);
  }

  if (filter.source && filter.source.length > 0) {
    params.push(filter.source);
    where.push(`el.source = ANY($${params.length}::text[])`);
  }

  if (filter.status && filter.status.length > 0) {
    params.push(filter.status);
    where.push(`el.status = ANY($${params.length}::text[])`);
  }

  if (filter.business_id) {
    params.push(filter.business_id);
    where.push(`el.business_id = $${params.length}`);
  }

  if (filter.search && filter.search.trim().length > 0) {
    params.push(`%${filter.search.trim()}%`);
    where.push(`el.message ILIKE $${params.length}`);
  }

  if (filter.since) {
    params.push(filter.since);
    where.push(`el.last_seen_at >= $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM error_log el ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const listResult = await pool.query<ErrorLogRow>(
    `SELECT ${SELECT_COLUMNS}
     ${FROM_WITH_JOINS}
     ${whereClause}
     ORDER BY
       CASE el.severity
         WHEN 'CRITICAL' THEN 1
         WHEN 'HIGH' THEN 2
         WHEN 'MEDIUM' THEN 3
         WHEN 'LOW' THEN 4
       END,
       el.last_seen_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return { rows: listResult.rows, total };
}

export async function getErrorById(id: string): Promise<ErrorLogRow | null> {
  const result = await pool.query<ErrorLogRow>(
    `SELECT ${SELECT_COLUMNS}
     ${FROM_WITH_JOINS}
     WHERE el.id = $1`,
    [id]
  );
  return result.rowCount === 1 ? result.rows[0] : null;
}

export async function updateErrorStatus(
  id: string,
  status: 'investigating' | 'resolved' | 'ignored',
  userId: string | null,
  resolutionNote?: string | null
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE error_log
     SET status = $1,
         resolved_at = CASE WHEN $1 IN ('resolved','ignored') THEN NOW() ELSE NULL END,
         resolved_by = CASE WHEN $1 IN ('resolved','ignored') THEN $2 ELSE NULL END,
         resolution_note = COALESCE($3, resolution_note)
     WHERE id = $4
     RETURNING id`,
    [status, userId, resolutionNote ?? null, id]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function getErrorStats(): Promise<{
  critical_active: number;
  high_active: number;
  total_24h: number;
  total_7d: number;
}> {
  const result = await pool.query<{
    critical_active: string;
    high_active: string;
    total_24h: string;
    total_7d: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM error_log WHERE severity = 'CRITICAL' AND status = 'new') AS critical_active,
       (SELECT COUNT(*)::text FROM error_log WHERE severity = 'HIGH' AND status = 'new') AS high_active,
       (SELECT COUNT(*)::text FROM error_log WHERE last_seen_at > NOW() - INTERVAL '24 hours') AS total_24h,
       (SELECT COUNT(*)::text FROM error_log WHERE last_seen_at > NOW() - INTERVAL '7 days') AS total_7d`
  );

  const row = result.rows[0];
  return {
    critical_active: parseInt(row?.critical_active ?? '0', 10),
    high_active: parseInt(row?.high_active ?? '0', 10),
    total_24h: parseInt(row?.total_24h ?? '0', 10),
    total_7d: parseInt(row?.total_7d ?? '0', 10)
  };
}