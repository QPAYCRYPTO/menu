// apps/web/src/api/waiterPublicApi.ts
// CHANGELOG v8:
// - Tüm yetkili isteklere X-Tab-ID header'ı eklendi
// - waiterHeaders artık (token, tabId) alıyor
// - Yeni: exchangeToken (swap_token + tab_id ile yeni session başlat)
// - Yeni: logoutTab (sekme kapatılırken çağrılır)
// - Eski authByToken korundu (geriye uyumluluk için, frontend geçince kaldırılır)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

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

export type WaiterSelf = {
  id: string;
  business_id: string;
  name: string;
  /** Ünvan (Garson, Komi, Şef…); eski oturum verisinde olmayabilir */
  title?: string | null;
  permissions: WaiterPermissions;
};

export type WaiterTable = {
  id: string;
  name: string;
  sort_order: number;
  session_id: string | null;
  opened_at: string | null;
  total_int: number;
  active_calls: number;
  order_count: number;
  has_active_session: boolean;
  merge_group_id: string | null;
  /** Masa sahibi: bu adisyonda ilk siparişi alan personel */
  owner?: { id: string; name: string } | null;
  /** Bu personel masada işlem yapabilir mi (başkasının masası + yetki) */
  can_edit?: boolean;
};

export type WaiterOrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_int: number;
  note: string | null;
  waiter_id: string | null;
};

/** Onay bekleyen iptal / adet azaltma talebi (yetkisiz personel) */
export type WaiterPendingRequest = {
  id: string;
  kind: 'order_cancel' | 'item_decrease' | 'items_cancel';
  order_item_id: string | null;
  requested_quantity: number | null;
  waiter_name: string;
  /** items_cancel: iptali istenen kalemler */
  items?: Array<{ order_item_id: string; product_name: string; quantity: number }> | null;
};

export type WaiterOrder = {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
  waiter_id: string | null;
  waiter_name: string | null;
  items: WaiterOrderItem[];
  pending_requests?: WaiterPendingRequest[];
};

export type CallTypeCode =
  | 'waiter' | 'baby_chair' | 'charger' | 'bill' | 'package'
  | 'ashtray' | 'lighter' | 'cigarette' | 'water'
  | 'missing_service' | 'clean_table' | 'other';

export type WaiterCall = {
  id: string;
  note: string | null;
  call_type: CallTypeCode | null;
  created_at: string;
};

export type WaiterActiveCall = {
  id: string;
  table_id: string;
  table_name: string;
  note: string | null;
  call_type: CallTypeCode | null;
  created_at: string;
  status: string;
};

/** Mutfaktan hazır, masaya teslim bekleyen sipariş */
export type WaiterReadyOrder = {
  id: string;
  table_id: string | null;
  table_name: string;
  note: string | null;
  created_at: string;
  ready_at: string;
  items: Array<{ product_name: string; quantity: number; note: string | null }>;
};

export type WaiterTableDetail = {
  table: { id: string; name: string; sort_order: number };
  session: { id: string; opened_at: string; total_int: number } | null;
  orders: WaiterOrder[];
  active_calls: WaiterCall[];
  owner?: { id: string; name: string } | null;
  can_edit?: boolean;
};

export type WaiterMenuCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export type WaiterMenuProduct = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_int: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

export type WaiterMenu = {
  categories: WaiterMenuCategory[];
  products: WaiterMenuProduct[];
};

export type CartItem = {
  product_id: string;
  product_name: string;
  price_int: number;
  quantity: number;
  note?: string;
};

export const CANCEL_REASON_OPTIONS = [
  { code: 'customer_cancelled', label: 'Müşteri vazgeçti' },
  { code: 'customer_left', label: 'Müşteri gitti' },
  { code: 'not_claimed', label: 'Hazır ama alıcı yok' },
  { code: 'no_payment', label: 'Ödemeden gitti' },
  { code: 'wrong_order', label: 'Yanlış sipariş' },
  { code: 'out_of_stock', label: 'Ürün stokta yok' },
  { code: 'other', label: 'Diğer (açıklama yaz)' }
] as const;

export type CancelReasonCode = typeof CANCEL_REASON_OPTIONS[number]['code'];

export type WaiterAuthSuccess = {
  ok: true;
  waiter: WaiterSelf;
  session_id: string | null;
};

