// apps/web/src/api/paymentApi.ts
// Ödeme ekranı için typed API client — sadece admin kullanır

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

// ─────────────────────────────────────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────────────────────────────────────

export type BillItem = {
  item_id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  price_int: number;
  note: string | null;
  is_paid: boolean;
  paid_at: string | null;
  order_status: string;
  order_created_at: string;
};

export type BillSummary = {
  session_id: string;
  table_name: string;
  opened_at: string;
  merge_group_id: string | null;
  total_int: number;
  paid_int: number;
  remaining_int: number;
  items: BillItem[];
};

export type PayItemsResult = {
  paid_count: number;
  remaining_int: number;
  fully_paid_order_ids: string[];
};

export type OpenOrderDecision = 'customer_left' | 'no_payment';

export type OpenOrderRequiringDecision = {
  order_id: string;
  table_name: string;
  status: string;
  created_at: string;
  unpaid_total_int: number;
  items: { product_name: string; quantity: number; is_paid: boolean }[];
};

export type CloseTableResult = {
  closed_session_ids: string[];
  unpaid_items_count: number;
  remaining_int?: number;
  forced: boolean;
  // Doluysa masa kapanmadı: her sipariş için karar gerekiyor
  open_orders?: OpenOrderRequiringDecision[];
};

export type NewOrdersResult = {
  new_orders_count: number;
  new_orders: { id: string; table_name: string; created_at: string }[];
};

export type PaymentMethod = 'cash' | 'card' | 'other';

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────────────────────────────────────

function headers(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Bir hata oluştu.');
  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// API FONKSİYONLARI
// ─────────────────────────────────────────────────────────────────────────────

// Adisyon detayını getir
export async function getSessionBill(token: string, sessionId: string): Promise<BillSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/payment/session/${sessionId}`, {
    headers: headers(token)
  });
  return handleResponse<BillSummary>(res);
}

// Item'ları öde
export async function payItems(
  token: string,
  sessionId: string,
  itemIds: string[],
  paymentMethod: PaymentMethod = 'cash'
): Promise<PayItemsResult> {
  const res = await fetch(`${API_BASE_URL}/admin/payment/pay-items`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ session_id: sessionId, item_ids: itemIds, payment_method: paymentMethod })
  });
  return handleResponse<PayItemsResult>(res);
}

// Masayı kapat
export async function closeTable(
  token: string,
  sessionId: string,
  forceClose = false,
  openOrderDecisions: { order_id: string; decision: OpenOrderDecision }[] = []
): Promise<CloseTableResult> {
  const res = await fetch(`${API_BASE_URL}/admin/payment/close-table`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ session_id: sessionId, force_close: forceClose, open_order_decisions: openOrderDecisions })
  });
  // 409 = ödenmemiş item var veya açık siparişler için karar gerekiyor — beklenen durum, hata fırlatma
  if (res.status === 409) {
    const data = await res.json();
    return {
      closed_session_ids: [],
      unpaid_items_count: data.unpaid_items_count ?? 0,
      remaining_int: data.remaining_int,
      forced: false,
      open_orders: data.code === 'OPEN_ORDERS_REQUIRE_DECISION' ? data.open_orders : undefined
    };
  }
  return handleResponse<CloseTableResult>(res);
}

// Ödeme ekranı açıkken yeni sipariş geldi mi kontrol et
export async function getNewOrdersSince(
  token: string,
  sessionId: string,
  since: string
): Promise<NewOrdersResult> {
  const res = await fetch(
    `${API_BASE_URL}/admin/payment/new-orders/${sessionId}?since=${encodeURIComponent(since)}`,
    { headers: headers(token) }
  );
  return handleResponse<NewOrdersResult>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// KASA AŞAMA 2 — ödeme kaydı, indirim/ikram, hesap özeti
// ─────────────────────────────────────────────────────────────────────────────
export type LedgerMethod = 'cash' | 'card' | 'meal_card';

export type LedgerPayment = {
  id: string;
  amount_int: number;
  method: LedgerMethod;
  note: string | null;
  created_at: string;
  item_count: number;
  voided_at: string | null;
  void_reason: string | null;
  collected_by_email: string | null;
  voided_by_email: string | null;
};

export type LedgerDiscount = {
  id: string;
  type: 'discount' | 'complimentary';
  amount_int: number;
  percent: number | null;
  applies_to: 'session' | 'item';
  order_item_id: string | null;
  note: string | null;
  created_at: string;
  product_name: string | null;
  item_quantity: number | null;
  created_by_email: string | null;
};

export type SessionSummary = {
  session_id: string;
  table_name: string;
  opened_at: string;
  merge_group_id: string | null;
  total_int: number;
  discount_int: number;
  paid_int: number;
  remaining_int: number;
  items: (BillItem & { is_complimentary: boolean })[];
  payments: LedgerPayment[];
  discounts: LedgerDiscount[];
};

export async function getSessionSummary(token: string, sessionId: string): Promise<SessionSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/sessions/${sessionId}/summary`, { headers: headers(token) });
  return handleResponse<SessionSummary>(res);
}

export async function createPayment(token: string, body: {
  session_id: string; method: LedgerMethod; amount_int?: number; item_ids?: string[]; note?: string;
}): Promise<{ payment: LedgerPayment; ledger: { remaining_int: number } }> {
  const res = await fetch(`${API_BASE_URL}/admin/payments`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  return handleResponse(res);
}

export async function voidPayment(token: string, paymentId: string, reason: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/payments/${paymentId}`, {
    method: 'DELETE', headers: headers(token), body: JSON.stringify({ reason })
  });
  await handleResponse(res);
}

export async function createDiscount(token: string, body: {
  session_id: string; type: 'discount' | 'complimentary'; applies_to: 'session' | 'item';
  amount_int?: number; percent?: number; order_item_id?: string; note?: string;
}): Promise<{ discount: LedgerDiscount }> {
  const res = await fetch(`${API_BASE_URL}/admin/discounts`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  return handleResponse(res);
}

export async function voidDiscount(token: string, discountId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/discounts/${discountId}`, { method: 'DELETE', headers: headers(token) });
  await handleResponse(res);
}

// Müşteri adisyon görüntüleme toggle
export async function setCustomerBillView(token: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/payment/customer-bill-view`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ enabled })
  });
  await handleResponse(res);
}