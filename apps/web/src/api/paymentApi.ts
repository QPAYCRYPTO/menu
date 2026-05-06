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

export type CloseTableResult = {
  closed_session_ids: string[];
  unpaid_items_count: number;
  forced: boolean;
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
  forceClose = false
): Promise<CloseTableResult> {
  const res = await fetch(`${API_BASE_URL}/admin/payment/close-table`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ session_id: sessionId, force_close: forceClose })
  });
  // 409 = ödenmemiş item var — bu beklenen bir durum, hata fırlatma
  if (res.status === 409) {
    const data = await res.json();
    return {
      closed_session_ids: [],
      unpaid_items_count: data.unpaid_items_count ?? 0,
      forced: false
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

// Müşteri adisyon görüntüleme toggle
export async function setCustomerBillView(token: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/payment/customer-bill-view`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ enabled })
  });
  await handleResponse(res);
}