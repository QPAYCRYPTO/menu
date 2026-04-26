// apps/web/src/pages/waiter/WaiterCallsPage.tsx
// CHANGELOG v2:
// - Admin OrdersPage CallCard tasarımı birebir aynı
// - Tarih + saat + canlı sayaç (hh:mm:ss formatında)
// - "kaç saniye/dakika önce" bilgisi
// - Header rozeti: kaç çağrı + kaç acil

import { useEffect, useState } from 'react';
import { useWaiterCalls, getCallInfo } from '../../context/WaiterCallsContext';
import type { WaiterActiveCall } from '../../api/waiterPublicApi';

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
    <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg"
      style={{ background: '#FEF3C7', color: '#B45309' }}
      title="Çağrı yapıldıktan beri geçen süre">
      ⏱ {elapsed}
    </span>
  );
}

type ToastState = { message: string; type: 'error' | 'success' } | null;

function CallCard({ call, onTake }: {
  call: WaiterActiveCall;
  onTake: (callId: string) => Promise<void>;
}) {
  const info = getCallInfo(call.call_type);
  const [taking, setTaking] = useState(false);

  const cardBg = info.critical ? '#FEF2F2' : '#FFFBEB';
  const cardBorder = info.critical ? '#FECACA' : '#FDE68A';
  const accentColor = info.critical ? '#DC2626' : '#B45309';
  const titleColor = info.critical ? '#991B1B' : '#92400E';

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
    <div className="rounded-2xl overflow-hidden mb-3"
      style={{
        background: cardBg,
        border: `2px solid ${cardBorder}`,
        animation: info.critical ? 'pulse-call 1.5s ease-in-out infinite' : undefined
      }}>

      <style>{`
        @keyframes pulse-call {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(220, 38, 38, 0); }
        }
      `}</style>

      {/* Üst — büyük emoji + label + sayaç */}
      <div style={{
        padding: '16px',
        background: info.critical
          ? 'linear-gradient(135deg, #FEE2E2, #FECACA)'
          : 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
        borderBottom: `1px solid ${cardBorder}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14
      }}>
        <div style={{ fontSize: 40, lineHeight: 1, flexShrink: 0 }}>
          {info.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: accentColor, marginBottom: 2
          }}>
            {info.critical ? '⚠️ Acil İstek' : 'Çağrı'}
          </div>
          <div style={{
            fontSize: 17, fontWeight: 800, color: titleColor,
            fontFamily: 'Georgia, serif', lineHeight: 1.2
          }}>
            {info.label}
          </div>
          <div className="font-bold text-sm mt-0.5" style={{ color: '#0F172A' }}>
            📍 {call.table_name}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <LiveTimerBadge dateStr={call.created_at} />
        </div>
      </div>

      {/* "Diğer" türü için müşteri açıklaması */}
      {call.call_type === 'other' && call.note && (
        <div style={{
          padding: '10px 16px', background: 'white',
          borderBottom: `1px solid ${cardBorder}`
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#64748B',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4
          }}>
            📝 Müşteri Açıklaması
          </div>
          <div style={{ fontSize: 14, color: '#0F172A', lineHeight: 1.4 }}>
            {call.note}
          </div>
        </div>
      )}

      {/* Diğer türlerde note varsa */}
      {call.call_type !== 'other' && call.note && call.note.trim() && (
        <div style={{ padding: '8px 16px' }}>
          <div className="text-xs px-2 py-1 rounded-lg"
            style={{ background: 'white', color: titleColor, border: `1px solid ${cardBorder}` }}>
            📝 {call.note}
          </div>
        </div>
      )}

      {/* Tarih + saat + ne kadar zaman önce */}
      <div style={{ padding: '8px 16px', borderTop: `1px solid ${cardBorder}` }}>
        <div className="flex items-center gap-1.5 flex-wrap text-xs" style={{ color: '#64748B' }}>
          <span className="font-mono">📅 {formatDate(call.created_at)}</span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span className="font-mono">🕐 {formatTime(call.created_at)}</span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span>{timeAgo(call.created_at)}</span>
        </div>
      </div>

      {/* Aksiyon butonu */}
      <div style={{ padding: '8px 16px 16px' }}>
        <button onClick={handleTake} disabled={taking}
          className="w-full py-3 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: info.critical ? '#DC2626' : '#16A34A' }}>
          {taking ? 'İşleniyor...' : '✓ İlgilendim'}
        </button>
      </div>
    </div>
  );
}

export function WaiterCallsPage() {
  const { calls, takeCall, refresh, loading } = useWaiterCalls();
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

  const criticalCount = calls.filter(c => getCallInfo(c.call_type).critical).length;

  return (
    <div>
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4',
            color: toast.type === 'error' ? '#DC2626' : '#16A34A',
            border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`
          }}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-bold text-lg" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
            🔔 Çağrılar
          </h2>
          {calls.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: '#DC2626' }}>
              {calls.length} yeni
            </span>
          )}
          {criticalCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white animate-pulse"
              style={{ background: '#DC2626' }}>
              ⚠️ {criticalCount} acil
            </span>
          )}
        </div>
        <button onClick={refresh} disabled={loading}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: '#F1F5F9', color: '#0F172A' }}>
          <span className={loading ? 'inline-block animate-spin' : 'inline-block'}>🔄</span> Yenile
        </button>
      </div>

      {calls.length === 0 ? (
        <div className="text-center py-16 rounded-2xl"
          style={{ background: 'white', border: '1px dashed #E2E8F0' }}>
          <div className="text-5xl mb-3">🔕</div>
          <div className="font-semibold mb-1" style={{ color: '#0F172A' }}>Aktif çağrı yok</div>
          <p className="text-sm" style={{ color: '#94A3B8' }}>
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