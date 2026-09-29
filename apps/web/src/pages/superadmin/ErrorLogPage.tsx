// apps/web/src/pages/superadmin/ErrorLogPage.tsx
//
// Süper admin — Hata logu yönetimi
// Liste + filtre + detay modal + status değişimi (resolve/ignore)

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  listErrors,
  getErrorById,
  getErrorStats,
  updateErrorStatus,
  type ErrorLogRow,
  type ErrorSeverity,
  type ErrorSource,
  type ErrorStatus,
  type ErrorStats,
  type ErrorListFilter
} from '../../api/errorLogApi';
import { Toast, showToast as showToastHelper, type ToastState } from '../../components/Toast';
import {
  ArrowLeft, TriangleAlert, RefreshCw, Search, CircleCheck, Building2, ChevronLeft, ChevronRight, X, Ban
} from 'lucide-react';

const SEVERITY_OPTIONS: ErrorSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SOURCE_OPTIONS: ErrorSource[] = ['backend', 'frontend', 'external', 'database'];
const STATUS_OPTIONS: ErrorStatus[] = ['new', 'investigating', 'resolved', 'ignored'];

const SEVERITY_COLOR: Record<ErrorSeverity, { bg: string; fg: string; label: string }> = {
  CRITICAL: { bg: 'var(--danger-bg)',        fg: 'var(--danger)',          label: 'Kritik' },
  HIGH:     { bg: 'rgba(255,122,41,0.24)',   fg: '#FDBA74',                label: 'Yüksek' },
  MEDIUM:   { bg: 'var(--warning-bg)',       fg: 'var(--warning)',         label: 'Orta' },
  LOW:      { bg: 'var(--info-bg)',          fg: 'var(--info)',            label: 'Düşük' }
};

const STATUS_COLOR: Record<ErrorStatus, { bg: string; fg: string; label: string }> = {
  new:           { bg: 'var(--danger-bg)',       fg: 'var(--danger)',          label: 'YENİ' },
  investigating: { bg: 'var(--warning-bg)',      fg: 'var(--warning)',         label: 'İNCELENİYOR' },
  resolved:      { bg: 'var(--success-bg)',      fg: 'var(--success)',         label: 'ÇÖZÜLDÜ' },
  ignored:       { bg: 'rgba(255,255,255,0.12)', fg: 'rgba(255,255,255,0.7)',  label: 'YOK SAYILDI' }
};

const MONO_FONT = 'ui-monospace, "SF Mono", Consolas, monospace';
const META_BOX: React.CSSProperties = { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)' };

