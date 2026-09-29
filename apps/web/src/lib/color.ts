// apps/web/src/lib/color.ts

/** #RRGGBB → rgba(r, g, b, alpha) */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** #RGB / #RRGGBB mı? */
export function isHexColor(value: string | null | undefined): boolean {
  return !!value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** #RGB → #RRGGBB (küçük harf) */
export function normalizeHex(hex: string): string {
  const h = hex.trim().toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG göreli parlaklık */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG kontrast oranı (1–21) */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(hex: string, target: string, amount: number): string {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]);
}

/**
 * Rengi zemine karşı en az `minContrast` olacak şekilde (gerekirse) açar/koyulaştırır.
 * Renk tonu korunur; yalnızca beyaza/koyuya doğru adım adım karıştırılır.
 */
export function ensureContrast(hex: string, background: string, minContrast: number): string {
  const base = normalizeHex(hex);
  if (contrastRatio(base, background) >= minContrast) return base;
  const target = luminance(background) > 0.5 ? '#000000' : '#ffffff';
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(base, target, step * 0.05);
    if (contrastRatio(candidate, background) >= minContrast) return candidate;
  }
  return mix(base, target, 1);
}

/** Dolgu rengi üzerinde okunur yazı rengi (beyaz veya koyu petrol) */
export function readableTextOn(fill: string): string {
  return contrastRatio(fill, '#ffffff') >= contrastRatio(fill, '#073f46') ? '#ffffff' : '#073f46';
}
