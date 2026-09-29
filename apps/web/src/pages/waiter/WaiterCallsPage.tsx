// apps/web/src/pages/waiter/WaiterCallsPage.tsx
// CHANGELOG v2:
// - Admin OrdersPage CallCard tasarımı birebir aynı
// - Tarih + saat + canlı sayaç (hh:mm:ss formatında)
// - "kaç saniye/dakika önce" bilgisi
// - Header rozeti: kaç çağrı + kaç acil
// - Atölye tasarımı: gece/gündüz uyumlu kartlar ve durum renkleri (--state-*)
// - "Sipariş Hazır" kartları: mutfak hazır dedi → garson "Teslim Edildi" diyene kadar en üstte kalır

import { useEffect, useState } from 'react';
import { useWaiterCalls } from '../../context/WaiterCallsContext';
import { getCallType } from '../../lib/callTypes';
import { CallTypeBadge } from '../../components/CallTypeBadge';
import type { WaiterActiveCall, WaiterReadyOrder } from '../../api/waiterPublicApi';
import { AlertTriangle, BellOff, Bell, Calendar, Check, CheckCheck, ChefHat, Clock, MapPin, NotebookPen, RefreshCw, Timer } from 'lucide-react';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('tr-TR', {
    hour: '2-digit', minute: '2-digit'
  });
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}sn önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa önce`;
  return `${Math.floor(diff / 86400)}g önce`;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useLiveElapsed(dateStr: string): string {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(dateStr).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dateStr]);
  return formatDuration(elapsed);
}

function LiveTimerBadge({ dateStr }: { dateStr: string }) {
  const elapsed = useLiveElapsed(dateStr);
  return (
    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 bg-state-warn-bg text-state-warn"
      title="Çağrı yapıldıktan beri geçen süre">
      <Timer size={12} aria-hidden /> {elapsed}
    </span>
  );
}

type ToastState = { message: string; type: 'error' | 'success' } | null;

// Durum renginde dolu buton/rozet: yazı zemin rengiyle (--bg) → gündüz açık, gece koyu; iki temada da okunur
const solid = (state: 'ok' | 'danger') => ({ background: `var(--state-${state})`, color: 'var(--bg)' });

/** Mutfaktan hazır sipariş — teslim edilene kadar kalıcı */
function ReadyOrderCard({ order, onDeliver }: {
  order: WaiterReadyOrder;
  onDeliver: (orderId: string) => Promise<void>;
}) {
  const [delivering, setDelivering] = useState(false);

  async function handleDeliver() {
    if (delivering) return;
    setDelivering(true);
    try {
      await onDeliver(order.id);
    } finally {
      setDelivering(false);
    }
  }

  return (
    <div className="ui-card rounded-3xl overflow-hidden mb-3 fade-enter" style={{ borderLeft: '5px solid var(--state-ok)' }}>
      <div className="px-4 py-3.5 bg-state-ok-bg border-b border-line flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={solid('ok')}>
          <ChefHat size={28} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-state-ok mb-0.5">Mutfaktan hazır</div>
          <div className="font-serif font-bold text-lg leading-tight flex items-center gap-1">
            <MapPin size={16} aria-hidden /> {order.table_name}
          </div>
          <div className="text-xs mt-0.5 text-ink-muted">Sipariş hazır — masaya götür</div>
        </div>
        <div className="shrink-0">
          <LiveTimerBadge dateStr={order.ready_at} />
        </div>
      </div>

      <ul className="px-4 py-2.5 space-y-1.5">
        {order.items.map((item, idx) => (
          <li key={idx} className="text-sm">
            <span className="font-extrabold text-state-ok mr-1.5">{item.quantity}×</span>
            <span className="font-semibold">{item.product_name}</span>
            {item.note && item.note.trim() && (
              <span className="block text-xs text-state-warn font-semibold ml-6 mt-0.5">↳ {item.note}</span>
            )}
          </li>
        ))}
      </ul>

      {order.note && order.note.trim() && (
        <div className="px-4 pb-2">
          <div className="bg-surface-2 border border-line text-xs px-2.5 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
            <NotebookPen size={12} className="shrink-0 text-accent" aria-hidden /> {order.note}
          </div>
        </div>
      )}

      <div className="px-4 pt-2 pb-4 border-t border-line">
        <button onClick={handleDeliver} disabled={delivering}
          className="btn-primary w-full py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-60 flex items-center justify-center gap-1.5">
          {delivering ? 'İşleniyor...' : <><CheckCheck size={16} aria-hidden /> Teslim Edildi</>}
        </button>
      </div>
    </div>
  );
}

function CallCard({ call, onTake }: {
  call: WaiterActiveCall;
  onTake: (callId: string) => Promise<void>;
}) {
  const info = getCallType(call.call_type);
  const [taking, setTaking] = useState(false);
  const tone = info.critical ? 'danger' : 'warn';

  async function handleTake() {
    if (taking) return;
    setTaking(true);
    try {
      await onTake(call.id);
    } finally {
      setTaking(false);
    }
  }

  return (
    <div className="ui-card rounded-3xl overflow-hidden mb-3 fade-enter"
      style={{
        borderLeft: `5px solid var(--state-${tone})`,
        animation: info.critical ? 'pulse-call 1.5s ease-in-out infinite' : undefined
      }}>

      <style>{`
        @keyframes pulse-call {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--state-danger) 45%, transparent); }
          50% { box-shadow: 0 0 0 12px color-mix(in srgb, var(--state-danger) 0%, transparent); }
        }
      `}</style>

      {/* Üst — çağrı türü ikonu + label + sayaç */}
      <div className={`px-4 py-3.5 border-b border-line flex items-center gap-3.5 ${info.critical ? 'bg-state-danger-bg' : 'bg-state-warn-bg'}`}>
        <CallTypeBadge callType={call.call_type} size={56} filled />
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] font-extrabold uppercase tracking-wider mb-0.5 ${info.critical ? 'text-state-danger' : 'text-state-warn'}`}>
            {info.critical ? <span className="inline-flex items-center gap-1"><AlertTriangle size={12} aria-hidden /> Acil İstek</span> : 'Çağrı'}
          </div>
          <div className="font-serif font-bold text-lg leading-tight">
            {info.label}
          </div>
          <div className="font-bold text-sm mt-0.5 text-ink-muted flex items-center gap-1">
            <MapPin size={14} aria-hidden /> {call.table_name}
          </div>
        </div>
        <div className="shrink-0">
          <LiveTimerBadge dateStr={call.created_at} />
        </div>
      </div>

      {/* "Diğer" türü için müşteri açıklaması */}
      {call.call_type === 'other' && call.note && (
        <div className="px-4 py-2.5 bg-surface-2 border-b border-line">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-1 text-ink-muted">
            <span className="inline-flex items-center gap-1"><NotebookPen size={12} aria-hidden /> Müşteri Açıklaması</span>
          </div>
          <div className="text-sm leading-snug">
            {call.note}
          </div>
        </div>
      )}

      {/* Diğer türlerde note varsa */}
      {call.call_type !== 'other' && call.note && call.note.trim() && (
        <div className="px-4 py-2">
          <div className="bg-surface-2 border border-line text-xs px-2.5 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
            <NotebookPen size={12} className="shrink-0 text-accent" aria-hidden /> {call.note}
          </div>
        </div>
      )}

      {/* Tarih + saat + ne kadar zaman önce */}
      <div className="px-4 py-2 border-t border-line">
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-ink-muted">
          <span className="font-mono inline-flex items-center gap-1"><Calendar size={12} aria-hidden /> {formatDate(call.created_at)}</span>
          <span>·</span>
          <span className="font-mono inline-flex items-center gap-1"><Clock size={12} aria-hidden /> {formatTime(call.created_at)}</span>
          <span>·</span>
          <span>{timeAgo(call.created_at)}</span>
        </div>
      </div>

      {/* Aksiyon butonu: acil istekte kırmızı dolgu, diğerlerinde petrol */}
      <div className="px-4 pt-2 pb-4">
        <button onClick={handleTake} disabled={taking}
          className={`w-full py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-60 flex items-center justify-center gap-1.5 ${info.critical ? '' : 'btn-primary'}`}
          style={info.critical ? solid('danger') : undefined}>
          {taking ? 'İşleniyor...' : <><Check size={14} aria-hidden /> İlgilendim</>}
        </button>
      </div>
    </div>
  );
}

