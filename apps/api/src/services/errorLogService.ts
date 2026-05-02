// apps/api/src/services/errorLogService.ts
//
// Hata logu servisi — error_log tablosuna akıllı insert.
//
// Özellikler:
// - Fingerprint hesaplama (aynı hatayı gruplandırma)
// - 1 saatlik pencere: aynı fingerprint son 1 saatte varsa güncelle, yoksa yeni satır
// - Asenkron çağrı (fire-and-forget) — caller'ı bekletmez
// - Insert hatası kendi hata logu'na yazılmaz (sonsuz döngü riskini önler), console'a düşer

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
  /**
   * Fingerprint için ek diskriminatör (opsiyonel).
   * Genelde endpoint veya error type kullanılır.
   * Verilmezse message + stack'in ilk satırı kullanılır.
   */
  fingerprint_extra?: string;
};

/**
 * Fingerprint hesaplaması.
 *
 * Amaç: Aynı hatanın 1000 farklı satır oluşturmasını engellemek.
 * Aynı (message + endpoint + stack ilk satır) hashlenerek tek string yapılır.
 *
 * Stack'in ilk satırı: hata fırlatan dosya/satır bilgisi içerir,
 * "TypeError: undefined" gibi geneller için iyi diskriminatör.
 */
function computeFingerprint(input: ErrorLogInput): string {
  // Message'ın ilk 200 karakterini al (uzun stack trace mesajları için)
  const messageNorm = (input.message ?? '').slice(0, 200).trim();

  // Stack'in ilk anlamlı satırı (mesaj satırı hariç)
  const stackFirstLine = input.stack
    ? input.stack
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('at '))
        .slice(0, 1)
        .join('')
    : '';

  // Ek diskriminatör (endpoint, error type vs.)
  const extra = input.fingerprint_extra ?? '';

  const raw = `${input.source}|${messageNorm}|${stackFirstLine}|${extra}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Asenkron olarak hata logu yaratır veya günceller.
 *
 * Mantık:
 *  1. Fingerprint hesapla
 *  2. Son 1 saatte aynı fingerprint+status='new' var mı?
 *     - Varsa: occurrence_count++, last_seen_at = NOW(), context'i güncelle
 *     - Yoksa: yeni satır
 *
 * Bu fonksiyon hiçbir zaman caller'a hata fırlatmaz —
 * insert başarısızsa console.error'a düşer ve sessizce devam eder.
 */
export function logError(input: ErrorLogInput): void {
  // Asenkron — caller bekletilmez
  setImmediate(() => {
    persistErrorLog(input).catch((err) => {
      // Sonsuz döngü riski: error_log insert'i kendi kendine log atmasın
      console.error('[errorLogService] Insert failed:', err instanceof Error ? err.message : err);
    });
  });
}

async function persistErrorLog(input: ErrorLogInput): Promise<void> {
  const fingerprint = computeFingerprint(input);
  const contextJson = input.context ? JSON.stringify(input.context) : null;

  // Önce: Aynı fingerprint son 1 saatte var mı?
  // 1 saatlik pencere: aynı hata kümeleri tek satırda toplanır,
  // ama saatlik trend de korunur (yeni saatte yeni satır açılır).
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
    // GÜNCELLE: occurrence_count++, last_seen_at = NOW()
    await pool.query(
      `UPDATE error_log
       SET occurrence_count = occurrence_count + 1,
           last_seen_at = NOW(),
           -- En son context'i sakla (debug için son durumu görmek lazım)
           context = COALESCE($1::jsonb, context)
       WHERE id = $2`,
      [contextJson, existing.rows[0].id]
    );
    return;
  }

  // YENİ SATIR
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

/**
 * Süper admin için hata listesi (filtreli).
 */
export type ListErrorsFilter = {
  severity?: ErrorSeverity[];
  source?: ErrorLogSource[];
  status?: Array<'new' | 'investigating' | 'resolved' | 'ignored'>;
  business_id?: string;
  search?: string;        // message içinde arama
  since?: string;          // ISO date — bu tarihten sonrası
  limit?: number;
  offset?: number;
};

export type ErrorLogRow = {
  id: string;
  severity: ErrorSeverity;
  source: ErrorLogSource;
  business_id: string | null;
  user_id: string | null;
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

export async function listErrors(filter: ListErrorsFilter): Promise<{
  rows: ErrorLogRow[];
  total: number;
}> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.severity && filter.severity.length > 0) {
    params.push(filter.severity);
    where.push(`severity = ANY($${params.length}::text[])`);
  }

  if (filter.source && filter.source.length > 0) {
    params.push(filter.source);
    where.push(`source = ANY($${params.length}::text[])`);
  }

  if (filter.status && filter.status.length > 0) {
    params.push(filter.status);
    where.push(`status = ANY($${params.length}::text[])`);
  }

  if (filter.business_id) {
    params.push(filter.business_id);
    where.push(`business_id = $${params.length}`);
  }

  if (filter.search && filter.search.trim().length > 0) {
    params.push(`%${filter.search.trim()}%`);
    where.push(`message ILIKE $${params.length}`);
  }

  if (filter.since) {
    params.push(filter.since);
    where.push(`last_seen_at >= $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // Toplam sayı
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM error_log ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  // Liste
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const listResult = await pool.query<ErrorLogRow>(
    `SELECT
       id, severity, source, business_id, user_id, message, stack, context,
       fingerprint, occurrence_count, status,
       first_seen_at, last_seen_at, resolved_at, resolved_by, resolution_note
     FROM error_log
     ${whereClause}
     ORDER BY
       CASE severity
         WHEN 'CRITICAL' THEN 1
         WHEN 'HIGH' THEN 2
         WHEN 'MEDIUM' THEN 3
         WHEN 'LOW' THEN 4
       END,
       last_seen_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return { rows: listResult.rows, total };
}

export async function getErrorById(id: string): Promise<ErrorLogRow | null> {
  const result = await pool.query<ErrorLogRow>(
    `SELECT
       id, severity, source, business_id, user_id, message, stack, context,
       fingerprint, occurrence_count, status,
       first_seen_at, last_seen_at, resolved_at, resolved_by, resolution_note
     FROM error_log
     WHERE id = $1`,
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

/**
 * Dashboard widget için özet istatistik.
 */
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