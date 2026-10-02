// apps/web/src/lib/money.ts
// Para girişi ve kasa hesapları (kuruş cinsinden tam sayı). Testler: money.test.ts

/**
 * Kullanıcının yazdığı tutarı kuruşa çevirir; geçersizse null.
 * Türkçe yazım: nokta binlik, virgül ondalık ayırıcıdır.
 *   "1.250"    → 125000 (1.250 TL)   "1.250,50" → 125050
 *   "150,5"    → 15050               "150.5"    → 15050 (virgülsüz tek nokta + 1-2 hane = ondalık)
 *   "12 TL"    → 1200                "-5", "1e3", "0x10", "abc", "" → null
 */
export function parseMoney(input: string): number | null {
  const t = input.replace(/\s|tl|₺/gi, '');
  if (!t) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) {
    // binlik noktalı: 1.250 / 12.500,75
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(t)) {
    normalized = t.replace(',', '.');
  } else if (/^\d+(\.\d{1,2})?$/.test(t)) {
    normalized = t;
  } else {
    return null;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Kuruşu giriş alanına yazılacak metne çevirir: 123456 → "1234,56" */
export function toMoneyInput(int: number): string {
  return (int / 100).toFixed(2).replace('.', ',');
}

/** Eşit bölmede kişi başı pay (yukarı yuvarlanır; son kişi kalanı öder). n: 2–50 */
export function splitShare(remainingInt: number, people: number): number | null {
  if (!Number.isInteger(people) || people < 2 || people > 50 || remainingInt <= 0) return null;
  return Math.ceil(remainingInt / people);
}
