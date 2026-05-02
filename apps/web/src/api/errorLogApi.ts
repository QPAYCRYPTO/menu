// apps/web/src/api/errorLogApi.ts
//
// Süper admin → backend hata logu API çağrıları
// Backend: /api/superadmin/errors/* endpoint'leri (requireSuperAdmin korumalı)

import { apiRequest } from './client';

export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ErrorSource = 'backend' | 'frontend' | 'external' | 'database';
export type ErrorStatus = 'new' | 'investigating' | 'resolved' | 'ignored';

export type ErrorLogRow = {
  id: string;
  severity: ErrorSeverity;
  source: ErrorSource;
  business_id: string | null;
  user_id: string | null;
  business_name: string | null;
  user_email: string | null;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  fingerprint: string;
  occurrence_count: number;
  status: ErrorStatus;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

export type ErrorListResult = {
  rows: ErrorLogRow[];
  total: number;
};

export type ErrorListFilter = {
  severity?: ErrorSeverity[];
  source?: ErrorSource[];
  status?: ErrorStatus[];
  business_id?: string;
  search?: string;
  since?: string;
  limit?: number;
  offset?: number;
};

export type ErrorStats = {
  critical_active: number;
  high_active: number;
  total_24h: number;
  total_7d: number;
};

function buildQuery(filter: ErrorListFilter): string {
  const params = new URLSearchParams();
  if (filter.severity && filter.severity.length > 0) {
    params.set('severity', filter.severity.join(','));
  }
  if (filter.source && filter.source.length > 0) {
    params.set('source', filter.source.join(','));
  }
  if (filter.status && filter.status.length > 0) {
    params.set('status', filter.status.join(','));
  }
  if (filter.business_id) params.set('business_id', filter.business_id);
  if (filter.search) params.set('search', filter.search);
  if (filter.since) params.set('since', filter.since);
  if (filter.limit !== undefined) params.set('limit', String(filter.limit));
  if (filter.offset !== undefined) params.set('offset', String(filter.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function listErrors(token: string, filter: ErrorListFilter = {}): Promise<ErrorListResult> {
  return apiRequest<ErrorListResult>(`/superadmin/errors${buildQuery(filter)}`, {
    method: 'GET',
    token
  });
}

export async function getErrorById(token: string, id: string): Promise<ErrorLogRow> {
  return apiRequest<ErrorLogRow>(`/superadmin/errors/${id}`, {
    method: 'GET',
    token
  });
}

export async function getErrorStats(token: string): Promise<ErrorStats> {
  return apiRequest<ErrorStats>('/superadmin/errors/stats', {
    method: 'GET',
    token
  });
}

export async function updateErrorStatus(
  token: string,
  id: string,
  status: 'investigating' | 'resolved' | 'ignored',
  resolutionNote?: string | null
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/superadmin/errors/${id}`, {
    method: 'PATCH',
    token,
    body: { status, resolution_note: resolutionNote ?? null }
  });
}