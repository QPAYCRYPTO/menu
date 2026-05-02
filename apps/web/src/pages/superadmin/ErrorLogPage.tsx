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

const SEVERITY_OPTIONS: ErrorSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SOURCE_OPTIONS: ErrorSource[] = ['backend', 'frontend', 'external', 'database'];
const STATUS_OPTIONS: ErrorStatus[] = ['new', 'investigating', 'resolved', 'ignored'];

const SEVERITY_COLOR: Record<ErrorSeverity, { bg: string; fg: string; label: string }> = {
  CRITICAL: { bg: '#FEE2E2', fg: '#991B1B', label: '🔴 Kritik' },
  HIGH:     { bg: '#FED7AA', fg: '#9A3412', label: '🟠 Yüksek' },
  MEDIUM:   { bg: '#FEF3C7', fg: '#92400E', label: '🟡 Orta' },
  LOW:      { bg: '#E0E7FF', fg: '#3730A3', label: '🔵 Düşük' }
};

const STATUS_COLOR: Record<ErrorStatus, { bg: string; fg: string; label: string }> = {
  new:           { bg: '#FEE2E2', fg: '#991B1B', label: 'YENİ' },
  investigating: { bg: '#FEF3C7', fg: '#92400E', label: 'İNCELENİYOR' },
  resolved:      { bg: '#F0FDF4', fg: '#16A34A', label: 'ÇÖZÜLDÜ' },
  ignored:       { bg: '#F1F5F9', fg: '#64748B', label: 'YOK SAYILDI' }
};

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
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      <Toast state={toast} />

      {/* HEADER */}
      <div className="bg-white sticky top-0 z-30" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <button onClick={() => navigate('/superadmin')}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: '#F1F5F9' }} title="Geri">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </button>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#0F172A' }}>
                <span className="text-base md:text-lg">⚠️</span>
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-sm md:text-base truncate" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                  Hata Logu
                </h1>
                <p className="text-xs hidden sm:block" style={{ color: '#64748B' }}>
                  {total} kayıt {filterStatus.size > 0 && `(${Array.from(filterStatus).map(s => STATUS_COLOR[s].label).join(', ')})`}
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <button onClick={load} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: '#F1F5F9', color: '#0F172A' }}>
                🔄
              </button>
              <button onClick={() => setShowFilters(!showFilters)}
                className="px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ background: showFilters ? '#0D9488' : '#F1F5F9', color: showFilters ? 'white' : '#0F172A' }}>
                🔎 Filtre
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-6 pb-8">

        {/* İSTATİSTİK KARTLARI */}
        {stats && (
          <div className="grid gap-3 mb-4 md:mb-6"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-4" style={{ border: '1px solid #E2E8F0' }}>
              <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#64748B' }}>Aktif Kritik</div>
              <div className="text-xl md:text-2xl font-bold" style={{ color: stats.critical_active > 0 ? '#DC2626' : '#0F172A', fontFamily: 'Georgia, serif' }}>
                {stats.critical_active}
              </div>
            </div>
            <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-4" style={{ border: '1px solid #E2E8F0' }}>
              <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#64748B' }}>Aktif Yüksek</div>
              <div className="text-xl md:text-2xl font-bold" style={{ color: stats.high_active > 0 ? '#9A3412' : '#0F172A', fontFamily: 'Georgia, serif' }}>
                {stats.high_active}
              </div>
            </div>
            <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-4" style={{ border: '1px solid #E2E8F0' }}>
              <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#64748B' }}>Son 24 Saat</div>
              <div className="text-xl md:text-2xl font-bold" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                {stats.total_24h}
              </div>
            </div>
            <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-4" style={{ border: '1px solid #E2E8F0' }}>
              <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: '#64748B' }}>Son 7 Gün</div>
              <div className="text-xl md:text-2xl font-bold" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                {stats.total_7d}
              </div>
            </div>
          </div>
        )}

        {/* FİLTRELER */}
        {showFilters && (
          <div className="bg-white rounded-2xl p-4 mb-4" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm" style={{ color: '#0F172A' }}>Filtreler</h3>
              <button onClick={clearFilters} className="text-xs font-semibold" style={{ color: '#0D9488' }}>Temizle</button>
            </div>

            {/* Arama */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Mesaj içinde ara</label>
              <div className="flex gap-2">
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setActiveSearch(searchInput); setPage(0); }}}
                  placeholder="Hata mesajı..."
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A' }} />
                <button onClick={() => { setActiveSearch(searchInput); setPage(0); }}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: '#0D9488' }}>Ara</button>
              </div>
            </div>

            {/* Severity */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Öncelik</label>
              <div className="flex gap-2 flex-wrap">
                {SEVERITY_OPTIONS.map(s => {
                  const active = filterSeverity.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterSeverity(toggleSet(filterSeverity, s)); setPage(0); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        background: active ? SEVERITY_COLOR[s].bg : '#F1F5F9',
                        color: active ? SEVERITY_COLOR[s].fg : '#64748B',
                        border: active ? `1.5px solid ${SEVERITY_COLOR[s].fg}` : '1.5px solid transparent'
                      }}>
                      {SEVERITY_COLOR[s].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source */}
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Kaynak</label>
              <div className="flex gap-2 flex-wrap">
                {SOURCE_OPTIONS.map(s => {
                  const active = filterSource.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterSource(toggleSet(filterSource, s)); setPage(0); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: active ? '#0D9488' : '#F1F5F9', color: active ? 'white' : '#64748B' }}>
                      {SOURCE_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Durum</label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(s => {
                  const active = filterStatus.has(s);
                  return (
                    <button key={s} onClick={() => { setFilterStatus(toggleSet(filterStatus, s)); setPage(0); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        background: active ? STATUS_COLOR[s].bg : '#F1F5F9',
                        color: active ? STATUS_COLOR[s].fg : '#64748B',
                        border: active ? `1.5px solid ${STATUS_COLOR[s].fg}` : '1.5px solid transparent'
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
        <div className="hidden lg:block bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <div className="grid items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ gridTemplateColumns: '90px 90px 2.5fr 1.2fr 70px 100px 110px', background: '#F8FAFC', color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>
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
              <div className="text-3xl mb-2">⏳</div>
              <p className="text-sm" style={{ color: '#94A3B8' }}>Yükleniyor...</p>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm font-semibold" style={{ color: '#16A34A' }}>Hata kaydı bulunamadı</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Filtreleri temizleyebilir veya başka kriter deneyebilirsin</p>
            </div>
          )}

          {rows.map(row => (
            <button key={row.id} onClick={() => openDetail(row)}
              className="w-full text-left grid items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50"
              style={{ gridTemplateColumns: '90px 90px 2.5fr 1.2fr 70px 100px 110px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}>
              <div>
                <span className="px-2 py-1 rounded-md text-xs font-bold"
                  style={{ background: SEVERITY_COLOR[row.severity].bg, color: SEVERITY_COLOR[row.severity].fg }}>
                  {SEVERITY_COLOR[row.severity].label}
                </span>
              </div>
              <div className="text-xs" style={{ color: '#64748B' }}>{SOURCE_LABEL[row.source]}</div>
              <div className="truncate" style={{ color: '#0F172A' }} title={row.message}>
                {row.message}
              </div>
              <div className="min-w-0">
                {row.business_name ? (
                  <div className="text-xs font-semibold truncate" style={{ color: '#0F172A' }} title={row.business_name}>
                    🏢 {row.business_name}
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: '#94A3B8' }}>—</div>
                )}
                {row.user_email && (
                  <div className="text-xs truncate" style={{ color: '#64748B' }} title={row.user_email}>
                    {row.user_email}
                  </div>
                )}
              </div>
              <div className="text-center">
                {row.occurrence_count > 1 ? (
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold"
                    style={{ background: '#FEE2E2', color: '#991B1B' }}>×{row.occurrence_count}</span>
                ) : (
                  <span className="text-xs" style={{ color: '#94A3B8' }}>1</span>
                )}
              </div>
              <div>
                <span className="px-2 py-1 rounded-md text-xs font-bold"
                  style={{ background: STATUS_COLOR[row.status].bg, color: STATUS_COLOR[row.status].fg }}>
                  {STATUS_COLOR[row.status].label}
                </span>
              </div>
              <div className="text-xs" style={{ color: '#64748B' }} title={formatDateTime(row.last_seen_at)}>
                {timeAgo(row.last_seen_at)}
              </div>
            </button>
          ))}
        </div>

        {/* MOBİL — KARTLAR */}
        <div className="lg:hidden flex flex-col gap-3">
          {loading && rows.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
              <div className="text-3xl mb-2">⏳</div>
              <p className="text-sm" style={{ color: '#94A3B8' }}>Yükleniyor...</p>
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm font-semibold" style={{ color: '#16A34A' }}>Hata kaydı bulunamadı</p>
            </div>
          )}

          {rows.map(row => (
            <button key={row.id} onClick={() => openDetail(row)}
              className="w-full text-left bg-white rounded-2xl p-4"
              style={{ border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2 py-1 rounded-md text-xs font-bold"
                    style={{ background: SEVERITY_COLOR[row.severity].bg, color: SEVERITY_COLOR[row.severity].fg }}>
                    {SEVERITY_COLOR[row.severity].label}
                  </span>
                  <span className="px-2 py-1 rounded-md text-xs font-bold"
                    style={{ background: STATUS_COLOR[row.status].bg, color: STATUS_COLOR[row.status].fg }}>
                    {STATUS_COLOR[row.status].label}
                  </span>
                </div>
                {row.occurrence_count > 1 && (
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold flex-shrink-0"
                    style={{ background: '#FEE2E2', color: '#991B1B' }}>×{row.occurrence_count}</span>
                )}
              </div>
              <div className="text-sm font-medium mb-2" style={{ color: '#0F172A' }}>
                {row.message.length > 120 ? row.message.slice(0, 120) + '...' : row.message}
              </div>
              {row.business_name && (
                <div className="text-xs font-semibold mb-1" style={{ color: '#0D9488' }}>
                  🏢 {row.business_name}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: '#64748B' }}>
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
          <div className="flex items-center justify-between mt-4 bg-white rounded-2xl p-3" style={{ border: '1px solid #E2E8F0' }}>
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ background: page === 0 ? '#F1F5F9' : '#0D9488', color: page === 0 ? '#94A3B8' : 'white', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>
              ← Önceki
            </button>
            <span className="text-sm font-semibold" style={{ color: '#64748B' }}>
              Sayfa {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ background: page >= totalPages - 1 ? '#F1F5F9' : '#0D9488', color: page >= totalPages - 1 ? '#94A3B8' : 'white', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>
              Sonraki →
            </button>
          </div>
        )}
      </div>

      {/* DETAY MODAL */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="px-5 md:px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #E2E8F0' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-1 rounded-md text-xs font-bold flex-shrink-0"
                  style={{ background: SEVERITY_COLOR[detailRow.severity].bg, color: SEVERITY_COLOR[detailRow.severity].fg }}>
                  {SEVERITY_COLOR[detailRow.severity].label}
                </span>
                <h2 className="font-bold text-base truncate" style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}>
                  Hata Detayı
                </h2>
              </div>
              <button onClick={() => setDetailRow(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#F1F5F9', color: '#64748B' }}>✕</button>
            </div>

            <div className="p-5 md:p-6 space-y-4 overflow-y-auto flex-1">
              {detailLoading && <p className="text-sm" style={{ color: '#94A3B8' }}>Yükleniyor...</p>}

              {/* Mesaj */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Mesaj</label>
                <div className="rounded-xl p-3 text-sm" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', wordBreak: 'break-word' }}>
                  {detailRow.message}
                </div>
              </div>

              {/* Meta bilgiler */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl p-3" style={{ background: '#F8FAFC' }}>
                  <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>Kaynak</div>
                  <div className="font-semibold" style={{ color: '#0F172A' }}>{SOURCE_LABEL[detailRow.source]}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: '#F8FAFC' }}>
                  <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>Tekrar</div>
                  <div className="font-semibold" style={{ color: '#0F172A' }}>{detailRow.occurrence_count} kez</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: '#F8FAFC' }}>
                  <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>İlk Görülme</div>
                  <div className="font-semibold" style={{ color: '#0F172A' }}>{formatDateTime(detailRow.first_seen_at)}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: '#F8FAFC' }}>
                  <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>Son Görülme</div>
                  <div className="font-semibold" style={{ color: '#0F172A' }}>{formatDateTime(detailRow.last_seen_at)}</div>
                </div>
                {detailRow.business_name && (
                  <div className="rounded-xl p-3 col-span-2" style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
                    <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#0D9488' }}>🏢 İşletme</div>
                    <div className="font-bold text-sm" style={{ color: '#0F172A' }}>{detailRow.business_name}</div>
                    {detailRow.business_id && (
                      <div className="font-mono text-xs mt-1" style={{ color: '#94A3B8', wordBreak: 'break-all' }}>{detailRow.business_id}</div>
                    )}
                  </div>
                )}
                {detailRow.user_email && (
                  <div className="rounded-xl p-3 col-span-2" style={{ background: '#F8FAFC' }}>
                    <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>Kullanıcı</div>
                    <div className="font-semibold text-sm" style={{ color: '#0F172A' }}>{detailRow.user_email}</div>
                  </div>
                )}
                {!detailRow.business_name && detailRow.business_id && (
                  <div className="rounded-xl p-3 col-span-2" style={{ background: '#F8FAFC' }}>
                    <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>İşletme ID (silinmiş?)</div>
                    <div className="font-mono text-xs" style={{ color: '#0F172A', wordBreak: 'break-all' }}>{detailRow.business_id}</div>
                  </div>
                )}
              </div>

              {/* Stack trace */}
              {detailRow.stack && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Stack Trace</label>
                  <pre className="rounded-xl p-3 text-xs overflow-x-auto"
                    style={{ background: '#0F172A', color: '#94A3B8', maxHeight: 250, fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace' }}>
                    {detailRow.stack}
                  </pre>
                </div>
              )}

              {/* Context */}
              {detailRow.context && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Context</label>
                  <pre className="rounded-xl p-3 text-xs overflow-x-auto"
                    style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', maxHeight: 250, fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace' }}>
                    {JSON.stringify(detailRow.context, null, 2)}
                  </pre>
                </div>
              )}

              {/* Çözüm notu */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Çözüm Notu (opsiyonel)</label>
                <textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)}
                  placeholder="Bu hatayı nasıl çözdün? Yorumun kayıt altına alınır."
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0F172A', minHeight: 80, fontFamily: 'inherit' }} />
              </div>

              {detailRow.resolution_note && detailRow.resolved_at && (
                <div className="rounded-xl p-3 text-xs" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <div className="font-semibold uppercase tracking-wider mb-1" style={{ color: '#16A34A' }}>Önceki Çözüm Notu ({formatDateTime(detailRow.resolved_at)})</div>
                  <div style={{ color: '#0F172A' }}>{detailRow.resolution_note}</div>
                </div>
              )}
            </div>

            {/* Aksiyonlar */}
            <div className="px-5 md:px-6 py-4 flex gap-2 flex-wrap flex-shrink-0" style={{ borderTop: '1px solid #E2E8F0' }}>
              {detailRow.status !== 'investigating' && detailRow.status !== 'resolved' && detailRow.status !== 'ignored' && (
                <button onClick={() => handleStatusChange('investigating')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: '#FEF3C7', color: '#92400E' }}>
                  🔍 İnceleniyor
                </button>
              )}
              <button onClick={() => handleStatusChange('resolved')}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#16A34A' }}>
                ✅ Çözüldü
              </button>
              <button onClick={() => handleStatusChange('ignored')}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#F1F5F9', color: '#64748B' }}>
                🚫 Yok Say
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}