export type WaiterAuthFailure = {
  ok: false;
  reason: 'invalid_token' | 'expired' | 'revoked' | 'waiter_inactive' | 'business_suspended' | 'module_disabled' | 'invalid_credentials' | 'invalid_tab' | 'network_error' | 'no_token';
};

export type WaiterAuthResponse = WaiterAuthSuccess | WaiterAuthFailure;

async function handleAuthResponse(res: Response): Promise<WaiterAuthResponse> {
  // Yoğunluk sınırı (429) ya da sunucu hatası oturumu geçersiz kılmaz: geçici sayılır, oturum silinmez
  if (res.status === 429 || res.status >= 500) return { ok: false, reason: 'network_error' };
  try {
    const data = await res.json();
    if (res.ok && data.ok) {
      return data as WaiterAuthSuccess;
    }
    return { ok: false, reason: data.reason ?? 'invalid_credentials' };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

/**
 * YENİ: token + tab_id header'lı request için
 */
function waiterHeaders(token: string, tabId: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Tab-ID': tabId
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Oturum sunucuda geçersiz (süre doldu, link iptal/yenilendi…) → WaiterAuthContext oturumu kapatır.
    // Mesaj 'reason:' ile başlar: sayfalardaki eski `includes('reason')` kontrolleri de çalışır.
    const reason = (data as { reason?: string }).reason ?? 'invalid_tab';
    window.dispatchEvent(new CustomEvent('atlasqr:waiter-unauthorized', { detail: { reason } }));
    throw new Error(`reason:${reason}`);
  }
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? 'Bir hata oluştu.');
  }
  return data as T;
}

// ============================================================================
// AUTH — Yeni güvenli yol
// ============================================================================

/**
 * YENİ: Swap token + tab_id ile session başlat.
 * /g/{token} sayfası açıldığında çağrılır.
 */
export async function exchangeToken(token: string, tabId: string): Promise<WaiterAuthResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/waiter/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tab_id: tabId })
    });
    return handleAuthResponse(res);
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

/**
 * YENİ: Tab'ı revoke et (sekme kapatılırken).
 */
export async function logoutTab(tabId: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/public/waiter/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab_id: tabId }),
      keepalive: true // sekme kapanırken bile request gitsin
    });
  } catch {
    // Logout hatası önemsiz
  }
}

// ============================================================================
// AUTH — Eski yol (geriye uyumluluk)
// ============================================================================

/**
 * ESKİ: Sadece token ile auth (tab_id olmadan).
 * Yeni kod exchangeToken kullanmalı.
 */
export async function authByToken(token: string): Promise<WaiterAuthResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/waiter/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return handleAuthResponse(res);
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

export async function loginByEmail(email: string, password: string): Promise<WaiterAuthResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/waiter/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return handleAuthResponse(res);
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

// ============================================================================
// TABLES (artık tabId zorunlu)
// ============================================================================

export async function listTables(token: string, tabId: string): Promise<WaiterTable[]> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/tables`, {
    headers: waiterHeaders(token, tabId)
  });
  return handleResponse<WaiterTable[]>(res);
}

export async function getTableDetail(token: string, tabId: string, tableId: string): Promise<WaiterTableDetail> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/tables/${tableId}`, {
    headers: waiterHeaders(token, tabId)
  });
  return handleResponse<WaiterTableDetail>(res);
}

// ============================================================================
// MENU
// ============================================================================

export async function getMenu(token: string, tabId: string): Promise<WaiterMenu> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/menu`, {
    headers: waiterHeaders(token, tabId)
  });
  return handleResponse<WaiterMenu>(res);
}

// ============================================================================
// ÇAĞRILAR
// ============================================================================

export async function listActiveCalls(token: string, tabId: string): Promise<WaiterActiveCall[]> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/calls`, {
    headers: waiterHeaders(token, tabId)
  });
  return handleResponse<WaiterActiveCall[]>(res);
}

export async function takeCall(token: string, tabId: string, callId: string): Promise<{ message: string; call_id: string }> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/calls/${callId}/take`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId)
  });
  return handleResponse(res);
}

// ============================================================================
// PROFİL + MOLA
// ============================================================================

export type WaiterProfile = {
  id: string;
  name: string;
  title: string | null;
  permissions: WaiterPermissions;
  /** Seçilebilir mola süreleri (dk) */
  break_options: number[];
  on_break: boolean;
  break_started_at: string | null;
  break_ends_at: string | null;
  /** Bu girişin (vardiyanın) bitişi; e-posta ile girişte null */
  shift_ends_at: string | null;
};

export async function getProfile(token: string, tabId: string): Promise<WaiterProfile> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/profile`, { headers: waiterHeaders(token, tabId), cache: 'no-store' });
  return handleResponse<WaiterProfile>(res);
}

