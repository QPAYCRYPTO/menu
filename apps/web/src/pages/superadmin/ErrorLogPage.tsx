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
import { ThemeToggle } from '../../components/ThemeToggle';
import { useThemedPage } from '../../lib/theme';
import {
  ArrowLeft, TriangleAlert, RefreshCw, Search, CircleCheck, Building2, ChevronLeft, ChevronRight, X, Ban
} from 'lucide-react';

const SEVERITY_OPTIONS: ErrorSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SOURCE_OPTIONS: ErrorSource[] = ['backend', 'frontend', 'external', 'database'];
const STATUS_OPTIONS: ErrorStatus[] = ['new', 'investigating', 'resolved', 'ignored'];

const SEVERITY_COLOR: Record<ErrorSeverity, { bg: string; fg: string; label: string }> = {
  CRITICAL: { bg: 'var(--state-danger-bg)',        fg: 'var(--state-danger)',          label: 'Kritik' },
  // Turuncu: "Orta" (amber) ile karışmasın; iki temada okunur ton
  HIGH:     { bg: 'color-mix(in srgb, #d9722f 16%, transparent)', fg: '#d9722f', label: 'Yüksek' },
  MEDIUM:   { bg: 'var(--state-warn-bg)',       fg: 'var(--state-warn)',         label: 'Orta' },
  LOW:      { bg: 'var(--state-info-bg)',          fg: 'var(--state-info)',            label: 'Düşük' }
};

const STATUS_COLOR: Record<ErrorStatus, { bg: string; fg: string; label: string }> = {
  new:           { bg: 'var(--state-danger-bg)',       fg: 'var(--state-danger)',          label: 'YENİ' },
  investigating: { bg: 'var(--state-warn-bg)',      fg: 'var(--state-warn)',         label: 'İNCELENİYOR' },
  resolved:      { bg: 'var(--state-ok-bg)',      fg: 'var(--state-ok)',         label: 'ÇÖZÜLDÜ' },
  ignored:       { bg: 'var(--surface-2)', fg: 'var(--ink-muted)',  label: 'YOK SAYILDI' }
};

