// apps/web/src/pages/owner/OwnerDashboardPage.tsx
// Atölye tasarımı: gece/gündüz uyumlu kartlar; grafik renkleri aktif temaya göre (useChartTheme)
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../lib/theme';
import {
  fetchReportOverview,
  ReportOverview,
  DateRangePreset,
  getPresetRange,
  PRESET_LABELS,
  formatCurrency,
  formatPrepTime,
  cancelReasonLabel
} from '../../api/ownerApi';
import {
  Wallet, Package, TriangleAlert, CalendarDays, ArrowRight, TrendingUp, Clock,
  Armchair, Banknote, CircleX, PartyPopper, type LucideIcon
} from 'lucide-react';

type TabKey = 'sales' | 'products' | 'cancellations';

const TAB_LABELS: Record<TabKey, { label: string; icon: LucideIcon }> = {
  sales: { label: 'Satış', icon: Wallet },
  products: { label: 'Ürün', icon: Package },
  cancellations: { label: 'İptal & Risk', icon: TriangleAlert }
};

// Grafik renkleri aktif temaya göre (Recharts SVG özniteliği kullanır; orada var(--…) güvenilir değil)
function useChartTheme() {
  const { theme } = useTheme();
  return useMemo(() => {
    const dark = theme === 'dark';
    const ink = dark ? '#efebe3' : '#073f46';
    const muted = dark ? '#98a4a8' : '#7a7e82';
    const line = dark ? '#28404a' : '#e9e6e0';
    const surface = dark ? '#15252c' : '#ffffff';
    return {
      accent: dark ? '#5aa9b0' : '#073f46',
      surface,
      tick: { fontSize: 12, fill: muted },
      grid: line,
      axisLine: { stroke: line },
      tooltipContent: {
        background: surface,
        border: `1px solid ${line}`,
        borderRadius: 14,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        color: ink
      } as React.CSSProperties,
      tooltipLabel: { color: ink, fontWeight: 700 } as React.CSSProperties,
      tooltipItem: { color: ink } as React.CSSProperties,
      cursorLine: { stroke: muted },
      cursorBar: { fill: dark ? 'rgba(239,235,227,0.06)' : 'rgba(7,63,70,0.06)' }
    };
  }, [theme]);
}

// ─────────────────────────────────────────────────────────────
// TARİH FİLTRESİ
// ─────────────────────────────────────────────────────────────

type DateRangeBarProps = {
  preset: DateRangePreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomChange: (from: string, to: string) => void;
};