export async function startBreak(token: string, tabId: string, minutes: number): Promise<{ on_break: boolean; break_started_at: string; break_ends_at: string }> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/break/start`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({ minutes })
  });
  return handleResponse(res);
}

export async function endBreak(token: string, tabId: string): Promise<{ on_break: false; duration_min: number; overdue_min: number }> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/break/end`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId)
  });
  return handleResponse(res);
}

export async function listReadyOrders(token: string, tabId: string): Promise<WaiterReadyOrder[]> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/ready-orders`, {
    headers: waiterHeaders(token, tabId)
  });
  return handleResponse<WaiterReadyOrder[]>(res);
}

export async function deliverOrder(token: string, tabId: string, orderId: string): Promise<{ message: string; order_id: string }> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/orders/${orderId}/deliver`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId)
  });
  return handleResponse(res);
}

// ============================================================================
// SİPARİŞLER
// ============================================================================

export async function createOrder(
  token: string,
  tabId: string,
  tableId: string,
  items: Array<{ product_id: string; quantity: number; note?: string }>,
  note?: string
): Promise<{ order_id: string; total_int: number; item_count: number }> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/tables/${tableId}/orders`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({ items, note })
  });
  return handleResponse(res);
}

export async function addItemsToOrder(
  token: string,
  tabId: string,
  orderId: string,
  items: Array<{ product_id: string; quantity: number; note?: string }>
): Promise<{ message: string; added_count: number }> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/orders/${orderId}/items`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({ items })
  });
  return handleResponse(res);
}

export async function updateItemQuantity(
  token: string,
  tabId: string,
  itemId: string,
  quantity: number
): Promise<{ message: string; /** true: yetki yok, admin onayına gönderildi */ pending?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/order-items/${itemId}`, {
    method: 'PATCH',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({ quantity })
  });
  return handleResponse(res);
}

export async function cancelOrder(
  token: string,
  tabId: string,
  orderId: string,
  reasonCode: CancelReasonCode,
  reasonText?: string
): Promise<{
  message: string;
  session_auto_closed?: boolean;
  /** true: yetki yok, iptal talebi admin onayına gönderildi */
  pending?: boolean;
}> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({
      reason_code: reasonCode,
      reason_text: reasonText
    })
  });
  return handleResponse(res);
}

/**
 * Ürün bazlı iptal: seçilen kalemler (adetleriyle). Tamamı seçildiyse sipariş bütünüyle iptal olur.
 * Mutfak başladıysa ve iade yetkisi yoksa admin onayına düşer (pending: true).
 */
export async function cancelOrderItems(
  token: string,
  tabId: string,
  orderId: string,
  items: Array<{ order_item_id: string; quantity: number }>,
  reasonCode: CancelReasonCode,
  reasonText?: string
): Promise<{ message: string; whole_order?: boolean; session_auto_closed?: boolean; pending?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/public/waiter/orders/${orderId}/cancel-items`, {
    method: 'POST',
    headers: waiterHeaders(token, tabId),
    body: JSON.stringify({ items, reason_code: reasonCode, reason_text: reasonText })
  });
  return handleResponse(res);
}

export function reasonToMessage(reason: WaiterAuthFailure['reason']): string {
  switch (reason) {
    case 'invalid_token': return 'Geçersiz giriş linki. Yöneticinizden yeni QR isteyin.';
    case 'expired': return 'Vardiya süren doldu. Yöneticinden yeni giriş linki iste.';
    case 'revoked': return 'Giriş linkin yenilendi ya da iptal edildi. Yöneticinden yeni linki iste.';
    case 'waiter_inactive': return 'Hesabınız pasif durumda.';
    case 'business_suspended': return 'İşletme geçici olarak hizmet dışı.';
    case 'module_disabled': return 'Personel modülü kapalı.';
    case 'invalid_credentials': return 'Email veya şifre hatalı.';
    case 'invalid_tab': return 'Oturum geçersiz. Lütfen tekrar QR ile girin.';
    case 'network_error': return 'Bağlantı hatası. Tekrar deneyin.';
    case 'no_token': return 'Oturum yok. Lütfen giriş yapın.';
    default: return 'Bir hata oluştu.';
  }
}