const MONO_FONT = 'ui-monospace, "SF Mono", Consolas, monospace';
const META_BOX: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--line)' };

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
  useThemedPage();
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
    <div className="min-h-screen bg-page text-ink">
      <Toast state={toast} />

      {/* HEADER */}
      <div className="sticky top-0 z-30 px-3 md:px-6 pt-3 bg-page">
        <div className="ui-card max-w-7xl mx-auto rounded-3xl px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <button onClick={() => navigate('/superadmin')}
                className="ui-chip w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 spring-btn"
                title="Geri" aria-label="Geri">
                <ArrowLeft size={14} />
              </button>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--state-danger-bg)' }}>
                <TriangleAlert className="w-4 h-4 md:w-[18px] md:h-[18px]" style={{ color: 'var(--state-danger)' }} />
              </div>
              <div className="min-w-0">
                <h1 className="font-serif font-bold text-base md:text-xl truncate text-ink">
                  Hata Logu
                </h1>
                <p className="text-xs hidden sm:block text-ink-muted">
                  {total} kayıt {filterStatus.size > 0 && `(${Array.from(filterStatus).map(s => STATUS_COLOR[s].label).join(', ')})`}
                </p>
              </div>
            </div>

            <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
              <ThemeToggle />
              <button onClick={load} className="btn-outline px-3 py-2 rounded-xl text-sm font-semibold spring-btn flex items-center" aria-label="Yenile" title="Yenile">
                <RefreshCw size={14} />
              </button>
              <button onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1.5 ${showFilters ? 'btn-primary' : 'ui-chip'}`}>
                <Search size={14} /><span className="hidden sm:inline">Filtre</span>
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
            <div className="ui-card rounded-2xl md:rounded-3xl p-3 md:p-4">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-ink-muted">Aktif Kritik</div>
              <div className="font-serif text-xl md:text-2xl font-bold" style={{ color: stats.critical_active > 0 ? 'var(--state-danger)' : 'var(--ink)' }}>
                {stats.critical_active}
              </div>
            </div>
            <div className="ui-card rounded-2xl md:rounded-3xl p-3 md:p-4">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-ink-muted">Aktif Yüksek</div>
              <div className="font-serif text-xl md:text-2xl font-bold" style={{ color: stats.high_active > 0 ? '#d9722f' : 'var(--ink)' }}>
                {stats.high_active}
              </div>
            </div>
            <div className="ui-card rounded-2xl md:rounded-3xl p-3 md:p-4">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-ink-muted">Son 24 Saat</div>
              <div className="font-serif text-xl md:text-2xl font-bold text-ink">
                {stats.total_24h}
              </div>
            </div>
            <div className="ui-card rounded-2xl md:rounded-3xl p-3 md:p-4">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider text-ink-muted">Son 7 Gün</div>
              <div className="font-serif text-xl md:text-2xl font-bold text-ink">
                {stats.total_7d}
              </div>
            </div>
          </div>
        )}

        {/* FİLTRELER */}
        {showFilters && (
          <div className="ui-card rounded-3xl p-4 md:p-5 mb-4 fade-enter">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif font-bold text-base text-ink">Filtreler</h3>
              <button onClick={clearFilters} className="text-xs font-semibold text-accent hover:text-accent">Temizle</button>
            </div>

            {/* Arama */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Mesaj içinde ara</label>
              <div className="flex gap-2">
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setActiveSearch(searchInput); setPage(0); }}}
                  placeholder="Hata mesajı..."
                  className="ui-input flex-1 min-w-0 px-4 py-2.5 rounded-xl text-sm" />
                <button onClick={() => { setActiveSearch(searchInput); setPage(0); }}
                  className="btn-primary px-4 py-2.5 rounded-xl text-sm font-bold spring-btn">Ara</button>
              </div>
            </div>

            {/* Severity */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Öncelik</label>
              <div className="flex gap-2 flex-wrap">
                {SEVERITY_OPTIONS.map(s => {
                  const active = filterSeverity.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterSeverity(toggleSet(filterSeverity, s)); setPage(0); }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold spring-btn"
                      style={{
                        background: active ? SEVERITY_COLOR[s].bg : 'var(--surface-2)',
                        color: active ? SEVERITY_COLOR[s].fg : 'var(--surface-2)',
                        border: active ? `1.5px solid ${SEVERITY_COLOR[s].fg}` : '1.5px solid var(--line)'
                      }}>
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SEVERITY_COLOR[s].fg }} />{SEVERITY_COLOR[s].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Kaynak</label>
              <div className="flex gap-2 flex-wrap">
                {SOURCE_OPTIONS.map(s => {
                  const active = filterSource.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterSource(toggleSet(filterSource, s)); setPage(0); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold spring-btn ${active ? 'btn-primary' : 'ui-chip text-ink-muted'}`}>
                      {SOURCE_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Durum</label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(s => {
                  const active = filterStatus.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterStatus(toggleSet(filterStatus, s)); setPage(0); }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold spring-btn"
                      style={{
                        background: active ? STATUS_COLOR[s].bg : 'var(--surface-2)',
                        color: active ? STATUS_COLOR[s].fg : 'var(--surface-2)',
                        border: active ? `1.5px solid ${STATUS_COLOR[s].fg}` : '1.5px solid var(--line)'
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
        <div className="hidden lg:block ui-card rounded-3xl overflow-hidden">
          <div className="grid items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted border-b border-line"
            style={{ gridTemplateColumns: '90px 90px 2.5fr 1.2fr 70px 100px 110px', background: 'var(--surface-2)' }}>
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
              <div className="w-10 h-10 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-3" />
              <p className="text-sm text-ink-muted">Yükleniyor...</p>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-16">
              <div className="mb-3 flex justify-center"><CircleCheck size={36} style={{ color: 'var(--state-ok)' }} /></div>
              <p className="text-sm font-semibold" style={{ color: 'var(--state-ok)' }}>Hata kaydı bulunamadı</p>
              <p className="text-xs mt-1 text-ink-muted">Filtreleri temizleyebilir veya başka kriter deneyebilirsin</p>
            </div>
          )}

          {rows.map(row => (
            <button key={row.id} onClick={() => openDetail(row)}
              className="w-full text-left grid items-center gap-3 px-4 py-3 text-sm border-b border-line hover:bg-surface-2 transition-colors"
              style={{ gridTemplateColumns: '90px 90px 2.5fr 1.2fr 70px 100px 110px', cursor: 'pointer' }}>
              <div>
                <span className="px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap"
                  style={{ background: SEVERITY_COLOR[row.severity].bg, color: SEVERITY_COLOR[row.severity].fg }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SEVERITY_COLOR[row.severity].fg }} />{SEVERITY_COLOR[row.severity].label}
                </span>
              </div>
              <div className="text-xs text-ink-muted">{SOURCE_LABEL[row.source]}</div>
              <div className="truncate text-ink" title={row.message}>
                {row.message}
              </div>
              <div className="min-w-0">
                {row.business_name ? (
                  <div className="text-xs font-semibold truncate text-ink" title={row.business_name}>
                    <Building2 size={12} className="inline-block align-[-2px] mr-1" />{row.business_name}
                  </div>
                ) : (
                  <div className="text-xs text-ink-muted">—</div>
                )}
                {row.user_email && (
                  <div className="text-xs truncate text-ink-muted" title={row.user_email}>
                    {row.user_email}
                  </div>
                )}
              </div>
              <div className="text-center">
                {row.occurrence_count > 1 ? (
                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold"
                    style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}>×{row.occurrence_count}</span>
                ) : (
                  <span className="text-xs text-ink-muted">1</span>
                )}
              </div>
              <div>
                <span className="px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap"
                  style={{ background: STATUS_COLOR[row.status].bg, color: STATUS_COLOR[row.status].fg }}>
                  {STATUS_COLOR[row.status].label}
                </span>
              </div>
              <div className="text-xs text-ink-muted" title={formatDateTime(row.last_seen_at)}>
                {timeAgo(row.last_seen_at)}
              </div>
            </button>
          ))}
        </div>

        {/* MOBİL — KARTLAR */}
        <div className="lg:hidden flex flex-col gap-3">
          {loading && rows.length === 0 && (
            <div className="ui-card text-center py-16 rounded-3xl">
              <div className="w-10 h-10 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-3" />
              <p className="text-sm text-ink-muted">Yükleniyor...</p>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="ui-card text-center py-16 rounded-3xl">
              <div className="mb-3 flex justify-center"><CircleCheck size={36} style={{ color: 'var(--state-ok)' }} /></div>
              <p className="text-sm font-semibold" style={{ color: 'var(--state-ok)' }}>Hata kaydı bulunamadı</p>
            </div>
          )}

          {rows.map(row => (
            <button key={row.id} onClick={() => openDetail(row)}
              className="ui-card w-full text-left rounded-3xl p-4"
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
                    style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}>×{row.occurrence_count}</span>
                )}
              </div>
              <div className="text-sm font-medium mb-2 text-ink">
                {row.message.length > 120 ? row.message.slice(0, 120) + '...' : row.message}
              </div>
              {row.business_name && (
                <div className="text-xs font-semibold mb-1 text-accent flex items-center gap-1">
                  <Building2 size={12} />{row.business_name}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs flex-wrap text-ink-muted">
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
          <div className="ui-card flex items-center justify-between mt-4 rounded-3xl p-3">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="btn-primary px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1">
              <ChevronLeft size={14} />Önceki
            </button>
            <span className="text-sm font-semibold text-ink-muted">
              Sayfa {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="btn-primary px-3 py-2 rounded-xl text-sm font-semibold spring-btn inline-flex items-center gap-1">
              Sonraki<ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* DETAY MODAL */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 ui-scrim fade-enter">
          <div className="ui-card w-full max-w-2xl rounded-3xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="px-5 md:px-6 py-4 flex items-center justify-between flex-shrink-0 border-b border-line">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0"
                  style={{ background: SEVERITY_COLOR[detailRow.severity].bg, color: SEVERITY_COLOR[detailRow.severity].fg }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SEVERITY_COLOR[detailRow.severity].fg }} />{SEVERITY_COLOR[detailRow.severity].label}
                </span>
                <h2 className="font-serif font-bold text-lg truncate text-ink">
                  Hata Detayı
                </h2>
              </div>
              <button onClick={() => setDetailRow(null)}
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs spring-btn" aria-label="Kapat">
                <X size={12} />
              </button>
            </div>

            <div className="p-5 md:p-6 space-y-4 overflow-y-auto flex-1">
              {detailLoading && <p className="text-sm text-ink-muted">Yükleniyor...</p>}

              {/* Mesaj */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Mesaj</label>
                <div className="rounded-2xl p-3 text-sm font-medium"
                  style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)', border: '1px solid var(--state-danger)', wordBreak: 'break-word' }}>
                  {detailRow.message}
                </div>
              </div>

              {/* Meta bilgiler */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl p-3" style={META_BOX}>
                  <div className="font-semibold uppercase tracking-wider mb-1 text-ink-muted">Kaynak</div>
                  <div className="font-semibold text-ink">{SOURCE_LABEL[detailRow.source]}</div>
                </div>
                <div className="rounded-2xl p-3" style={META_BOX}>
                  <div className="font-semibold uppercase tracking-wider mb-1 text-ink-muted">Tekrar</div>
                  <div className="font-semibold text-ink">{detailRow.occurrence_count} kez</div>
                </div>
                <div className="rounded-2xl p-3" style={META_BOX}>
                  <div className="font-semibold uppercase tracking-wider mb-1 text-ink-muted">İlk Görülme</div>
                  <div className="font-semibold text-ink">{formatDateTime(detailRow.first_seen_at)}</div>
                </div>
                <div className="rounded-2xl p-3" style={META_BOX}>
                  <div className="font-semibold uppercase tracking-wider mb-1 text-ink-muted">Son Görülme</div>
                  <div className="font-semibold text-ink">{formatDateTime(detailRow.last_seen_at)}</div>
                </div>
                {detailRow.business_name && (
                  <div className="rounded-2xl p-3 col-span-2"
                    style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                    <div className="font-semibold uppercase tracking-wider mb-1 text-accent flex items-center gap-1"><Building2 size={12} />İşletme</div>
                    <div className="font-bold text-sm text-ink">{detailRow.business_name}</div>
                    {detailRow.business_id && (
                      <div className="font-mono text-xs mt-1 text-ink-muted" style={{ wordBreak: 'break-all' }}>{detailRow.business_id}</div>
                    )}
                  </div>
                )}
                {detailRow.user_email && (
                  <div className="rounded-2xl p-3 col-span-2" style={META_BOX}>
                    <div className="font-semibold uppercase tracking-wider mb-1 text-ink-muted">Kullanıcı</div>
                    <div className="font-semibold text-sm text-ink">{detailRow.user_email}</div>
                  </div>
                )}
                {!detailRow.business_name && detailRow.business_id && (
                  <div className="rounded-2xl p-3 col-span-2" style={META_BOX}>
                    <div className="font-semibold uppercase tracking-wider mb-1 text-ink-muted">İşletme ID (silinmiş?)</div>
                    <div className="font-mono text-xs text-ink" style={{ wordBreak: 'break-all' }}>{detailRow.business_id}</div>
                  </div>
                )}
              </div>

              {/* Stack trace */}
              {detailRow.stack && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Stack Trace</label>
                  <pre className="rounded-2xl p-3 text-xs overflow-x-auto border border-line"
                    style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)', maxHeight: 250, fontFamily: MONO_FONT }}>
                    {detailRow.stack}
                  </pre>
                </div>
              )}

              {/* Context */}
              {detailRow.context && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Context</label>
                  <pre className="rounded-2xl p-3 text-xs overflow-x-auto"
                    style={{ ...META_BOX, color: 'var(--ink)', maxHeight: 250, fontFamily: MONO_FONT }}>
                    {JSON.stringify(detailRow.context, null, 2)}
                  </pre>
                </div>
              )}

              {/* Çözüm notu */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-ink-muted">Çözüm Notu (opsiyonel)</label>
                <textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)}
                  placeholder="Bu hatayı nasıl çözdün? Yorumun kayıt altına alınır."
                  className="ui-input w-full px-4 py-2.5 rounded-xl text-sm"
                  style={{ minHeight: 80, fontFamily: 'inherit' }} />
              </div>

              {detailRow.resolution_note && detailRow.resolved_at && (
                <div className="rounded-2xl p-3 text-xs"
                  style={{ background: 'var(--state-ok-bg)', border: '1px solid var(--state-ok)' }}>
                  <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--state-ok)' }}>Önceki Çözüm Notu ({formatDateTime(detailRow.resolved_at)})</div>
                  <div className="text-ink">{detailRow.resolution_note}</div>
                </div>
              )}
            </div>

            {/* Aksiyonlar */}
            <div className="px-5 md:px-6 py-4 flex gap-2 flex-wrap flex-shrink-0 border-t border-line">
              {detailRow.status !== 'investigating' && detailRow.status !== 'resolved' && detailRow.status !== 'ignored' && (
                <button onClick={() => handleStatusChange('investigating')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold spring-btn inline-flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--state-warn-bg)', color: 'var(--state-warn)', border: '1px solid var(--state-warn)' }}>
                  <Search size={14} />İnceleniyor
                </button>
              )}
              <button onClick={() => handleStatusChange('resolved')}
                className="btn-primary flex-1 py-2.5 rounded-xl text-sm font-bold spring-btn inline-flex items-center justify-center gap-1.5">
                <CircleCheck size={14} />Çözüldü
              </button>
              <button onClick={() => handleStatusChange('ignored')}
                className="ui-chip flex-1 py-2.5 rounded-xl text-sm font-semibold spring-btn inline-flex items-center justify-center gap-1.5">
                <Ban size={14} />Yok Say
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
