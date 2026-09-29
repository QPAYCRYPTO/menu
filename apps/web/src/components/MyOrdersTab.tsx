// apps/web/src/components/MyOrdersTab.tsx
// Müşteri "Siparişlerim" sekmesi — masanın aktif adisyonu
// - Masadaki TÜM kalemler (kendi siparişlerin normal, başkalarınınki soluk)
// - Her kalemin durumu (bekliyor / hazırlanıyor / hazır / teslim / iptal)
// - Alt kısımda toplam / ödenen / kalan
// - 30 sn'de bir otomatik yenilenir; Yenile butonu sadece adisyonu yeniler
// - Tema: gece/gündüz değişkenleri (ui-card, text-ink, durum renkleri --state-*)
// Veri: GET /public/table/:slug/:table_id (active_session_id) → GET /public/sessions/:id/bill

import { useCallback, useEffect, useState } from 'react';
import {
  Ban, ChefHat, CheckCheck, CircleCheck, ClipboardList, Clock, NotebookPen, RefreshCw,
  Sparkles, User, Users, type LucideIcon
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';
const POLL_MS = 30_000;

type ItemStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

type BillItem = {
  item_id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price_int: number;
  line_total_int: number;
  note: string | null;
  is_paid: boolean;
  created_at: string;
  status: ItemStatus;
  is_mine: boolean;
  source: 'customer' | 'waiter';
};

type Bill = {
  session_id: string;
  table_name: string | null;
  items: BillItem[];
  total_int: number;
  paid_int: number;
  remaining_int: number;
};

type Props = {
  slug: string;
  tableId: string;
  token: string;
};

// Durum rozetleri: referans tasarımdaki yumuşak zemin + koyu yazı (temaya göre değişir)
const STATUS_META: Record<ItemStatus, { label: string; icon: LucideIcon; className: string }> = {
  pending:   { label: 'Bekliyor',     icon: Clock,      className: 'bg-state-warn-bg text-state-warn' },
  preparing: { label: 'Hazırlanıyor', icon: ChefHat,    className: 'bg-state-info-bg text-state-info' },
  ready:     { label: 'Hazır',        icon: Sparkles,   className: 'bg-state-ok-bg text-state-ok' },
  delivered: { label: 'Teslim',       icon: CheckCheck, className: 'bg-surface-2 text-ink-muted' },
  cancelled: { label: 'İptal',        icon: Ban,        className: 'bg-state-danger-bg text-state-danger' }
};

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

function timeLabel(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  return new Date(dateStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function MyOrdersTab({ slug, tableId, token }: Props) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const loadBill = useCallback(async () => {
    try {
      // Aktif adisyonun id'si (ilk siparişte oluşur, birleşik masada hedef masanınki)
      const tableRes = await fetch(`${API_BASE_URL}/public/table/${slug}/${tableId}`);
      if (!tableRes.ok) throw new Error('table');
      const table = await tableRes.json() as { active_session_id: string | null };

      if (!table.active_session_id) {
        setBill(null);
      } else {
        const billRes = await fetch(
          `${API_BASE_URL}/public/sessions/${table.active_session_id}/bill?token=${encodeURIComponent(token)}`
        );
        if (billRes.status === 404) setBill(null);           // adisyon bu arada kapanmış
        else if (!billRes.ok) throw new Error('bill');
        else setBill(await billRes.json() as Bill);
      }
      setError(false);
      setUpdatedAt(Date.now());
    } catch {
      setError(true); // mevcut veriyi koru, bir sonraki denemede düzelir
    } finally {
      setLoading(false);
    }
  }, [slug, tableId, token]);

  useEffect(() => {
    loadBill();
    const interval = setInterval(loadBill, POLL_MS);
    return () => clearInterval(interval);
  }, [loadBill]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    await loadBill();
    setRefreshing(false);
  }

  const header = (
    <div className="flex items-center justify-between gap-3 mb-3 px-1">
      <div className="min-w-0">
        <h2 className="font-serif font-bold text-base leading-tight">Masa Adisyonu</h2>
        <p className="text-[11px] text-ink-muted">
          {error ? 'Bağlantı sorunu — tekrar denenecek' : updatedAt ? `Güncellendi: ${timeLabel(new Date(updatedAt).toISOString())}` : ' '}
        </p>
      </div>
      <button onClick={handleRefresh} disabled={refreshing}
        aria-label="Siparişleri yenile"
        className="btn-outline px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 spring-btn disabled:opacity-60">
        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Yenile
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="ui-card rounded-3xl p-10 text-center">
        <div className="w-10 h-10 rounded-full border-2 border-line animate-spin mx-auto"
          style={{ borderTopColor: 'var(--accent)' }} />
        <p className="text-ink-muted text-sm mt-3">Adisyon yükleniyor...</p>
      </div>
    );
  }

  if (!bill || bill.items.length === 0) {
    return (
      <div>
        {header}
        <div className="ui-card rounded-3xl py-10 px-6 text-center">
          <ClipboardList size={44} className="mx-auto mb-3 text-accent" />
          <h3 className="font-serif font-bold text-base mb-1">Henüz sipariş yok</h3>
          <p className="text-ink-muted text-sm">Menüden sipariş verdiğinizde burada durumunu takip edebilirsiniz.</p>
        </div>
      </div>
    );
  }

  const myCount = bill.items.filter(i => i.is_mine).length;
  const othersCount = bill.items.length - myCount;

  return (
    <div className="pb-6">
      {header}

      {othersCount > 0 && (
        <div className="flex items-center gap-3 text-[11px] text-ink-muted mb-2.5 px-1">
          <span className="flex items-center gap-1.5"><User size={12} /> Sizin: {myCount}</span>
          <span className="flex items-center gap-1.5 opacity-70"><Users size={12} /> Masadaki diğer: {othersCount}</span>
        </div>
      )}

      <div className="space-y-2">
        {bill.items.map(item => {
          const meta = STATUS_META[item.status] ?? STATUS_META.pending;
          const StatusIcon = meta.icon;
          const cancelled = item.status === 'cancelled';
          return (
            <div key={item.item_id}
              // Başkasının siparişi: sönük zemin + kesikli kenar (okunur kalır ama sizinkinden ayrışır)
              className={`rounded-2xl p-3 ${item.is_mine ? 'ui-card' : 'bg-surface-2 text-ink border border-dashed border-line'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className={`min-w-[26px] h-[26px] px-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center flex-shrink-0 ${
                    item.is_mine ? 'btn-primary' : 'bg-surface border border-line text-ink-muted'}`}>
                    {item.quantity}×
                  </span>
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm leading-snug ${cancelled ? 'line-through text-ink-muted' : ''}`}>
                      {item.product_name}
                    </div>
                    <div className="text-[11px] text-ink-muted flex flex-wrap items-center gap-x-2 mt-0.5">
                      <span>{formatPrice(item.unit_price_int)}</span>
                      <span>• {timeLabel(item.created_at)}</span>
                      {!item.is_mine && (
                        <span className="flex items-center gap-1">
                          • {item.source === 'waiter' ? 'Garson ekledi' : 'Masadaki diğer'}
                        </span>
                      )}
                    </div>
                    {item.note && (
                      <div className="text-[11px] text-state-warn mt-1 flex items-center gap-1 font-semibold">
                        <NotebookPen size={11} /> {item.note}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${meta.className}`}>
                    <StatusIcon size={11} /> {meta.label}
                  </span>
                  <span className={`text-sm font-extrabold ${cancelled ? 'line-through text-ink-muted' : 'text-ink'}`}>
                    {formatPrice(item.line_total_int)}
                  </span>
                  {item.is_paid && !cancelled && (
                    <span className="text-[10px] font-bold text-state-ok flex items-center gap-1">
                      <CircleCheck size={11} /> Ödendi
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toplamlar */}
      <div className="ui-card rounded-3xl p-4 mt-4 space-y-1.5">
        <div className="flex justify-between text-sm text-ink-muted">
          <span>Toplam</span>
          <span className="font-bold text-ink">{formatPrice(bill.total_int)}</span>
        </div>
        {bill.paid_int > 0 && (
          <div className="flex justify-between text-sm text-state-ok">
            <span>Ödenen</span>
            <span className="font-bold">{formatPrice(bill.paid_int)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-line">
          <span className="font-bold">Kalan</span>
          <span className="font-serif font-bold text-2xl text-ink">{formatPrice(bill.remaining_int)}</span>
        </div>
      </div>
    </div>
  );
}
