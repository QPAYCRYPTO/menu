// apps/web/src/pages/waiter/WaiterCallsPage.tsx
// CHANGELOG v2:
// - Admin OrdersPage CallCard tasarımı birebir aynı
// - Tarih + saat + canlı sayaç (hh:mm:ss formatında)
// - "kaç saniye/dakika önce" bilgisi
// - Header rozeti: kaç çağrı + kaç acil
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
    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1"
      style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.45)' }}
      title="Çağrı yapıldıktan beri geçen süre">
      <Timer size={12} aria-hidden /> {elapsed}
    </span>
  );
}

type ToastState = { message: string; type: 'error' | 'success' } | null;

/** Mutfaktan hazır sipariş — teslim edilene kadar kalıcı */
function ReadyOrderCard({ order, onDeliver }: {
  order: WaiterReadyOrder;
  onDeliver: (orderId: string) => Promise<void>;
}) {
  const [delivering, setDelivering] = useState(false);
  const divider = 'rgba(255,255,255,0.14)';

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
    <div className="glass-dark rounded-3xl overflow-hidden mb-3 fade-enter"
      style={{ borderLeft: '5px solid #34D399', background: 'rgba(6,46,34,0.7)' }}>
      <div style={{
        padding: '14px 16px', background: 'var(--success-bg)', borderBottom: `1px solid ${divider}`,
        display: 'flex', alignItems: 'center', gap: 14
      }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white"
          style={{ background: 'linear-gradient(135deg, #34D399 0%, #059669 100%)', border: '1px solid rgba(255,255,255,0.55)' }}>
          <ChefHat size={28} aria-hidden />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--success)', marginBottom: 2 }}>
            Mutfaktan hazır
          </div>
          <div className="font-serif font-bold text-white flex items-center gap-1" style={{ fontSize: 18, lineHeight: 1.2 }}>
            <MapPin size={16} aria-hidden /> {order.table_name}
          </div>
          <div className="text-xs mt-0.5 text-white/70">Sipariş hazır — masaya götür</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <LiveTimerBadge dateStr={order.ready_at} />
        </div>
      </div>

      <ul style={{ padding: '10px 16px' }} className="space-y-1.5">
        {order.items.map((item, idx) => (
          <li key={idx} className="text-sm text-white">
            <span className="font-extrabold text-emerald-300 mr-1.5">{item.quantity}×</span>
            <span className="font-semibold">{item.product_name}</span>
            {item.note && item.note.trim() && (
              <span className="block text-xs text-amber-200 ml-6 mt-0.5">↳ {item.note}</span>
            )}
          </li>
        ))}
      </ul>

      {order.note && order.note.trim() && (
        <div style={{ padding: '0 16px 8px' }}>
          <div className="glass-pill text-xs px-2.5 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
            <NotebookPen size={12} className="shrink-0" aria-hidden /> {order.note}
          </div>
        </div>
      )}

      <div style={{ padding: '8px 16px 16px', borderTop: `1px solid ${divider}` }}>
        <button onClick={handleDeliver} disabled={delivering}
          className="w-full py-3 rounded-full text-sm font-bold text-white spring-btn disabled:opacity-60 flex items-center justify-center gap-1.5"
          style={{
            background: 'linear-gradient(135deg, #34D399 0%, #059669 100%)',
            border: '1px solid rgba(255,255,255,0.55)',
            boxShadow: '0 8px 20px rgba(5,150,105,0.4), inset 0 1px 1px rgba(255,255,255,0.7)'
          }}>
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

  const accentColor = info.critical ? 'var(--danger)' : 'var(--warning)';
  const edgeColor = info.critical ? '#FB7185' : '#FBBF24';
  const divider = 'rgba(255,255,255,0.14)';

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
    <div className="glass-dark rounded-3xl overflow-hidden mb-3 fade-enter"
      style={{
        borderLeft: `5px solid ${edgeColor}`,
        background: info.critical ? 'rgba(60,14,22,0.66)' : 'rgba(40,28,12,0.64)',
        animation: info.critical ? 'pulse-call 1.5s ease-in-out infinite' : undefined
      }}>

      <style>{`
        @keyframes pulse-call {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 113, 133, 0.45); }
          50% { box-shadow: 0 0 0 12px rgba(251, 113, 133, 0); }
        }
      `}</style>

      {/* Üst — çağrı türü ikonu + label + sayaç */}
      <div style={{
        padding: '14px 16px',
        background: info.critical ? 'var(--danger-bg)' : 'var(--warning-bg)',
        borderBottom: `1px solid ${divider}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14
      }}>
        <CallTypeBadge callType={call.call_type} size={56} filled />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: accentColor, marginBottom: 2
          }}>
            {info.critical ? <span className="inline-flex items-center gap-1"><AlertTriangle size={12} aria-hidden /> Acil İstek</span> : 'Çağrı'}
          </div>
          <div className="font-serif font-bold text-white" style={{ fontSize: 17, lineHeight: 1.2 }}>
            {info.label}
          </div>
          <div className="font-bold text-sm mt-0.5 text-white/85 flex items-center gap-1">
            <MapPin size={14} aria-hidden /> {call.table_name}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <LiveTimerBadge dateStr={call.created_at} />
        </div>
      </div>

      {/* "Diğer" türü için müşteri açıklaması */}
      {call.call_type === 'other' && call.note && (
        <div style={{
          padding: '10px 16px', background: 'rgba(0,0,0,0.22)',
          borderBottom: `1px solid ${divider}`
        }}>
          <div className="text-white/60" style={{
            fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4
          }}>
            <span className="inline-flex items-center gap-1"><NotebookPen size={12} aria-hidden /> Müşteri Açıklaması</span>
          </div>
          <div className="text-white" style={{ fontSize: 14, lineHeight: 1.4 }}>
            {call.note}
          </div>
        </div>
      )}

      {/* Diğer türlerde note varsa */}
      {call.call_type !== 'other' && call.note && call.note.trim() && (
        <div style={{ padding: '8px 16px' }}>
          <div className="glass-pill text-xs px-2.5 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
            <NotebookPen size={12} className="shrink-0" aria-hidden /> {call.note}
          </div>
        </div>
      )}

      {/* Tarih + saat + ne kadar zaman önce */}
      <div style={{ padding: '8px 16px', borderTop: `1px solid ${divider}` }}>
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-white/65">
          <span className="font-mono inline-flex items-center gap-1"><Calendar size={12} aria-hidden /> {formatDate(call.created_at)}</span>
          <span className="text-white/30">·</span>
          <span className="font-mono inline-flex items-center gap-1"><Clock size={12} aria-hidden /> {formatTime(call.created_at)}</span>
          <span className="text-white/30">·</span>
          <span>{timeAgo(call.created_at)}</span>
        </div>
      </div>

      {/* Aksiyon butonu */}
      <div style={{ padding: '8px 16px 16px' }}>
        <button onClick={handleTake} disabled={taking}
          className="w-full py-3 rounded-full text-sm font-bold text-white spring-btn disabled:opacity-60 flex items-center justify-center gap-1.5"
          style={{
            background: info.critical
              ? 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)'
              : 'linear-gradient(135deg, #34D399 0%, #059669 100%)',
            border: '1px solid rgba(255,255,255,0.55)',
            boxShadow: info.critical
              ? '0 8px 20px rgba(225,29,72,0.4), inset 0 1px 1px rgba(255,255,255,0.7)'
              : '0 8px 20px rgba(5,150,105,0.4), inset 0 1px 1px rgba(255,255,255,0.7)'
          }}>
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
    <div className="text-white">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 glass-panel px-5 py-3 rounded-2xl text-sm font-bold fade-enter"
          style={{
            background: toast.type === 'error' ? 'rgba(225,29,72,0.85)' : 'rgba(5,150,105,0.85)',
            color: '#fff'
          }}>
          {toast.message}
        </div>
      )}

      <div className="glass-panel rounded-3xl px-4 py-3 flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-serif font-bold text-lg flex items-center gap-2">
            <Bell size={18} className="text-amber-300" aria-hidden /> Çağrılar
          </h2>
          {calls.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold"
              style={{ background: 'var(--danger-bg)', color: '#FECDD3', border: '1px solid rgba(251,113,133,0.45)' }}>
              {calls.length} yeni
            </span>
          )}
          {readyOrders.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1"
              style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid rgba(52,211,153,0.45)' }}>
              <ChefHat size={11} aria-hidden /> {readyOrders.length} hazır
            </span>
          )}
          {criticalCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white animate-pulse inline-flex items-center gap-1"
              style={{ background: 'linear-gradient(135deg, #FB7185, #E11D48)', border: '1px solid rgba(255,255,255,0.6)' }}>
              <AlertTriangle size={11} aria-hidden /> {criticalCount} acil
            </span>
          )}
        </div>
        <button onClick={refresh} disabled={loading}
          className="glass-pill min-h-[36px] px-3.5 py-2 rounded-2xl text-xs font-bold spring-btn disabled:opacity-60 inline-flex items-center gap-1">
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
        <div className="glass-card text-center py-14 px-4 rounded-3xl">
          <div className="mb-3 flex justify-center text-white/70"><BellOff size={44} aria-hidden /></div>
          <div className="font-serif font-bold mb-1">Aktif çağrı yok</div>
          <p className="text-sm text-white/65">
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
