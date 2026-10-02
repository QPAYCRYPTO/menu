// apps/web/src/api/waiterAdminApi.ts
// Admin tarafı garson yönetim API çağrıları — v2

import { authFetch } from './client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

export type WaiterStatus = 'active' | 'on_leave' | 'inactive';

/** Personel yetkileri (piyasa modeli). Kurallar: api/src/services/staffPermissions.ts */
export type WaiterPermissions = {
  /** Mutfak başladıktan sonra iptal/azaltma (iade) doğrudan; yoksa admin onayına düşer */
  can_refund: boolean;
  can_see_other_tables: boolean;
  /** Başka personelin masasında sipariş / adet / iptal / taşıma */
  can_edit_other_tables: boolean;
  can_transfer_table: boolean;
  can_merge_tables: boolean;
  can_use_break: boolean;
};

/** Hazır yetki şablonları (Toast / SambaPOS'taki rol ayrımına göre); admin sonra tek tek değiştirebilir */
export const PERMISSION_TEMPLATES: { key: string; label: string; desc: string; permissions: WaiterPermissions }[] = [
  {
    key: 'komi', label: 'Komi', desc: 'Servise yardım: iade onaya, başkasının masasında işlem yok',
    permissions: { can_refund: false, can_see_other_tables: true, can_edit_other_tables: false, can_transfer_table: false, can_merge_tables: false, can_use_break: true }
  },
  {
    key: 'garson', label: 'Garson', desc: 'Kendi masaları: iade onaya, masa taşıyabilir',
    permissions: { can_refund: false, can_see_other_tables: true, can_edit_other_tables: false, can_transfer_table: true, can_merge_tables: false, can_use_break: true }
  },
  {
    key: 'sef', label: 'Şef Garson', desc: 'Salon sorumlusu: iade dahil tüm işlemler',
    permissions: { can_refund: true, can_see_other_tables: true, can_edit_other_tables: true, can_transfer_table: true, can_merge_tables: true, can_use_break: true }
  }
];

/** Yeni personel = "Garson" şablonu */
export const DEFAULT_PERMISSIONS: WaiterPermissions = { ...PERMISSION_TEMPLATES[1].permissions };

export type Waiter = {
  id: string;
  business_id: string;
  name: string;
  /** Serbest yazılan ünvan (Garson, Komi, Şef…) */
  title: string | null;
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

export type WaiterTokenResponse = {
  token: string;
  expires_at: string;
  session_id: string;
  waiter_id: string;
  waiter_name: string;
  waiter_phone: string | null;
};

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? 'Bir hata oluştu.');
  }
  return data as T;
}

// ─────────────────────────────────────────────────────────────
// GARSON CRUD
// ─────────────────────────────────────────────────────────────

export async function listWaiters(token: string): Promise<Waiter[]> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters`, { headers: headers(token) });
  return handleResponse<Waiter[]>(res);
}

export async function createWaiter(
  token: string,
  input: {
    name: string;
    title?: string;
    phone?: string;
    email?: string;
    password?: string;
    permissions?: Partial<WaiterPermissions>;
  }
): Promise<Waiter> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(input)
  });
  return handleResponse<Waiter>(res);
}

export async function updateWaiter(
  token: string,
  waiterId: string,
  input: {
    name?: string;
    title?: string | null;
    phone?: string | null;
    email?: string | null;
    permissions?: Partial<WaiterPermissions>;
  }
): Promise<Waiter> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters/${waiterId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(input)
  });
  return handleResponse<Waiter>(res);
}

export async function setWaiterPassword(
  token: string,
  waiterId: string,
  password: string | null
): Promise<{ ok: boolean }> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters/${waiterId}/password`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ password })
  });
  return handleResponse<{ ok: boolean }>(res);
}

export async function setWaiterStatus(
  token: string,
  waiterId: string,
  status: WaiterStatus
): Promise<{ ok: boolean; status: WaiterStatus }> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters/${waiterId}/status`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ status })
  });
  return handleResponse<{ ok: boolean; status: WaiterStatus }>(res);
}

export async function deleteWaiter(token: string, waiterId: string): Promise<{ ok: boolean }> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters/${waiterId}`, {
    method: 'DELETE',
    headers: headers(token)
  });
  return handleResponse<{ ok: boolean }>(res);
}

// ─────────────────────────────────────────────────────────────
// QR TOKEN
// ─────────────────────────────────────────────────────────────

export async function generateWaiterToken(
  token: string,
  waiterId: string,
  hoursValid: number
): Promise<WaiterTokenResponse> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters/${waiterId}/token`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ hours_valid: hoursValid })
  });
  return handleResponse<WaiterTokenResponse>(res);
}

export async function listWaiterSessions(token: string, waiterId: string): Promise<WaiterSession[]> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters/${waiterId}/sessions`, {
    headers: headers(token)
  });
  return handleResponse<WaiterSession[]>(res);
}

export async function revokeWaiterSession(token: string, sessionId: string): Promise<{ ok: boolean }> {
  const res = await authFetch(`${API_BASE_URL}/admin/waiters/sessions/${sessionId}/revoke`, {
    method: 'POST',
    headers: headers(token)
  });
  return handleResponse<{ ok: boolean }>(res);
}