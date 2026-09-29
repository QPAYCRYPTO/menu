// apps/web/src/pages/waiter/WaiterTablesPage.tsx
// CHANGELOG v4:
// - Birleşik masalar mavi MergeGroupCard olarak gösterilir
// - merge_group_id olan masalar normal listeden çıkar, grup kartına girer
// - Taşı/Birleştir yetki kontrolü korundu
// - Atölye tasarımı: gece/gündüz uyumlu kartlar; durum hapları Boş (yeşil) / Dolu (amber) / Çağrı (kırmızı) / Birleşik (mavi)

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useWaiterAuth } from '../../context/WaiterAuthContext';
import { useLiveRefresh } from '../../context/WaiterCallsContext';
import { WaiterTable, listTables } from '../../api/waiterPublicApi';
import { waiterMoveSession, waiterMergeSessions } from '../../api/tableOperationsApi';
import { AlertTriangle, ArrowLeftRight, Armchair, Bell, ClipboardList, Link2, Plus, RefreshCw, Timer, UtensilsCrossed, Wallet } from 'lucide-react';

type ToastState = { message: string; type: 'error' | 'success' } | null;

// Küçük renkli durum noktası (eski yeşil/kırmızı/mavi daire emojileri yerine)
function StatusDot({ color, hollow = false }: { color: string; hollow?: boolean }) {
  return (
    <span aria-hidden className="inline-block rounded-full flex-shrink-0"
      style={{ width: 8, height: 8, background: hollow ? 'transparent' : color, border: `1.5px solid ${color}` }} />
  );
}

function formatPrice(priceInt: number): string {
  return `${(priceInt / 100).toFixed(2)} TL`;
}

