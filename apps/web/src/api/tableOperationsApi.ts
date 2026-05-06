// apps/web/src/api/tableOperationsApi.ts
// Masa operasyonları için typed API client
// Admin: apiRequest() ile JWT token
// Garson: doğrudan fetch() ile opaque token + X-Tab-ID header

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

// ─────────────────────────────────────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────────────────────────────────────

export type MoveSessionResult = {
  session_id: string;
  from_table: { id: string; name: string };
  to_table: { id: string; name: string };
};

export type MergeSessionsResult = {
  merge_group_id: string;
  source: { session_id: string; table_name: string; status: string };
  target: { session_id: string; table_name: string; status: string };
};

export type TransferOrdersResult = {
  transferred_count: number;
  target: { session_id: string; table_name: string };
};

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Bir hata oluştu.');
  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMİN API (JWT token ile)
// ─────────────────────────────────────────────────────────────────────────────

function adminHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// Masa taşı
export async function adminMoveSession(
  token: string,
  sessionId: string,
  targetTableId: string
): Promise<MoveSessionResult> {
  const res = await fetch(`${API_BASE_URL}/admin/table-operations/move`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ session_id: sessionId, target_table_id: targetTableId })
  });
  return handleResponse<MoveSessionResult>(res);
}

// Masa birleştir
export async function adminMergeSessions(
  token: string,
  sourceSessionId: string,
  targetSessionId: string
): Promise<MergeSessionsResult> {
  const res = await fetch(`${API_BASE_URL}/admin/table-operations/merge`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ source_session_id: sourceSessionId, target_session_id: targetSessionId })
  });
  return handleResponse<MergeSessionsResult>(res);
}

// Sipariş transfer et
export async function adminTransferOrders(
  token: string,
  orderIds: string[],
  targetSessionId: string
): Promise<TransferOrdersResult> {
  const res = await fetch(`${API_BASE_URL}/admin/table-operations/transfer-orders`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ order_ids: orderIds, target_session_id: targetSessionId })
  });
  return handleResponse<TransferOrdersResult>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// GARSON API (opaque token + X-Tab-ID ile)
// ─────────────────────────────────────────────────────────────────────────────

function waiterHeaders(token: string, tabId: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Tab-ID': tabId
  };
}

// Masa taşı
export async function waiterMoveSession(
  token: string,
  tabId: string,
  sessionId: string,
  targetTableId: string
): Promise<MoveSessionResult> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/table-operations/move`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({ session_id: sessionId, target_table_id: targetTableId })
  });
  return handleResponse<MoveSessionResult>(res);
}

// Masa birleştir
export async function waiterMergeSessions(
  token: string,
  tabId: string,
  sourceSessionId: string,
  targetSessionId: string
): Promise<MergeSessionsResult> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/table-operations/merge`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({ source_session_id: sourceSessionId, target_session_id: targetSessionId })
  });
  return handleResponse<MergeSessionsResult>(res);
}

// Sipariş transfer et
export async function waiterTransferOrders(
  token: string,
  tabId: string,
  orderIds: string[],
  targetSessionId: string
): Promise<TransferOrdersResult> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/table-operations/transfer-orders`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({ order_ids: orderIds, target_session_id: targetSessionId })
  });
  return handleResponse<TransferOrdersResult>(res);
}