export function WaiterCallsPage() {
  const { calls, takeCall, readyOrders, deliverOrder, refresh, loading } = useWaiterCalls();
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleTake(callId: string) {
    const result = await takeCall(callId);
    if (result.ok) {
      showToast('Çağrı alındı, masaya gidebilirsin.', 'success');
    } else {
      showToast(result.error || 'Çağrı alınamadı.', 'error');
    }
  }

  async function handleDeliver(orderId: string) {
    const result = await deliverOrder(orderId);
    if (result.ok) {
      showToast('Sipariş teslim edildi.', 'success');
    } else {
      showToast(result.error || 'Teslim edilemedi.', 'error');
    }
  }

  const criticalCount = calls.filter(c => getCallType(c.call_type).critical).length;

  return (
    <div className="text-ink">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-bold fade-enter shadow-lg"
          role="status" style={solid(toast.type === 'error' ? 'danger' : 'ok')}>
          {toast.message}
        </div>
      )}

      <div className="ui-card rounded-3xl px-4 py-3 flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-serif font-bold text-xl flex items-center gap-2">
            <Bell size={18} className="text-accent" aria-hidden /> Çağrılar
          </h2>
          {calls.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-state-danger-bg text-state-danger">
              {calls.length} yeni
            </span>
          )}
          {readyOrders.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 bg-state-ok-bg text-state-ok">
              <ChefHat size={11} aria-hidden /> {readyOrders.length} hazır
            </span>
          )}
          {criticalCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold animate-pulse inline-flex items-center gap-1"
              style={solid('danger')}>
              <AlertTriangle size={11} aria-hidden /> {criticalCount} acil
            </span>
          )}
        </div>
        <button onClick={refresh} disabled={loading}
          className="btn-outline min-h-[36px] px-3.5 py-2 rounded-2xl text-xs font-bold spring-btn disabled:opacity-60 inline-flex items-center gap-1">
          <span className={loading ? 'inline-flex animate-spin' : 'inline-flex'}><RefreshCw size={12} aria-hidden /></span> Yenile
        </button>
      </div>

      {readyOrders.length > 0 && (
        <div className="mb-2">
          {readyOrders.map(order => (
            <ReadyOrderCard key={order.id} order={order} onDeliver={handleDeliver} />
          ))}
        </div>
      )}

      {calls.length === 0 && readyOrders.length === 0 ? (
        <div className="ui-card text-center py-14 px-4 rounded-3xl">
          <div className="mb-3 flex justify-center text-accent"><BellOff size={44} aria-hidden /></div>
          <div className="font-serif font-bold text-lg mb-1">Aktif çağrı yok</div>
          <p className="text-sm text-ink-muted">
            Müşteri çağırdığında burada görünür ve ses çalar.
          </p>
        </div>
      ) : (
        <div>
          {calls.map(call => (
            <CallCard key={call.id} call={call} onTake={handleTake} />
          ))}
        </div>
      )}
    </div>
  );
}