function DateRangeBar({ preset, customFrom, customTo, onPresetChange, onCustomChange }: DateRangeBarProps) {
  const presets: DateRangePreset[] = ['today', 'yesterday', 'last_7', 'last_30', 'this_month'];

  return (
    <div className="ui-card rounded-3xl p-3 mb-5">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(p => {
          const active = preset === p;
          return (
            <button
              key={p}
              onClick={() => onPresetChange(p)}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-semibold spring-btn ${active ? 'btn-primary' : 'ui-chip'}`}
            >
              {PRESET_LABELS[p]}
            </button>
          );
        })}

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-ink-muted inline-flex items-center">
            <CalendarDays size={12} className="mr-1" />Özel:
          </span>
          <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={e => onCustomChange(e.target.value, customTo)}
            className="ui-input px-2 py-1 rounded-xl text-xs"
            style={preset === 'custom' ? { borderColor: 'var(--accent)' } : undefined}
          />
          <ArrowRight size={12} className="text-ink-muted" />
          <input
            type="date"
            value={customTo}
            min={customFrom}
            onChange={e => onCustomChange(customFrom, e.target.value)}
            className="ui-input px-2 py-1 rounded-xl text-xs"
            style={preset === 'custom' ? { borderColor: 'var(--accent)' } : undefined}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI KARTLARI
// ─────────────────────────────────────────────────────────────

type KpiCardProps = {
  label: string;
  value: string;
  sub?: string;
  color?: string;
};

function KpiCard({ label, value, sub, color = 'var(--ink)' }: KpiCardProps) {
  return (
    <div className="ui-card rounded-3xl p-4">
      <div className="text-[11px] font-semibold mb-2 uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="font-serif text-xl font-bold" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1 text-ink-muted">{sub}</div>
      )}
    </div>
  );
}

function KpiStrip({ data }: { data: ReportOverview }) {
  const k = data.kpi;
  const cancelColor = k.cancellation_rate >= 10 ? 'var(--state-danger)' : k.cancellation_rate >= 5 ? 'var(--state-warn)' : 'var(--state-ok)';

  return (
    <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <KpiCard
        label="Ciro"
        value={formatCurrency(k.revenue_int)}
        sub={`${k.delivered_count} sipariş`}
        color="var(--accent)"
      />
      <KpiCard
        label="Sipariş Sayısı"
        value={String(k.delivered_count)}
        sub="teslim edilen"
      />
      <KpiCard
        label="Ortalama Adisyon"
        value={formatCurrency(k.average_ticket_int)}
        sub="sipariş başı"
      />
      <KpiCard
        label="İptal Oranı"
        value={`%${k.cancellation_rate.toFixed(1)}`}
        sub={`${k.cancelled_count} iptal`}
        color={cancelColor}
      />
      <KpiCard
        label="Hazırlama Süresi"
        value={formatPrepTime(k.avg_prep_seconds)}
        sub="ortalama"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SATIŞ SEKMESİ
// ─────────────────────────────────────────────────────────────

function SalesTab({ data }: { data: ReportOverview }) {
  const C = useChartTheme();
  const hourlyFull = useMemo(() => {
    const map = new Map(data.hourly.map(h => [h.hour, h]));
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      hourLabel: `${String(i).padStart(2, '0')}:00`,
      orders: map.get(i)?.orders ?? 0,
      revenue: map.get(i)?.revenue ?? 0
    }));
  }, [data]);

  const dailyData = useMemo(() => {
    return data.daily.map(d => ({
      date: d.date,
      dateLabel: new Date(d.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
      orders: d.orders,
      revenue: d.revenue / 100
    }));
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Günlük Trend */}
      <div className="ui-card rounded-3xl p-4 sm:p-5">
        <h3 className="font-serif font-bold text-base mb-4 text-ink flex items-center gap-2">
          <TrendingUp size={16} />Günlük Ciro Trendi
        </h3>
        {dailyData.length === 0 ? (
          <div className="text-center py-12 text-sm text-ink-muted">
            Bu aralıkta veri yok
          </div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="dateLabel" tick={C.tick} axisLine={C.axisLine} tickLine={C.axisLine} />
                <YAxis tick={C.tick} axisLine={C.axisLine} tickLine={C.axisLine} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(2)} TL`, 'Ciro']}
                  labelStyle={C.tooltipLabel}
                  contentStyle={C.tooltipContent}
                  itemStyle={C.tooltipItem}
                  cursor={C.cursorLine}
                />
                <Line type="monotone" dataKey="revenue" stroke={C.accent} strokeWidth={2.5}
                  dot={{ fill: C.accent, stroke: C.surface, strokeWidth: 1, r: 4 }}
                  activeDot={{ fill: C.accent, stroke: C.surface, strokeWidth: 2, r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Saatlik Yoğunluk */}
      <div className="ui-card rounded-3xl p-4 sm:p-5">
        <h3 className="font-serif font-bold text-base mb-4 text-ink flex items-center gap-2">
          <Clock size={16} />Saatlik Sipariş Yoğunluğu
        </h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={hourlyFull}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="hourLabel" tick={{ ...C.tick, fontSize: 10 }} interval={1} axisLine={C.axisLine} tickLine={C.axisLine} />
              <YAxis tick={C.tick} axisLine={C.axisLine} tickLine={C.axisLine} />
              <Tooltip
                formatter={(value) => [`${Number(value)} sipariş`, 'Sipariş']}
                labelStyle={C.tooltipLabel}
                contentStyle={C.tooltipContent}
                itemStyle={C.tooltipItem}
                cursor={C.cursorBar}
              />
              <Bar dataKey="orders" fill={C.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Masa Performansı */}
      <div className="ui-card rounded-3xl p-4 sm:p-5">
        <h3 className="font-serif font-bold text-base mb-4 text-ink flex items-center gap-2">
          <Armchair size={16} />Masa Performansı (Top 20)
        </h3>
        {data.tables.length === 0 ? (
          <div className="text-center py-8 text-sm text-ink-muted">
            Bu aralıkta veri yok
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Masa</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Sipariş</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Ciro</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.map((t, i) => (
                  <tr key={`${t.name}-${i}`} className="border-b border-line hover:bg-surface-2 transition-colors">
                    <td className="py-2 font-semibold text-ink">{t.name}</td>
                    <td className="py-2 text-right text-ink-muted">{t.orders}</td>
                    <td className="py-2 text-right font-bold" style={{ color: 'var(--accent)' }}>
                      {formatCurrency(t.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ÜRÜN SEKMESİ
// ─────────────────────────────────────────────────────────────

function ProductsTab({ data }: { data: ReportOverview }) {
  const [sortBy, setSortBy] = useState<'quantity' | 'revenue'>('quantity');

  const products = sortBy === 'quantity'
    ? data.top_products_by_quantity
    : data.top_products_by_revenue;

  return (
    <div className="ui-card rounded-3xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-serif font-bold text-base text-ink flex items-center gap-2">
          <Package size={16} />Top 10 Ürün
        </h3>
        <div className="flex gap-1 p-1 rounded-2xl bg-surface-2 border border-line">
          <button
            onClick={() => setSortBy('quantity')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold spring-btn ${sortBy === 'quantity' ? 'btn-primary' : 'text-ink-muted'}`}
          >
            Adet
          </button>
          <button
            onClick={() => setSortBy('revenue')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold spring-btn ${sortBy === 'revenue' ? 'btn-primary' : 'text-ink-muted'}`}
          >
            Ciro
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 text-sm text-ink-muted">
          Bu aralıkta veri yok
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">#</th>
                <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Ürün</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Adet</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Ciro</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={`${p.name}-${i}`} className="border-b border-line hover:bg-surface-2 transition-colors">
                  <td className="py-2 text-xs font-mono text-ink-muted">{i + 1}</td>
                  <td className="py-2 font-semibold text-ink">{p.name}</td>
                  <td className="py-2 text-right text-ink-muted">{p.quantity}</td>
                  <td className="py-2 text-right font-bold" style={{ color: 'var(--accent)' }}>
                    {formatCurrency(p.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// İPTAL & RİSK SEKMESİ
// ─────────────────────────────────────────────────────────────

function CancellationsTab({ data }: { data: ReportOverview }) {
  const cancellations = data.cancellations;
  const cashShortage = data.cash_shortage_int;
  const totalCancelled = cancellations.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-5">
      {/* Kasa Açığı Uyarısı */}
      {cashShortage > 0 && (
        <div
          className="rounded-3xl p-5 "
          style={{ background: 'var(--state-danger-bg)', border: '1.5px solid var(--state-danger)', boxShadow: 'var(--shadow)' }}
        >
          <div className="flex items-start gap-3">
            <Banknote size={24} className="flex-shrink-0" style={{ color: 'var(--state-danger)' }} />
            <div className="flex-1">
              <div className="font-extrabold text-sm tracking-wide" style={{ color: 'var(--state-danger)' }}>
                KASA AÇIĞI ALARMI
              </div>
              <div className="font-serif mt-2 text-2xl font-bold text-ink">
                {formatCurrency(cashShortage)}
              </div>
              <div className="text-xs mt-1 text-ink-muted">
                "Ödemeden gitti" olarak iptal edilen siparişlerin toplamı
              </div>
            </div>
          </div>
        </div>
      )}

      {/* İptal Sebep Dağılımı */}
      <div className="ui-card rounded-3xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-serif font-bold text-base text-ink flex items-center gap-2">
            <CircleX size={16} />İptal Sebep Dağılımı
          </h3>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--state-warn-bg)', color: 'var(--state-warn)' }}>
            Toplam: {totalCancelled} iptal
          </span>
        </div>

        {cancellations.length === 0 ? (
          <div className="text-center py-8 text-sm text-ink-muted flex items-center justify-center gap-1.5">
            Bu aralıkta iptal edilen sipariş yok <PartyPopper size={14} />
          </div>
        ) : (
          <div className="space-y-2">
            {cancellations.map(c => {
              const percentage = totalCancelled > 0 ? (c.count / totalCancelled) * 100 : 0;
              const isCashLoss = c.reason_code === 'no_payment';
              return (
                <div
                  key={c.reason_code}
                  className="p-3 rounded-2xl"
                  style={{
                    background: isCashLoss ? 'var(--state-danger-bg)' : 'var(--surface-2)',
                    border: `1px solid ${isCashLoss ? 'var(--state-danger)' : 'var(--line)'}`
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-ink flex items-center gap-1.5">
                      {isCashLoss && <Banknote size={14} style={{ color: 'var(--state-danger)' }} />}
                      {cancelReasonLabel(c.reason_code)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink">
                        {c.count} sipariş
                      </span>
                      {c.total_amount > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                          style={{
                            background: isCashLoss ? 'var(--state-danger-bg)' : 'var(--surface)',
                            color: isCashLoss ? 'var(--state-danger)' : 'var(--ink-muted)'
                          }}>
                          {formatCurrency(c.total_amount)}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Yüzde çubuğu */}
                  <div className="h-1.5 rounded-full overflow-hidden bg-surface-2">
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background: isCashLoss ? 'var(--state-danger)' : 'var(--brand)',
                        transition: 'width 0.3s'
                      }}
                    />
                  </div>
                  <div className="text-xs mt-1 text-right text-ink-muted">
                    %{percentage.toFixed(1)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────

export function OwnerDashboardPage() {
  const { accessToken } = useAuth();

  // Tarih aralığı state'i
  const [preset, setPreset] = useState<DateRangePreset>('last_7');
  const [customFrom, setCustomFrom] = useState<string>(() => getPresetRange('last_7').from);
  const [customTo, setCustomTo] = useState<string>(() => getPresetRange('last_7').to);

  // Rapor state'i
  const [data, setData] = useState<ReportOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('sales');

  // Aktif tarih aralığı (preset veya custom)
  const effectiveRange = useMemo(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  // Rapor çekme
  const loadReport = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReportOverview(accessToken, effectiveRange.from, effectiveRange.to);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rapor yüklenemedi.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, effectiveRange.from, effectiveRange.to]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  function handlePresetChange(p: DateRangePreset) {
    setPreset(p);
    if (p !== 'custom') {
      const range = getPresetRange(p);
      setCustomFrom(range.from);
      setCustomTo(range.to);
    }
  }

  function handleCustomChange(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    setPreset('custom');
  }

  return (
    <div className="text-ink">
      {/* Tarih filtresi */}
      <DateRangeBar
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        onPresetChange={handlePresetChange}
        onCustomChange={handleCustomChange}
      />

      {/* Hata */}
      {error && (
        <div
          className="rounded-2xl p-4 mb-5 text-sm font-medium "
          style={{ background: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}
        >
          <TriangleAlert size={14} className="inline-block align-[-2px] mr-1" />{error}
          <button
            onClick={loadReport}
            className="ml-3 px-3 py-1 rounded-xl text-xs font-semibold spring-btn ui-chip"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Yükleniyor */}
      {loading && !data && (
        <div className="py-16 flex justify-center">
          <div className="ui-card rounded-3xl px-8 py-6 text-center fade-enter">
            <div className="w-10 h-10 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-ink-muted">Rapor yükleniyor...</p>
          </div>
        </div>
      )}

      {/* Veri var */}
      {data && (
        <>
          {/* KPI Kartları */}
          <KpiStrip data={data} />

          {/* Sekmeler */}
          <div className="flex gap-1 mb-4 p-1 rounded-2xl bg-surface-2 border border-line ">
            {(Object.keys(TAB_LABELS) as TabKey[]).map(key => {
              const tab = TAB_LABELS[key];
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold spring-btn inline-flex items-center justify-center gap-1.5 ${active ? 'btn-primary' : 'text-ink-muted hover:text-ink'}`}
                >
                  <tab.icon size={12} />{tab.label}
                </button>
              );
            })}
          </div>

          {/* Sekme İçeriği */}
          {activeTab === 'sales' && <SalesTab data={data} />}
          {activeTab === 'products' && <ProductsTab data={data} />}
          {activeTab === 'cancellations' && <CancellationsTab data={data} />}

          {/* Yenileme indicator'ı */}
          {loading && (
            <div className="text-center mt-4">
              <p className="text-xs text-ink-muted">Güncelleniyor...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
