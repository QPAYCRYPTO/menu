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
    <div className="bg-white rounded-2xl p-3 mb-5" style={{ border: '1px solid #E2E8F0' }}>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(p => {
          const active = preset === p;
          return (
            <button
              key={p}
              onClick={() => onPresetChange(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-transform"
              style={{
                background: active ? '#0F172A' : '#F1F5F9',
                color: active ? 'white' : '#0F172A'
              }}
            >
              {PRESET_LABELS[p]}
            </button>
          );
        })}

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: '#64748B' }}>Özel:</span>
          <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={e => onCustomChange(e.target.value, customTo)}
            className="px-2 py-1 rounded-lg text-xs outline-none"
            style={{
              border: '1px solid #E2E8F0',
              background: preset === 'custom' ? 'white' : '#F8FAFC',
              color: '#0F172A'
            }}
          />
          <span className="text-xs" style={{ color: '#94A3B8' }}>→</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            onChange={e => onCustomChange(customFrom, e.target.value)}
            className="px-2 py-1 rounded-lg text-xs outline-none"
            style={{
              border: '1px solid #E2E8F0',
              background: preset === 'custom' ? 'white' : '#F8FAFC',
              color: '#0F172A'
            }}
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

function KpiCard({ label, value, sub, color = '#0F172A' }: KpiCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
      <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#64748B' }}>
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color, fontFamily: 'Georgia, serif' }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: '#94A3B8' }}>{sub}</div>
      )}
    </div>
  );
}

