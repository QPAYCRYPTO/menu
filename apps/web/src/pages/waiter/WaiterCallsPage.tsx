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
    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.45)' }}
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

      {/* Üst — büyük emoji + label + sayaç */}
      <div style={{
        padding: '14px 16px',
        background: info.critical ? 'var(--danger-bg)' : 'var(--warning-bg)',
        borderBottom: `1px solid ${divider}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14
      }}>
        <div className="glass-pill w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ fontSize: 32, lineHeight: 1 }}>
          {info.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: accentColor, marginBottom: 2
          }}>
            {info.critical ? '⚠️ Acil İstek' : 'Çağrı'}
          </div>
          <div className="font-serif font-bold text-white" style={{ fontSize: 17, lineHeight: 1.2 }}>
            {info.label}
          </div>
          <div className="font-bold text-sm mt-0.5 text-white/85">
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
          padding: '10px 16px', background: 'rgba(0,0,0,0.22)',
          borderBottom: `1px solid ${divider}`
        }}>
          <div className="text-white/60" style={{
            fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4
          }}>
            📝 Müşteri Açıklaması
          </div>
          <div className="text-white" style={{ fontSize: 14, lineHeight: 1.4 }}>
            {call.note}
          </div>
        </div>
      )}

      {/* Diğer türlerde note varsa */}
      {call.call_type !== 'other' && call.note && call.note.trim() && (
        <div style={{ padding: '8px 16px' }}>
          <div className="glass-pill text-xs px-2.5 py-1.5 rounded-xl font-semibold">
            📝 {call.note}
          </div>
        </div>
      )}

      {/* Tarih + saat + ne kadar zaman önce */}
      <div style={{ padding: '8px 16px', borderTop: `1px solid ${divider}` }}>
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-white/65">
          <span className="font-mono">📅 {formatDate(call.created_at)}</span>
          <span className="text-white/30">·</span>
          <span className="font-mono">🕐 {formatTime(call.created_at)}</span>
          <span className="text-white/30">·</span>
          <span>{timeAgo(call.created_at)}</span>
        </div>
      </div>

      {/* Aksiyon butonu */}
      <div style={{ padding: '8px 16px 16px' }}>
        <button onClick={handleTake} disabled={taking}
          className="w-full py-3 rounded-full text-sm font-bold text-white spring-btn disabled:opacity-60"
          style={{
            background: info.critical
              ? 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)'
              : 'linear-gradient(135deg, #34D399 0%, #059669 100%)',
            border: '1px solid rgba(255,255,255,0.55)',
            boxShadow: info.critical
              ? '0 8px 20px rgba(225,29,72,0.4), inset 0 1px 1px rgba(255,255,255,0.7)'
              : '0 8px 20px rgba(5,150,105,0.4), inset 0 1px 1px rgba(255,255,255,0.7)'
          }}>
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
            <i className="fa-regular fa-bell text-amber-300" /> Çağrılar
          </h2>
          {calls.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold"
              style={{ background: 'var(--danger-bg)', color: '#FECDD3', border: '1px solid rgba(251,113,133,0.45)' }}>
              {calls.length} yeni
            </span>
          )}
          {criticalCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white animate-pulse"
              style={{ background: 'linear-gradient(135deg, #FB7185, #E11D48)', border: '1px solid rgba(255,255,255,0.6)' }}>
              ⚠️ {criticalCount} acil
            </span>
          )}
        </div>
        <button onClick={refresh} disabled={loading}
          className="glass-pill min-h-[36px] px-3.5 py-2 rounded-2xl text-xs font-bold spring-btn disabled:opacity-60">
          <span className={loading ? 'inline-block animate-spin' : 'inline-block'}>🔄</span> Yenile
        </button>
      </div>

      {calls.length === 0 ? (
        <div className="glass-card text-center py-14 px-4 rounded-3xl">
          <div className="text-5xl mb-3">🔕</div>
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
