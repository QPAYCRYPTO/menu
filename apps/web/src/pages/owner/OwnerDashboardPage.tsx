// apps/web/src/pages/owner/OwnerDashboardPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { useAuth } from '../../auth/AuthContext';
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

type TabKey = 'sales' | 'products' | 'cancellations';

const TAB_LABELS: Record<TabKey, { label: string; icon: string }> = {
  sales: { label: 'Satış', icon: '💰' },
  products: { label: 'Ürün', icon: '📦' },
  cancellations: { label: 'İptal & Risk', icon: '⚠️' }
};

// Koyu cam üzerinde okunur grafik stilleri
const CHART_ACCENT = '#FF7A29';
const CHART_TICK = { fontSize: 12, fill: 'rgba(255,255,255,0.7)' };
const CHART_GRID = 'rgba(255,255,255,0.15)';
const CHART_AXIS_LINE = { stroke: 'rgba(255,255,255,0.25)' };
const CHART_TOOLTIP_CONTENT: React.CSSProperties = {
  background: 'rgba(20,17,15,0.85)',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 14,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
  color: '#fff'
};
const CHART_TOOLTIP_LABEL: React.CSSProperties = { color: '#fff', fontWeight: 700 };
const CHART_TOOLTIP_ITEM: React.CSSProperties = { color: 'rgba(255,255,255,0.9)' };
const CHART_CURSOR_LINE = { stroke: 'rgba(255,255,255,0.35)' };
const CHART_CURSOR_BAR = { fill: 'rgba(255,255,255,0.08)' };

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
    <div className="glass-panel rounded-3xl p-3 mb-5">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(p => {
          const active = preset === p;
          return (
            <button
              key={p}
              onClick={() => onPresetChange(p)}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-semibold spring-btn ${active ? 'btn-accent' : 'glass-pill'}`}
            >
              {PRESET_LABELS[p]}
            </button>
          );
        })}

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white/70">
            <i className="fa-regular fa-calendar mr-1" />Özel:
          </span>
          <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={e => onCustomChange(e.target.value, customTo)}
            className="glass-input px-2 py-1 rounded-xl text-xs"
            style={preset === 'custom' ? { borderColor: 'var(--accent)' } : undefined}
          />
          <span className="text-xs text-white/50">→</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            onChange={e => onCustomChange(customFrom, e.target.value)}
            className="glass-input px-2 py-1 rounded-xl text-xs"
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

function KpiCard({ label, value, sub, color = '#FFFFFF' }: KpiCardProps) {
  return (
    <div className="glass-card rounded-3xl p-4">
      <div className="text-[11px] font-semibold mb-2 uppercase tracking-wider text-white/70">
        {label}
      </div>
      <div className="font-serif text-xl font-bold" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1 text-white/60">{sub}</div>
      )}
    </div>
  );
}

function KpiStrip({ data }: { data: ReportOverview }) {
  const k = data.kpi;
  const cancelColor = k.cancellation_rate >= 10 ? 'var(--danger)' : k.cancellation_rate >= 5 ? 'var(--warning)' : 'var(--success)';

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
      <div className="glass-dark rounded-3xl p-4 sm:p-5">
        <h3 className="font-serif font-bold text-base mb-4 text-white">
          📈 Günlük Ciro Trendi
        </h3>
        {dailyData.length === 0 ? (
          <div className="text-center py-12 text-sm text-white/60">
            Bu aralıkta veri yok
          </div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="dateLabel" tick={CHART_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} />
                <YAxis tick={CHART_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(2)} TL`, 'Ciro']}
                  labelStyle={CHART_TOOLTIP_LABEL}
                  contentStyle={CHART_TOOLTIP_CONTENT}
                  itemStyle={CHART_TOOLTIP_ITEM}
                  cursor={CHART_CURSOR_LINE}
                />
                <Line type="monotone" dataKey="revenue" stroke={CHART_ACCENT} strokeWidth={2.5}
                  dot={{ fill: CHART_ACCENT, stroke: '#fff', strokeWidth: 1, r: 4 }}
                  activeDot={{ fill: CHART_ACCENT, stroke: '#fff', strokeWidth: 2, r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Saatlik Yoğunluk */}
      <div className="glass-dark rounded-3xl p-4 sm:p-5">
        <h3 className="font-serif font-bold text-base mb-4 text-white">
          🕐 Saatlik Sipariş Yoğunluğu
        </h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={hourlyFull}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="hourLabel" tick={{ ...CHART_TICK, fontSize: 10 }} interval={1} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} />
              <YAxis tick={CHART_TICK} axisLine={CHART_AXIS_LINE} tickLine={CHART_AXIS_LINE} />
              <Tooltip
                formatter={(value) => [`${Number(value)} sipariş`, 'Sipariş']}
                labelStyle={CHART_TOOLTIP_LABEL}
                contentStyle={CHART_TOOLTIP_CONTENT}
                itemStyle={CHART_TOOLTIP_ITEM}
                cursor={CHART_CURSOR_BAR}
              />
              <Bar dataKey="orders" fill={CHART_ACCENT} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Masa Performansı */}
      <div className="glass-dark rounded-3xl p-4 sm:p-5">
        <h3 className="font-serif font-bold text-base mb-4 text-white">
          🪑 Masa Performansı (Top 20)
        </h3>
        {data.tables.length === 0 ? (
          <div className="text-center py-8 text-sm text-white/60">
            Bu aralıkta veri yok
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-white/60">Masa</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-white/60">Sipariş</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-white/60">Ciro</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.map((t, i) => (
                  <tr key={`${t.name}-${i}`} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="py-2 font-semibold text-white">{t.name}</td>
                    <td className="py-2 text-right text-white/70">{t.orders}</td>
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
    <div className="glass-dark rounded-3xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-serif font-bold text-base text-white">
          📦 Top 10 Ürün
        </h3>
        <div className="flex gap-1 p-1 rounded-2xl bg-black/30 border border-white/20">
          <button
            onClick={() => setSortBy('quantity')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold spring-btn ${sortBy === 'quantity' ? 'btn-accent' : 'text-white/70'}`}
          >
            Adet
          </button>
          <button
            onClick={() => setSortBy('revenue')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold spring-btn ${sortBy === 'revenue' ? 'btn-accent' : 'text-white/70'}`}
          >
            Ciro
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 text-sm text-white/60">
          Bu aralıkta veri yok
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-white/60">#</th>
                <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-white/60">Ürün</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-white/60">Adet</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-white/60">Ciro</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={`${p.name}-${i}`} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                  <td className="py-2 text-xs font-mono text-white/50">{i + 1}</td>
                  <td className="py-2 font-semibold text-white">{p.name}</td>
                  <td className="py-2 text-right text-white/70">{p.quantity}</td>
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
          className="rounded-3xl p-5 backdrop-blur-xl"
          style={{ background: 'var(--danger-bg)', border: '1.5px solid rgba(251,113,133,0.55)', boxShadow: 'var(--glass-shadow-sm)' }}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">💸</span>
            <div className="flex-1">
              <div className="font-extrabold text-sm tracking-wide" style={{ color: 'var(--danger)' }}>
                KASA AÇIĞI ALARMI
              </div>
              <div className="font-serif mt-2 text-2xl font-bold text-white">
                {formatCurrency(cashShortage)}
              </div>
              <div className="text-xs mt-1 text-white/75">
                "Ödemeden gitti" olarak iptal edilen siparişlerin toplamı
              </div>
            </div>
          </div>
        </div>
      )}

      {/* İptal Sebep Dağılımı */}
      <div className="glass-dark rounded-3xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-serif font-bold text-base text-white">
            ❌ İptal Sebep Dağılımı
          </h3>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.4)' }}>
            Toplam: {totalCancelled} iptal
          </span>
        </div>

        {cancellations.length === 0 ? (
          <div className="text-center py-8 text-sm text-white/60">
            Bu aralıkta iptal edilen sipariş yok 🎉
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
                    background: isCashLoss ? 'var(--danger-bg)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${isCashLoss ? 'rgba(251,113,133,0.45)' : 'rgba(255,255,255,0.18)'}`
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-white">
                      {isCashLoss && '💸 '}
                      {cancelReasonLabel(c.reason_code)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {c.count} sipariş
                      </span>
                      {c.total_amount > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                          style={{
                            background: isCashLoss ? 'rgba(244,63,94,0.3)' : 'rgba(255,255,255,0.14)',
                            color: isCashLoss ? 'var(--danger)' : 'rgba(255,255,255,0.8)'
                          }}>
                          {formatCurrency(c.total_amount)}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Yüzde çubuğu */}
                  <div className="h-1.5 rounded-full overflow-hidden bg-white/15">
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background: isCashLoss ? 'var(--danger)' : 'var(--accent-gradient)',
                        transition: 'width 0.3s'
                      }}
                    />
                  </div>
                  <div className="text-xs mt-1 text-right text-white/55">
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
    <div className="text-white">
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
          className="rounded-2xl p-4 mb-5 text-sm font-medium backdrop-blur-xl"
          style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.45)' }}
        >
          ⚠️ {error}
          <button
            onClick={loadReport}
            className="ml-3 px-3 py-1 rounded-xl text-xs font-semibold spring-btn glass-pill"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Yükleniyor */}
      {loading && !data && (
        <div className="py-16 flex justify-center">
          <div className="glass-panel rounded-3xl px-8 py-6 text-center fade-enter">
            <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-white/80">Rapor yükleniyor...</p>
          </div>
        </div>
      )}

      {/* Veri var */}
      {data && (
        <>
          {/* KPI Kartları */}
          <KpiStrip data={data} />

          {/* Sekmeler */}
          <div className="flex gap-1 mb-4 p-1 rounded-2xl bg-black/35 border border-white/20 backdrop-blur-xl">
            {(Object.keys(TAB_LABELS) as TabKey[]).map(key => {
              const tab = TAB_LABELS[key];
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold spring-btn ${active ? 'btn-accent' : 'text-white/70 hover:text-white'}`}
                >
                  {tab.icon} {tab.label}
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
              <p className="text-xs text-white/60">Güncelleniyor...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