const SOURCE_LABEL: Record<ErrorSource, string> = {
  backend: 'Backend',
  frontend: 'Frontend',
  external: 'Harici',
  database: 'Veritabanı'
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} sn önce`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const day = Math.floor(hr / 24);
  return `${day} gün önce`;
}

export function ErrorLogPage() {
  const { accessToken, role } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [rows, setRows] = useState<ErrorLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // Filtreler
  const [filterSeverity, setFilterSeverity] = useState<Set<ErrorSeverity>>(new Set());
  const [filterSource, setFilterSource] = useState<Set<ErrorSource>>(new Set());
  const [filterStatus, setFilterStatus] = useState<Set<ErrorStatus>>(new Set(['new', 'investigating']));
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  // Detay modal
  const [detailRow, setDetailRow] = useState<ErrorLogRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  useEffect(() => {
    if (!accessToken || role !== 'superadmin') {
      navigate('/login');
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, role, page, filterSeverity, filterSource, filterStatus, activeSearch]);

  const filter: ErrorListFilter = useMemo(() => ({
    severity: filterSeverity.size > 0 ? Array.from(filterSeverity) : undefined,
    source: filterSource.size > 0 ? Array.from(filterSource) : undefined,
    status: filterStatus.size > 0 ? Array.from(filterStatus) : undefined,
    search: activeSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE
  }), [filterSeverity, filterSource, filterStatus, activeSearch, page]);

  async function load() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [list, statsResult] = await Promise.all([
        listErrors(accessToken, filter),
        getErrorStats(accessToken)
      ]);
      setRows(list.rows);
      setTotal(list.total);
      setStats(statsResult);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Veri alınamadı.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  }

  function clearFilters() {
    setFilterSeverity(new Set());
    setFilterSource(new Set());
    setFilterStatus(new Set(['new', 'investigating']));
    setSearchInput('');
    setActiveSearch('');
    setPage(0);
  }

  async function openDetail(row: ErrorLogRow) {
    if (!accessToken) return;
    setDetailRow(row);
    setResolutionNote(row.resolution_note ?? '');
    setDetailLoading(true);
    try {
      const fresh = await getErrorById(accessToken, row.id);
      setDetailRow(fresh);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Detay yüklenemedi.', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleStatusChange(newStatus: 'investigating' | 'resolved' | 'ignored') {
    if (!accessToken || !detailRow) return;
    try {
      await updateErrorStatus(accessToken, detailRow.id, newStatus, resolutionNote || null);
      showToast(`Durum güncellendi: ${STATUS_COLOR[newStatus].label}`, 'success');
      setDetailRow(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Güncellenemedi.', 'error');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen text-white">
      <Toast state={toast} />

      {/* HEADER */}
      <div className="sticky top-0 z-30 px-3 md:px-6 pt-3">
        <div className="glass-panel max-w-7xl mx-auto rounded-3xl px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <button onClick={() => navigate('/superadmin')}
                className="glass-pill w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 spring-btn"
                title="Geri" aria-label="Geri">
                <ArrowLeft size={14} />
              </button>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/40"
                style={{ background: 'var(--danger-bg)' }}>
                <TriangleAlert className="w-4 h-4 md:w-[18px] md:h-[18px]" style={{ color: 'var(--danger)' }} />
              </div>
              <div className="min-w-0">
                <h1 className="font-serif font-bold text-sm md:text-base truncate text-white">
                  Hata Logu
                </h1>
                <p className="text-xs hidden sm:block text-white/65">
                  {total} kayıt {filterStatus.size > 0 && `(${Array.from(filterStatus).map(s => STATUS_COLOR[s].label).join(', ')})`}
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <button onClick={load} className="glass-pill px-3 py-2 rounded-xl text-sm font-semibold spring-btn flex items-center" aria-label="Yenile" title="Yenile">
                <RefreshCw size={14} />
              </button>
              <button onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1.5 ${showFilters ? 'btn-accent' : 'glass-pill'}`}>
                <Search size={14} />Filtre
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-4 md:pt-6 pb-8">

        {/* İSTATİSTİK KARTLARI */}
        {stats && (
          <div className="grid gap-3 mb-4 md:mb-6"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="glass-card rounded-2xl md:rounded-3xl p-3 md:p-4">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-white/70">Aktif Kritik</div>
              <div className="font-serif text-xl md:text-2xl font-bold" style={{ color: stats.critical_active > 0 ? 'var(--danger)' : '#FFFFFF' }}>
                {stats.critical_active}
              </div>
            </div>
            <div className="glass-card rounded-2xl md:rounded-3xl p-3 md:p-4">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-white/70">Aktif Yüksek</div>
              <div className="font-serif text-xl md:text-2xl font-bold" style={{ color: stats.high_active > 0 ? '#FDBA74' : '#FFFFFF' }}>
                {stats.high_active}
              </div>
            </div>
            <div className="glass-card rounded-2xl md:rounded-3xl p-3 md:p-4">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-white/70">Son 24 Saat</div>
              <div className="font-serif text-xl md:text-2xl font-bold text-white">
                {stats.total_24h}
              </div>
            </div>
            <div className="glass-card rounded-2xl md:rounded-3xl p-3 md:p-4">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-white/70">Son 7 Gün</div>
              <div className="font-serif text-xl md:text-2xl font-bold text-white">
                {stats.total_7d}
              </div>
            </div>
          </div>
        )}

        {/* FİLTRELER */}
        {showFilters && (
          <div className="glass-dark rounded-3xl p-4 md:p-5 mb-4 fade-enter">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif font-bold text-base text-white">Filtreler</h3>
              <button onClick={clearFilters} className="text-xs font-semibold text-amber-300 hover:text-amber-200">Temizle</button>
            </div>

            {/* Arama */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Mesaj içinde ara</label>
              <div className="flex gap-2">
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setActiveSearch(searchInput); setPage(0); }}}
                  placeholder="Hata mesajı..."
                  className="glass-input flex-1 min-w-0 px-4 py-2.5 rounded-xl text-sm" />
                <button onClick={() => { setActiveSearch(searchInput); setPage(0); }}
                  className="btn-accent px-4 py-2.5 rounded-xl text-sm font-bold spring-btn">Ara</button>
              </div>
            </div>

            {/* Severity */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Öncelik</label>
              <div className="flex gap-2 flex-wrap">
                {SEVERITY_OPTIONS.map(s => {
                  const active = filterSeverity.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterSeverity(toggleSet(filterSeverity, s)); setPage(0); }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold spring-btn"
                      style={{
                        background: active ? SEVERITY_COLOR[s].bg : 'rgba(255,255,255,0.1)',
                        color: active ? SEVERITY_COLOR[s].fg : 'rgba(255,255,255,0.7)',
                        border: active ? `1.5px solid ${SEVERITY_COLOR[s].fg}` : '1.5px solid rgba(255,255,255,0.18)'
                      }}>
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SEVERITY_COLOR[s].fg }} />{SEVERITY_COLOR[s].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Kaynak</label>
              <div className="flex gap-2 flex-wrap">
                {SOURCE_OPTIONS.map(s => {
                  const active = filterSource.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterSource(toggleSet(filterSource, s)); setPage(0); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold spring-btn ${active ? 'btn-accent' : 'glass-pill text-white/75'}`}>
                      {SOURCE_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Durum</label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(s => {
                  const active = filterStatus.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterStatus(toggleSet(filterStatus, s)); setPage(0); }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold spring-btn"
                      style={{
                        background: active ? STATUS_COLOR[s].bg : 'rgba(255,255,255,0.1)',
                        color: active ? STATUS_COLOR[s].fg : 'rgba(255,255,255,0.7)',
                        border: active ? `1.5px solid ${STATUS_COLOR[s].fg}` : '1.5px solid rgba(255,255,255,0.18)'
                      }}>
                      {STATUS_COLOR[s].label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* DESKTOP — TABLO */}
        <div className="hidden lg:block glass-dark rounded-3xl overflow-hidden">
          <div className="grid items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/60 border-b border-white/15"
            style={{ gridTemplateColumns: '90px 90px 2.5fr 1.2fr 70px 100px 110px', background: 'rgba(255,255,255,0.06)' }}>
            <div>Öncelik</div>
            <div>Kaynak</div>
            <div>Mesaj</div>
            <div>İşletme / Kullanıcı</div>
            <div className="text-center">Tekrar</div>
            <div>Durum</div>
            <div>Son Görülme</div>
          </div>

          {loading && rows.length === 0 && (
            <div className="text-center py-16">
              <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
              <p className="text-sm text-white/65">Yükleniyor...</p>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-16">
              <div className="mb-3 flex justify-center"><CircleCheck size={36} style={{ color: 'var(--success)' }} /></div>
              <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Hata kaydı bulunamadı</p>
              <p className="text-xs mt-1 text-white/60">Filtreleri temizleyebilir veya başka kriter deneyebilirsin</p>
            </div>
          )}

          {rows.map(row => (
            <button key={row.id} onClick={() => openDetail(row)}
              className="w-full text-left grid items-center gap-3 px-4 py-3 text-sm border-b border-white/10 hover:bg-white/5 transition-colors"
              style={{ gridTemplateColumns: '90px 90px 2.5fr 1.2fr 70px 100px 110px', cursor: 'pointer' }}>
              <div>
                <span className="px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap"
                  style={{ background: SEVERITY_COLOR[row.severity].bg, color: SEVERITY_COLOR[row.severity].fg }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SEVERITY_COLOR[row.severity].fg }} />{SEVERITY_COLOR[row.severity].label}
                </span>
              </div>
              <div className="text-xs text-white/65">{SOURCE_LABEL[row.source]}</div>
              <div className="truncate text-white" title={row.message}>
                {row.message}
              </div>
              <div className="min-w-0">
                {row.business_name ? (
                  <div className="text-xs font-semibold truncate text-white" title={row.business_name}>
                    <Building2 size={12} className="inline-block align-[-2px] mr-1" />{row.business_name}
                  </div>
                ) : (
                  <div className="text-xs text-white/45">—</div>
                )}
                {row.user_email && (
                  <div className="text-xs truncate text-white/60" title={row.user_email}>
                    {row.user_email}
                  </div>
                )}
              </div>
              <div className="text-center">
                {row.occurrence_count > 1 ? (
                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold"
                    style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>×{row.occurrence_count}</span>
                ) : (
                  <span className="text-xs text-white/50">1</span>
                )}
              </div>
              <div>
                <span className="px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap"
                  style={{ background: STATUS_COLOR[row.status].bg, color: STATUS_COLOR[row.status].fg }}>
                  {STATUS_COLOR[row.status].label}
                </span>
              </div>
              <div className="text-xs text-white/60" title={formatDateTime(row.last_seen_at)}>
                {timeAgo(row.last_seen_at)}
              </div>
            </button>
          ))}
        </div>

        {/* MOBİL — KARTLAR */}
        <div className="lg:hidden flex flex-col gap-3">
          {loading && rows.length === 0 && (
            <div className="glass-card text-center py-16 rounded-3xl">
              <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
              <p className="text-sm text-white/65">Yükleniyor...</p>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="glass-card text-center py-16 rounded-3xl">
              <div className="mb-3 flex justify-center"><CircleCheck size={36} style={{ color: 'var(--success)' }} /></div>
              <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Hata kaydı bulunamadı</p>
            </div>
          )}

          {rows.map(row => (
            <button key={row.id} onClick={() => openDetail(row)}
              className="glass-card glass-card-hover w-full text-left rounded-3xl p-4"
              style={{ cursor: 'pointer' }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2 py-1 rounded-lg text-xs font-bold"
                    style={{ background: SEVERITY_COLOR[row.severity].bg, color: SEVERITY_COLOR[row.severity].fg }}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SEVERITY_COLOR[row.severity].fg }} />{SEVERITY_COLOR[row.severity].label}
                  </span>
                  <span className="px-2 py-1 rounded-lg text-xs font-bold"
                    style={{ background: STATUS_COLOR[row.status].bg, color: STATUS_COLOR[row.status].fg }}>
                    {STATUS_COLOR[row.status].label}
                  </span>
                </div>
                {row.occurrence_count > 1 && (
                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold flex-shrink-0"
                    style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>×{row.occurrence_count}</span>
                )}
              </div>
              <div className="text-sm font-medium mb-2 text-white">
                {row.message.length > 120 ? row.message.slice(0, 120) + '...' : row.message}
              </div>
              {row.business_name && (
                <div className="text-xs font-semibold mb-1 text-amber-300 flex items-center gap-1">
                  <Building2 size={12} />{row.business_name}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs flex-wrap text-white/65">
                <span>{SOURCE_LABEL[row.source]}</span>
                <span>•</span>
                <span>{timeAgo(row.last_seen_at)}</span>
                {row.user_email && (<><span>•</span><span className="truncate">{row.user_email}</span></>)}
              </div>
            </button>
          ))}
        </div>

        {/* SAYFALAMA */}
        {totalPages > 1 && (
          <div className="glass-panel flex items-center justify-between mt-4 rounded-3xl p-3">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="btn-accent px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1">
              <ChevronLeft size={14} />Önceki
            </button>
            <span className="text-sm font-semibold text-white/75">
              Sayfa {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="btn-accent px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1">
              Sonraki<ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* DETAY MODAL */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/50 backdrop-blur-md fade-enter">
          <div className="glass-dark w-full max-w-2xl rounded-3xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="px-5 md:px-6 py-4 flex items-center justify-between flex-shrink-0 border-b border-white/15">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0"
                  style={{ background: SEVERITY_COLOR[detailRow.severity].bg, color: SEVERITY_COLOR[detailRow.severity].fg }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SEVERITY_COLOR[detailRow.severity].fg }} />{SEVERITY_COLOR[detailRow.severity].label}
                </span>
                <h2 className="font-serif font-bold text-lg truncate text-white">
                  Hata Detayı
                </h2>
              </div>
              <button onClick={() => setDetailRow(null)}
                className="glass-pill w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs spring-btn" aria-label="Kapat">
                <X size={12} />
              </button>
            </div>

            <div className="p-5 md:p-6 space-y-4 overflow-y-auto flex-1">
              {detailLoading && <p className="text-sm text-white/60">Yükleniyor...</p>}

              {/* Mesaj */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Mesaj</label>
                <div className="rounded-2xl p-3 text-sm font-medium"
                  style={{ background: 'var(--danger-bg)', color: '#FECDD3', border: '1px solid rgba(251,113,133,0.45)', wordBreak: 'break-word' }}>
                  {detailRow.message}
                </div>
              </div>

              {/* Meta bilgiler */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl p-3" style={META_BOX}>
                  <div className="font-semibold uppercase tracking-wider mb-1 text-white/60">Kaynak</div>
                  <div className="font-semibold text-white">{SOURCE_LABEL[detailRow.source]}</div>
                </div>
                <div className="rounded-2xl p-3" style={META_BOX}>
                  <div className="font-semibold uppercase tracking-wider mb-1 text-white/60">Tekrar</div>
                  <div className="font-semibold text-white">{detailRow.occurrence_count} kez</div>
                </div>
                <div className="rounded-2xl p-3" style={META_BOX}>
                  <div className="font-semibold uppercase tracking-wider mb-1 text-white/60">İlk Görülme</div>
                  <div className="font-semibold text-white">{formatDateTime(detailRow.first_seen_at)}</div>
                </div>
                <div className="rounded-2xl p-3" style={META_BOX}>
                  <div className="font-semibold uppercase tracking-wider mb-1 text-white/60">Son Görülme</div>
                  <div className="font-semibold text-white">{formatDateTime(detailRow.last_seen_at)}</div>
                </div>
                {detailRow.business_name && (
                  <div className="rounded-2xl p-3 col-span-2"
                    style={{ background: 'var(--accent-soft)', border: '1px solid rgba(255,122,41,0.45)' }}>
                    <div className="font-semibold uppercase tracking-wider mb-1 text-amber-300 flex items-center gap-1"><Building2 size={12} />İşletme</div>
                    <div className="font-bold text-sm text-white">{detailRow.business_name}</div>
                    {detailRow.business_id && (
                      <div className="font-mono text-xs mt-1 text-white/55" style={{ wordBreak: 'break-all' }}>{detailRow.business_id}</div>
                    )}
                  </div>
                )}
                {detailRow.user_email && (
                  <div className="rounded-2xl p-3 col-span-2" style={META_BOX}>
                    <div className="font-semibold uppercase tracking-wider mb-1 text-white/60">Kullanıcı</div>
                    <div className="font-semibold text-sm text-white">{detailRow.user_email}</div>
                  </div>
                )}
                {!detailRow.business_name && detailRow.business_id && (
                  <div className="rounded-2xl p-3 col-span-2" style={META_BOX}>
                    <div className="font-semibold uppercase tracking-wider mb-1 text-white/60">İşletme ID (silinmiş?)</div>
                    <div className="font-mono text-xs text-white" style={{ wordBreak: 'break-all' }}>{detailRow.business_id}</div>
                  </div>
                )}
              </div>

              {/* Stack trace */}
              {detailRow.stack && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Stack Trace</label>
                  <pre className="rounded-2xl p-3 text-xs overflow-x-auto border border-white/15"
                    style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.75)', maxHeight: 250, fontFamily: MONO_FONT }}>
                    {detailRow.stack}
                  </pre>
                </div>
              )}

              {/* Context */}
              {detailRow.context && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Context</label>
                  <pre className="rounded-2xl p-3 text-xs overflow-x-auto"
                    style={{ ...META_BOX, color: 'rgba(255,255,255,0.9)', maxHeight: 250, fontFamily: MONO_FONT }}>
                    {JSON.stringify(detailRow.context, null, 2)}
                  </pre>
                </div>
              )}

              {/* Çözüm notu */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/70">Çözüm Notu (opsiyonel)</label>
                <textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)}
                  placeholder="Bu hatayı nasıl çözdün? Yorumun kayıt altına alınır."
                  className="glass-input w-full px-4 py-2.5 rounded-xl text-sm"
                  style={{ minHeight: 80, fontFamily: 'inherit' }} />
              </div>

              {detailRow.resolution_note && detailRow.resolved_at && (
                <div className="rounded-2xl p-3 text-xs"
                  style={{ background: 'var(--success-bg)', border: '1px solid rgba(52,211,153,0.4)' }}>
                  <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--success)' }}>Önceki Çözüm Notu ({formatDateTime(detailRow.resolved_at)})</div>
                  <div className="text-white">{detailRow.resolution_note}</div>
                </div>
              )}
            </div>

            {/* Aksiyonlar */}
            <div className="px-5 md:px-6 py-4 flex gap-2 flex-wrap flex-shrink-0 border-t border-white/15">
              {detailRow.status !== 'investigating' && detailRow.status !== 'resolved' && detailRow.status !== 'ignored' && (
                <button onClick={() => handleStatusChange('investigating')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold spring-btn inline-flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.4)' }}>
                  <Search size={14} />İnceleniyor
                </button>
              )}
              <button onClick={() => handleStatusChange('resolved')}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold spring-btn text-white inline-flex items-center justify-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #34D399 0%, #059669 100%)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 8px 20px rgba(5,150,105,0.35)' }}>
                <CircleCheck size={14} />Çözüldü
              </button>
              <button onClick={() => handleStatusChange('ignored')}
                className="glass-pill flex-1 py-2.5 rounded-xl text-sm font-semibold spring-btn inline-flex items-center justify-center gap-1.5">
                <Ban size={14} />Yok Say
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