function KpiStrip({ data }: { data: ReportOverview }) {
  const k = data.kpi;
  const cancelColor = k.cancellation_rate >= 10 ? '#DC2626' : k.cancellation_rate >= 5 ? '#D97706' : '#16A34A';

  return (
    <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <KpiCard
        label="Ciro"
        value={formatCurrency(k.revenue_int)}
        sub={`${k.delivered_count} sipariş`}
        color="#0D9488"
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
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
        <h3 className="font-bold text-sm mb-4" style={{ color: '#0F172A' }}>
          📈 Günlük Ciro Trendi
        </h3>
        {dailyData.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: '#94A3B8' }}>
            Bu aralıkta veri yok
          </div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(2)} TL`, 'Ciro']}
                  labelStyle={{ color: '#0F172A', fontWeight: 600 }}
                  contentStyle={{ border: '1px solid #E2E8F0', borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#0D9488" strokeWidth={2} dot={{ fill: '#0D9488', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Saatlik Yoğunluk */}
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
        <h3 className="font-bold text-sm mb-4" style={{ color: '#0F172A' }}>
          🕐 Saatlik Sipariş Yoğunluğu
        </h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={hourlyFull}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="hourLabel" tick={{ fontSize: 10, fill: '#64748B' }} interval={1} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip
                formatter={(value) => [`${Number(value)} sipariş`, 'Sipariş']}
                labelStyle={{ color: '#0F172A', fontWeight: 600 }}
                contentStyle={{ border: '1px solid #E2E8F0', borderRadius: 8 }}
              />
              <Bar dataKey="orders" fill="#0D9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Masa Performansı */}
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
        <h3 className="font-bold text-sm mb-4" style={{ color: '#0F172A' }}>
          🪑 Masa Performansı (Top 20)
        </h3>
        {data.tables.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: '#94A3B8' }}>
            Bu aralıkta veri yok
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Masa</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Sipariş</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Ciro</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.map((t, i) => (
                  <tr key={`${t.name}-${i}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td className="py-2 font-semibold" style={{ color: '#0F172A' }}>{t.name}</td>
                    <td className="py-2 text-right" style={{ color: '#64748B' }}>{t.orders}</td>
                    <td className="py-2 text-right font-semibold" style={{ color: '#0D9488' }}>
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
    <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-bold text-sm" style={{ color: '#0F172A' }}>
          📦 Top 10 Ürün
        </h3>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#F1F5F9' }}>
          <button
            onClick={() => setSortBy('quantity')}
            className="px-3 py-1 rounded-md text-xs font-semibold"
            style={{
              background: sortBy === 'quantity' ? 'white' : 'transparent',
              color: sortBy === 'quantity' ? '#0D9488' : '#64748B',
              boxShadow: sortBy === 'quantity' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            Adet
          </button>
          <button
            onClick={() => setSortBy('revenue')}
            className="px-3 py-1 rounded-md text-xs font-semibold"
            style={{
              background: sortBy === 'revenue' ? 'white' : 'transparent',
              color: sortBy === 'revenue' ? '#0D9488' : '#64748B',
              boxShadow: sortBy === 'revenue' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            Ciro
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: '#94A3B8' }}>
          Bu aralıkta veri yok
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>#</th>
                <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Ürün</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Adet</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Ciro</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={`${p.name}-${i}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td className="py-2 text-xs font-mono" style={{ color: '#94A3B8' }}>{i + 1}</td>
                  <td className="py-2 font-semibold" style={{ color: '#0F172A' }}>{p.name}</td>
                  <td className="py-2 text-right" style={{ color: '#64748B' }}>{p.quantity}</td>
                  <td className="py-2 text-right font-semibold" style={{ color: '#0D9488' }}>
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
          className="rounded-2xl p-5"
          style={{ background: '#FEF2F2', border: '2px solid #FECACA' }}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">💸</span>
            <div className="flex-1">
              <div className="font-bold text-sm" style={{ color: '#991B1B' }}>
                KASA AÇIĞI ALARMI
              </div>
              <div className="mt-2 text-xl font-bold" style={{ color: '#DC2626', fontFamily: 'Georgia, serif' }}>
                {formatCurrency(cashShortage)}
              </div>
              <div className="text-xs mt-1" style={{ color: '#7F1D1D' }}>
                "Ödemeden gitti" olarak iptal edilen siparişlerin toplamı
              </div>
            </div>
          </div>
        </div>
      )}

      {/* İptal Sebep Dağılımı */}
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-sm" style={{ color: '#0F172A' }}>
            ❌ İptal Sebep Dağılımı
          </h3>
          <span className="text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ background: '#FEF3C7', color: '#92400E' }}>
            Toplam: {totalCancelled} iptal
          </span>
        </div>

        {cancellations.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: '#94A3B8' }}>
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
                  className="p-3 rounded-xl"
                  style={{
                    background: isCashLoss ? '#FEF2F2' : '#F8FAFC',
                    border: `1px solid ${isCashLoss ? '#FECACA' : '#E2E8F0'}`
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                      {isCashLoss && '💸 '}
                      {cancelReasonLabel(c.reason_code)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: '#0F172A' }}>
                        {c.count} sipariş
                      </span>
                      {c.total_amount > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{ background: isCashLoss ? '#FEE2E2' : '#E2E8F0', color: isCashLoss ? '#991B1B' : '#64748B' }}>
                          {formatCurrency(c.total_amount)}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Yüzde çubuğu */}
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background: isCashLoss ? '#DC2626' : '#64748B',
                        transition: 'width 0.3s'
                      }}
                    />
                  </div>
                  <div className="text-xs mt-1 text-right" style={{ color: '#94A3B8' }}>
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
    <div>
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
          className="rounded-xl p-4 mb-5 text-sm"
          style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}
        >
          ⚠️ {error}
          <button
            onClick={loadReport}
            className="ml-3 px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'white', color: '#DC2626', border: '1px solid #FECACA' }}
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Yükleniyor */}
      {loading && !data && (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: '#94A3B8' }}>Rapor yükleniyor...</p>
        </div>
      )}

      {/* Veri var */}
      {data && (
        <>
          {/* KPI Kartları */}
          <KpiStrip data={data} />

          {/* Sekmeler */}
          <div className="flex gap-1 mb-4 p-1 rounded-xl bg-white" style={{ border: '1px solid #E2E8F0' }}>
            {(Object.keys(TAB_LABELS) as TabKey[]).map(key => {
              const tab = TAB_LABELS[key];
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold active:scale-95 transition-transform"
                  style={{
                    background: active ? '#0F172A' : 'transparent',
                    color: active ? 'white' : '#64748B'
                  }}
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
              <p className="text-xs" style={{ color: '#94A3B8' }}>Güncelleniyor...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}