function formatDuration(openedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}s ${m}dk`;
  if (m > 0) return `${m}dk ${s}sn`;
  return `${s}sn`;
}

function useDuration(openedAt: string) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return formatDuration(openedAt);
}

// ─── MASA TAŞIMA MODAL ───────────────────────────────────────────────────────
type MoveModalProps = {
  table: WaiterTable;
  allTables: WaiterTable[];
  token: string;
  tabId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
};

// Seçenek satırı (taşı/birleştir modallarındaki masa listesi)
function optionStyle(selected: boolean): CSSProperties {
  return selected
    ? { background: 'var(--accent-soft)', border: '1.5px solid var(--accent)' }
    : { background: 'var(--surface-2)', border: '1.5px solid var(--line)' };
}

function MoveModal({ table, allTables, token, tabId, onClose, onSuccess, onError }: MoveModalProps) {
  const [targetTableId, setTargetTableId] = useState('');
  const [loading, setLoading] = useState(false);

  const emptyTables = allTables.filter(t => !t.has_active_session && t.id !== table.id);

  async function handleMove() {
    if (!targetTableId) { onError('Hedef masa seçin.'); return; }
    setLoading(true);
    try {
      const result = await waiterMoveSession(token, tabId, table.session_id!, targetTableId);
      onSuccess(`${result.from_table.name} → ${result.to_table.name} taşındı.`);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Taşıma başarısız.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center ui-scrim fade-enter"
      onClick={onClose}>
      <div className="bg-surface text-ink sheet-enter w-full max-w-[520px] rounded-t-[32px] border border-line px-5 pb-6"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-line rounded-full mx-auto mt-3 mb-3" />
        <h3 className="font-serif font-bold text-xl mb-1 flex items-center gap-2">
          <ArrowLeftRight size={18} className="text-accent" aria-hidden /> Masa Taşı
        </h3>
        <p className="text-xs mb-4 text-ink-muted">
          <strong className="text-ink">{table.name}</strong> masasını boş bir masaya taşı
        </p>

        {emptyTables.length === 0 ? (
          <div className="text-center py-6 rounded-2xl mb-4 bg-state-danger-bg">
            <p className="text-sm font-bold text-state-danger">Boş masa yok</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {emptyTables.map(t => (
              <label key={t.id}
                className="flex items-center gap-3 p-3 min-h-[48px] rounded-2xl cursor-pointer transition-colors"
                style={optionStyle(targetTableId === t.id)}>
                <input type="radio" name="target" value={t.id}
                  checked={targetTableId === t.id}
                  onChange={() => setTargetTableId(t.id)}
                  style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
                <span className="font-bold text-sm inline-flex items-center gap-2">
                  <StatusDot color="var(--state-ok)" /> {t.name}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="btn-outline flex-1 py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-50">İptal</button>
          <button onClick={handleMove}
            disabled={loading || !targetTableId || emptyTables.length === 0}
            className="btn-primary flex-1 py-3 rounded-full text-sm font-bold spring-btn">
            {loading ? 'Taşınıyor...' : 'Taşı'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MASA BİRLEŞTİRME MODAL ──────────────────────────────────────────────────
type MergeModalProps = {
  table: WaiterTable;
  allTables: WaiterTable[];
  token: string;
  tabId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
};

function MergeModal({ table, allTables, token, tabId, onClose, onSuccess, onError }: MergeModalProps) {
  const [targetSessionId, setTargetSessionId] = useState('');
  const [loading, setLoading] = useState(false);

  // Dolu masalar — kendisi hariç (session_id olanlar)
  const occupiedTables = allTables.filter(t => t.has_active_session && t.id !== table.id);

  async function handleMerge() {
    if (!targetSessionId) { onError('Hedef masa seçin.'); return; }
    setLoading(true);
    try {
      const result = await waiterMergeSessions(token, tabId, table.session_id!, targetSessionId);
      onSuccess(`${result.source.table_name} → ${result.target.table_name} birleştirildi.`);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Birleştirme başarısız.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center ui-scrim fade-enter"
      onClick={onClose}>
      <div className="bg-surface text-ink sheet-enter w-full max-w-[520px] rounded-t-[32px] border border-line px-5 pb-6"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-line rounded-full mx-auto mt-3 mb-3" />
        <h3 className="font-serif font-bold text-xl mb-1 flex items-center gap-2">
          <Link2 size={18} className="text-accent" aria-hidden /> Masa Birleştir
        </h3>
        <p className="text-xs mb-4 text-ink-muted">
          <strong className="text-ink">{table.name}</strong> masasını başka bir masayla birleştir.
        </p>

        {occupiedTables.length === 0 ? (
          <div className="text-center py-6 rounded-2xl mb-4 bg-state-warn-bg">
            <p className="text-sm font-bold text-state-warn">Birleştirilecek masa yok</p>
            <p className="text-xs mt-1 text-ink-muted">Başka açık masa bulunmuyor.</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {occupiedTables.map(t => (
              <label key={t.id}
                className="flex items-center gap-3 p-3 min-h-[48px] rounded-2xl cursor-pointer transition-colors"
                style={optionStyle(targetSessionId === t.session_id)}>
                <input type="radio" name="target" value={t.session_id ?? ''}
                  checked={targetSessionId === t.session_id}
                  onChange={() => setTargetSessionId(t.session_id ?? '')}
                  style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
                <div className="flex-1">
                  <span className="font-bold text-sm inline-flex items-center gap-2">
                    <StatusDot color="var(--state-warn)" /> {t.name}
                  </span>
                  <span className="text-xs ml-2 text-ink-muted">
                    {formatPrice(t.total_int)} · {t.order_count} sipariş
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="p-3 rounded-2xl mb-4 text-xs flex items-start gap-1.5 bg-state-warn-bg text-state-warn font-semibold">
          <AlertTriangle size={14} className="shrink-0" aria-hidden /> <span><strong className="text-ink">{table.name}</strong> kapanır, siparişleri seçilen masaya taşınır.</span>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="btn-outline flex-1 py-3 rounded-full text-sm font-bold spring-btn disabled:opacity-50">İptal</button>
          <button onClick={handleMerge}
            disabled={loading || !targetSessionId || occupiedTables.length === 0}
            className="btn-primary flex-1 py-3 rounded-full text-sm font-bold spring-btn">
            {loading ? 'Birleştiriliyor...' : 'Birleştir'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Referans tasarımdaki durum hapı: yumuşak zemin + koyu yazı + nokta
// Tailwind yalnızca tam yazılmış sınıf adlarını üretir → birleştirme yerine sabit eşleme
const PILL_TONE = {
  ok: 'bg-state-ok-bg text-state-ok',
  warn: 'bg-state-warn-bg text-state-warn',
  danger: 'bg-state-danger-bg text-state-danger',
  info: 'bg-state-info-bg text-state-info'
} as const;

function StatePill({ tone, children }: { tone: keyof typeof PILL_TONE; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${PILL_TONE[tone]}`}>
      <StatusDot color="currentColor" /> {children}
    </span>
  );
}

