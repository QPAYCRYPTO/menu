// apps/web/src/lib/changeRequests.ts
// Admin: onaya düşen sipariş değişiklikleri (yetkisiz personelin iptal / adet azaltma talepleri).
// Panel ve Siparişler sayfası aynı kancayı kullanır; talep olayları (SSE → OrderContext →
// 'atlasqr:change-request') gelince ve 30 sn'de bir tazelenir.
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export type ChangeRequest = {
  id: string;
  kind: 'order_cancel' | 'item_decrease' | 'items_cancel';
  order_id: string;
  order_item_id: string | null;
  table_name: string;
  order_status: string;
  product_name: string | null;
  old_quantity: number | null;
  requested_quantity: number | null;
  reason_code: string | null;
  reason_text: string | null;
  waiter_name: string;
  created_at: string;
  /** items_cancel: iptali istenen kalemler */
  items?: Array<{ order_item_id: string; product_name: string; quantity: number; price_int: number }> | null;
};

export const CHANGE_REQUEST_EVENT = 'atlasqr:change-request';

export const CANCEL_REASON_LABELS: Record<string, string> = {
  customer_cancelled: 'Müşteri vazgeçti',
  customer_left: 'Müşteri gitti',
  not_claimed: 'Hazır ama alıcı yok',
  no_payment: 'Ödemeden gitti',
  wrong_order: 'Yanlış sipariş',
  out_of_stock: 'Stok yok',
  other: 'Diğer'
};

/** "Ayşe · Müşteri vazgeçti — açıklama" / "Menemen 3 → 1 adet" */
export function describeRequest(r: ChangeRequest): { title: string; detail: string } {
  if (r.kind === 'items_cancel') {
    const reason = r.reason_code ? CANCEL_REASON_LABELS[r.reason_code] ?? r.reason_code : '';
    return {
      title: `${r.table_name} · ürün iptali`,
      detail: [(r.items ?? []).map(i => `${i.quantity}× ${i.product_name}`).join(', '), reason, r.reason_text].filter(Boolean).join(' — ')
    };
  }
  if (r.kind === 'order_cancel') {
    const reason = r.reason_code ? CANCEL_REASON_LABELS[r.reason_code] ?? r.reason_code : '';
    return {
      title: `${r.table_name} · sipariş iadesi`,
      detail: [reason, r.reason_text].filter(Boolean).join(' — ')
    };
  }
  return {
    title: `${r.table_name} · iade (adet azaltma)`,
    detail: `${r.product_name ?? 'Ürün'}: ${r.old_quantity} → ${r.requested_quantity} adet`
  };
}

export function useChangeRequests() {
  const { accessToken } = useAuth();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setRequests(await apiRequest<ChangeRequest[]>('/admin/change-requests', { token: accessToken }));
    } catch {
      // sessiz: bir sonraki olay/yoklamada tekrar denenir
    }
  }, [accessToken]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    window.addEventListener(CHANGE_REQUEST_EVENT, load);
    return () => { window.clearInterval(t); window.removeEventListener(CHANGE_REQUEST_EVENT, load); };
  }, [load]);

  const decide = useCallback(async (id: string, decision: 'approve' | 'reject'): Promise<string> => {
    setBusyId(id);
    try {
      const r = await apiRequest<{ status: string; message: string }>(`/admin/change-requests/${id}/${decision}`, {
        method: 'POST', token: accessToken, body: {}
      });
      setRequests(prev => prev.filter(x => x.id !== id));
      return r.message;
    } finally {
      setBusyId(null);
      load();
    }
  }, [accessToken, load]);

  return { requests, decide, busyId, reload: load };
}
