// apps/web/src/api/ownerApi.ts
// Owner (patron) paneli için API çağrıları

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';

// ─────────────────────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────────────────────

export type ReportRange = {
  from: string;
  to: string;
};

export type ReportKpi = {
  revenue_int: number;
  delivered_count: number;
  cancelled_count: number;
  average_ticket_int: number;
  cancellation_rate: number; // 0-100 arası, 1 ondalık
  avg_prep_seconds: number;
};

export type HourlyPoint = {
  hour: number; // 0-23
  orders: number;
  revenue: number;
};

export type DailyPoint = {
  date: string; // ISO
  orders: number;
  revenue: number;
};

export type ProductStat = {
  name: string;
  quantity: number;
  revenue: number;
};

export type TableStat = {
  name: string;
  orders: number;
  revenue: number;
};

export type CancellationStat = {
  reason_code: string;
  count: number;
  total_amount: number;
};

export type ReportOverview = {
  range: ReportRange;
  kpi: ReportKpi;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  top_products_by_quantity: ProductStat[];
  top_products_by_revenue: ProductStat[];
  tables: TableStat[];
  cancellations: CancellationStat[];
  cash_shortage_int: number;
};

// ─────────────────────────────────────────────────────────────
// API ÇAĞRILARI
// ─────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message ?? 'Bir hata oluştu.');
  }
  return data as T;
}

/**
 * Rapor özet verisi (tüm veriler tek istek)
 * @param token access token
 * @param from tarih (YYYY-MM-DD formatı kabul eder)
 * @param to tarih (YYYY-MM-DD formatı kabul eder)
 */
export async function fetchReportOverview(
  token: string,
  from: string,
  to: string
): Promise<ReportOverview> {
  const url = `${API_BASE_URL}/owner/reports/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return handleResponse<ReportOverview>(res);
}

// ─────────────────────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ─────────────────────────────────────────────────────────────

/**
 * price_int (kuruş) → TL string "123.45"
 */
export function priceIntToTl(value: number): string {
  return (value / 100).toFixed(2);
}

/**
 * price_int (kuruş) → "1.234,56 TL" (Türk formatı)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
}

/**
 * Saniye → "12 dk 37 sn" formatı
 */
export function formatPrepTime(seconds: number): string {
  if (!seconds || seconds < 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} sn`;
  if (s === 0) return `${m} dk`;
  return `${m} dk ${s} sn`;
}

/**
 * Date → "YYYY-MM-DD" (backend için)
 */
export function toDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─────────────────────────────────────────────────────────────
// ÖNCEDEN TANIMLI TARİH ARALIKLARI
// ─────────────────────────────────────────────────────────────

export type DateRangePreset = 'today' | 'yesterday' | 'last_7' | 'last_30' | 'this_month' | 'custom';

export function getPresetRange(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'today':
      return { from: toDateStr(now), to: toDateStr(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: toDateStr(y), to: toDateStr(y) };
    }
    case 'last_7': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: toDateStr(from), to: toDateStr(now) };
    }
    case 'last_30': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: toDateStr(from), to: toDateStr(now) };
    }
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateStr(from), to: toDateStr(now) };
    }
    default:
      return { from: toDateStr(now), to: toDateStr(now) };
  }
}

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Bugün',
  yesterday: 'Dün',
  last_7: 'Son 7 Gün',
  last_30: 'Son 30 Gün',
  this_month: 'Bu Ay',
  custom: 'Özel'
};

// ─────────────────────────────────────────────────────────────
// İPTAL SEBEP KODU → ETİKET
// ─────────────────────────────────────────────────────────────

export const CANCEL_REASON_LABELS: Record<string, string> = {
  customer_cancelled: 'Müşteri vazgeçti',
  customer_left: 'Müşteri gitti',
  not_claimed: 'Hazır ama alıcı yok',
  no_payment: 'Ödemeden gitti',
  wrong_order: 'Yanlış sipariş',
  out_of_stock: 'Stok yok',
  other: 'Diğer'
};

export function cancelReasonLabel(code: string): string {
  return CANCEL_REASON_LABELS[code] || code;
}