// Kart içi küçük bilgi satırı (Adisyon / Sipariş)
function InfoRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between items-center px-2.5 py-1.5 rounded-xl bg-surface-2">
      <span className="text-[11px] font-semibold text-ink-muted">{label}</span>
      <span className={strong ? 'text-[15px] font-extrabold' : 'text-[13px] font-bold'}>{value}</span>
    </div>
  );
}

// ─── BİRLEŞİK MASA GRUP KARTI ────────────────────────────────────────────────
function MergeGroupCard({ tables, canTransfer, canMerge, onMove, onMerge }: {
  tables: WaiterTable[];
  canTransfer: boolean;
  canMerge: boolean;
  onMove: (t: WaiterTable) => void;
  onMerge: (t: WaiterTable) => void;
}) {
  const totalInt = tables.reduce((sum, t) => sum + t.total_int, 0);
  const orderCount = tables.reduce((sum, t) => sum + t.order_count, 0);

  return (
    <div className="ui-card rounded-3xl overflow-hidden flex flex-col" style={{ borderColor: 'var(--state-info)' }}>
      <div className="px-3.5 pt-3">
        <StatePill tone="info">Birleşik grup</StatePill>
      </div>

      <div className="p-3.5">
        {/* Masa isimleri */}
        {tables.map(t => (
          <div key={t.id} className="font-serif font-bold text-xl leading-snug">
            {t.name}
          </div>
        ))}

        <div className="h-px bg-line my-2.5" />

        <div className="flex flex-col gap-1.5 mb-2.5">
          <InfoRow label="Toplam Adisyon" value={formatPrice(totalInt)} strong />
          <InfoRow label="Toplam Sipariş" value={orderCount} />
        </div>

        {/* Her masaya git linkleri */}
        <div className="flex flex-col gap-1.5">
          {tables.map(t => (
            <Link key={t.id} to={`/garson/masa/${t.id}`}
              className="btn-outline spring-btn no-underline px-2.5 py-2 rounded-2xl min-h-[36px] text-xs font-bold text-center flex items-center justify-center gap-1.5">
              <ClipboardList size={12} aria-hidden /> {t.name} — Adisyon Aç
            </Link>
          ))}
        </div>
      </div>

      {/* Operasyon butonları */}
      {(canTransfer || canMerge) && tables[0] && (
        <div className="px-3.5 pt-2 pb-3 border-t border-line flex gap-1.5">
          {canTransfer && (
            <button onClick={() => onMove(tables[0])}
              className="btn-outline flex-1 min-h-[36px] py-2 rounded-2xl text-xs font-bold spring-btn flex items-center justify-center gap-1">
              <ArrowLeftRight size={12} aria-hidden /> Taşı
            </button>
          )}
          {canMerge && (
            <button onClick={() => onMerge(tables[0])}
              className="btn-outline flex-1 min-h-[36px] py-2 rounded-2xl text-xs font-bold spring-btn flex items-center justify-center gap-1">
              <Link2 size={12} aria-hidden /> Ekle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NORMAL MASA KARTI ────────────────────────────────────────────────────────
function WaiterTableCard({ table, canTransfer, canMerge, onMove, onMerge }: {
  table: WaiterTable;
  canTransfer: boolean;
  canMerge: boolean;
  onMove: () => void;
  onMerge: () => void;
}) {
  const isOccupied = table.has_active_session;
  const hasCall = table.active_calls > 0;
  // Hook her render'da çağrılır (koşullu çağrı masa dolunca "hook sayısı değişti" hatası verirdi)
  const elapsed = useDuration(table.opened_at ?? new Date().toISOString());
  const duration = isOccupied && table.opened_at ? elapsed : null;

  return (
    <div className="ui-card rounded-3xl flex flex-col relative"
      style={hasCall ? { borderColor: 'var(--state-danger)', borderWidth: 2 } : undefined}>
      {hasCall && (
        <div className="animate-pulse absolute -top-2 -right-2 w-[30px] h-[30px] rounded-full flex items-center justify-center z-[1] shadow"
          style={{ background: 'var(--state-danger)', color: 'var(--bg)' }}>
          <Bell size={14} aria-hidden />
        </div>
      )}

      <Link to={`/garson/masa/${table.id}`} className="no-underline text-inherit flex-1">
        <div className="p-3.5">
          <h3 className="font-serif font-bold text-xl leading-tight mb-2">
            {table.name}
          </h3>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            {hasCall
              ? <StatePill tone="danger">Çağrı</StatePill>
              : isOccupied
                ? <StatePill tone="warn">Dolu</StatePill>
                : <StatePill tone="ok">Boş</StatePill>}
            {duration && (
              <span className="font-mono text-[11px] text-ink-muted inline-flex items-center gap-1"><Timer size={11} aria-hidden /> {duration}</span>
            )}
          </div>

          {isOccupied ? (
            <div className="flex flex-col gap-1.5">
              <InfoRow label="Adisyon" value={formatPrice(table.total_int)} strong />
              <InfoRow label="Sipariş" value={table.order_count} />
            </div>
          ) : (
            <div className="py-3 px-2 text-center rounded-2xl border border-dashed border-line">
              <div className="text-[11px] font-bold text-state-ok">Müşteri bekleniyor</div>
            </div>
          )}
        </div>
      </Link>

      {/* Operasyon butonları */}
      {isOccupied && (canTransfer || canMerge) && (
        <div className="px-3.5 py-2 border-t border-line flex gap-1.5">
          {canTransfer && (
            <button onClick={e => { e.preventDefault(); onMove(); }}
              className="btn-outline flex-1 min-h-[36px] py-2 rounded-2xl text-xs font-bold spring-btn flex items-center justify-center gap-1">
              <ArrowLeftRight size={12} aria-hidden /> Taşı
            </button>
          )}
          {canMerge && (
            <button onClick={e => { e.preventDefault(); onMerge(); }}
              className="btn-outline flex-1 min-h-[36px] py-2 rounded-2xl text-xs font-bold spring-btn flex items-center justify-center gap-1">
              <Link2 size={12} aria-hidden /> Birleştir
            </button>
          )}
        </div>
      )}

      <div className="px-3 pt-2 pb-3 border-t border-line">
        <Link to={`/garson/masa/${table.id}`}
          className={`${isOccupied ? 'btn-outline' : 'btn-primary'} no-underline spring-btn flex items-center justify-center gap-1.5 min-h-[38px] rounded-full text-xs font-extrabold`}>
          {isOccupied ? <ClipboardList size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
          {isOccupied ? 'Adisyonu Aç' : 'Sipariş Al'}
        </Link>
      </div>
    </div>
  );
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────
export function WaiterTablesPage() {
  const { waiter, token, tabId, logout } = useWaiterAuth();
  const [tables, setTables] = useState<WaiterTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [moveTarget, setMoveTarget] = useState<WaiterTable | null>(null);
  const [mergeTarget, setMergeTarget] = useState<WaiterTable | null>(null);

  useEffect(() => {
    if (!token || !tabId) return;
    loadTables();
    const interval = setInterval(() => loadTables(true), 10000);
    return () => clearInterval(interval);
  }, [token, tabId]);

  // Başka garson/admin bir şey değiştirince (çağrı, sipariş, taşıma, ödeme…) anında yenile
  useLiveRefresh(() => loadTables(true));

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2400);
  }

  async function loadTables(silent = false) {
    if (!token || !tabId) return;
    if (!silent) setLoading(true);
    try {
      const data = await listTables(token, tabId);
      setTables(data);
    } catch (e) {
      if (e instanceof Error && e.message.includes('reason')) { logout(); return; }
      if (!silent) showToast(e instanceof Error ? e.message : 'Masalar alınamadı.', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleOperationSuccess(msg: string) {
    showToast(msg, 'success');
    await loadTables(true);
  }

  if (!waiter) return null;

  const canTransfer = waiter.permissions.can_transfer_table;
  const canMerge = waiter.permissions.can_merge_tables;

  // Birleşik masa gruplarını hesapla
  const mergeGroupMap = new Map<string, WaiterTable[]>();
  tables.forEach(t => {
    if (t.merge_group_id) {
      const group = mergeGroupMap.get(t.merge_group_id) ?? [];
      group.push(t);
      mergeGroupMap.set(t.merge_group_id, group);
    }
  });

  // Normal masalar (birleşik olmayanlar) — sıralı
  const normalTables = [...tables]
    .filter(t => !t.merge_group_id)
    .sort((a, b) => {
      if (a.active_calls > 0 && b.active_calls === 0) return -1;
      if (a.active_calls === 0 && b.active_calls > 0) return 1;
      if (a.has_active_session && !b.has_active_session) return -1;
      if (!a.has_active_session && b.has_active_session) return 1;
      return a.sort_order - b.sort_order;
    });

  const busyCount = tables.filter(t => t.has_active_session && !t.merge_group_id).length;
  const emptyCount = tables.filter(t => !t.has_active_session).length;
  const mergedCount = mergeGroupMap.size;
  const totalOpen = tables.reduce((sum, t) => sum + (t.total_int || 0), 0);

  return (
    <div className="text-ink">
      {toast && (
        <div className="fixed top-24 left-4 right-4 z-50 px-4 py-3 rounded-2xl text-sm font-bold mx-auto fade-enter shadow-lg max-w-[480px]"
          role="status"
          style={{ background: toast.type === 'error' ? 'var(--state-danger)' : 'var(--state-ok)', color: 'var(--bg)' }}>
          {toast.message}
        </div>
      )}

      <div className="ui-card rounded-3xl px-4 py-3 flex items-center justify-between mb-3">
        <h2 className="font-serif font-bold text-xl flex items-center gap-2">
          <UtensilsCrossed size={18} className="text-accent" aria-hidden /> Masalar
        </h2>
        <button onClick={() => loadTables()}
          className="btn-outline min-h-[36px] px-3.5 py-2 rounded-2xl text-xs font-bold spring-btn inline-flex items-center gap-1">
          <RefreshCw size={12} aria-hidden /> Yenile
        </button>
      </div>

      {/* İstatistikler */}
      {tables.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-none pb-1">
          <div className="flex-shrink-0"><StatePill tone="ok">Boş: {emptyCount}</StatePill></div>
          <div className="flex-shrink-0"><StatePill tone="warn">Dolu: {busyCount}</StatePill></div>
          {mergedCount > 0 && (
            <div className="flex-shrink-0"><StatePill tone="info">Birleşik: {mergedCount} grup</StatePill></div>
          )}
          {totalOpen > 0 && (
            <div className="bg-brand text-on-brand flex-shrink-0 px-3 py-1 rounded-full">
              <span className="text-xs font-extrabold inline-flex items-center gap-1"><Wallet size={12} aria-hidden /> {formatPrice(totalOpen)}</span>
            </div>
          )}
        </div>
      )}

      {loading && tables.length === 0 && (
        <div className="ui-card rounded-3xl text-center py-14">
          <div className="w-10 h-10 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-ink-muted">Masalar yükleniyor...</p>
        </div>
      )}

      {!loading && tables.length === 0 && (
        <div className="ui-card text-center py-14 rounded-3xl">
          <div className="mb-3 flex justify-center text-accent"><Armchair size={36} aria-hidden /></div>
          <p className="text-sm text-ink-muted">Henüz masa yok</p>
        </div>
      )}

      {tables.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {/* Birleşik masa grupları — tek kart */}
          {[...mergeGroupMap.entries()].map(([groupId, groupTables]) => (
            <MergeGroupCard
              key={groupId}
              tables={groupTables}
              canTransfer={canTransfer}
              canMerge={canMerge}
              onMove={(t) => setMoveTarget(t)}
              onMerge={(t) => setMergeTarget(t)}
            />
          ))}

          {/* Normal masalar */}
          {normalTables.map(table => (
            <WaiterTableCard
              key={table.id}
              table={table}
              canTransfer={canTransfer}
              canMerge={canMerge}
              onMove={() => setMoveTarget(table)}
              onMerge={() => setMergeTarget(table)}
            />
          ))}
        </div>
      )}

      {/* Taşıma Modal */}
      {moveTarget && token && tabId && (
        <MoveModal
          table={moveTarget}
          allTables={tables}
          token={token}
          tabId={tabId}
          onClose={() => setMoveTarget(null)}
          onSuccess={handleOperationSuccess}
          onError={msg => showToast(msg, 'error')}
        />
      )}

      {/* Birleştirme Modal */}
      {mergeTarget && token && tabId && (
        <MergeModal
          table={mergeTarget}
          allTables={tables}
          token={token}
          tabId={tabId}
          onClose={() => setMergeTarget(null)}
          onSuccess={handleOperationSuccess}
          onError={msg => showToast(msg, 'error')}
        />
      )}
    </div>
  );
}