// apps/web/src/lib/businessTheme.ts
// İşletme rengi (theme_color) — yalnızca müşteri menüsünde butonlar ve vurgular.
// Her tema için ayrı ayarlanır ki yazılar her zaman okunur kalsın:
//   - Buton dolgusu zemine karşı görünür olsun (gece: koyu renk biraz açılır, gündüz: çok açık renk koyulaşır)
//   - Buton yazısı dolguya göre beyaz ya da koyu petrol seçilir
//   - Vurgu (ikon/alt başlık) yazı gibi kullanıldığı için daha yüksek kontrasta zorlanır
// index.css bu değişkenleri --biz / --on-biz / --accent olarak temaya göre seçer; ayarlanmamışsa sistem renkleri.
import { useEffect } from 'react';
import { ensureContrast, isHexColor, normalizeHex, readableTextOn } from './color';

const LIGHT_BG = '#faf9f6';
const DARK_BG = '#0e1a20';

const VARS = ['--biz-light', '--on-biz-light', '--biz-dark', '--on-biz-dark', '--biz-accent-light', '--biz-accent-dark'] as const;

export function businessThemeVars(color: string): Record<(typeof VARS)[number], string> {
  const hex = normalizeHex(color);
  const bizLight = ensureContrast(hex, LIGHT_BG, 1.6);
  const bizDark = ensureContrast(hex, DARK_BG, 2.2);
  return {
    '--biz-light': bizLight,
    '--on-biz-light': readableTextOn(bizLight),
    '--biz-dark': bizDark,
    '--on-biz-dark': readableTextOn(bizDark),
    '--biz-accent-light': ensureContrast(hex, LIGHT_BG, 3),
    '--biz-accent-dark': ensureContrast(hex, DARK_BG, 3.5)
  };
}

/** Sayfa açıkken işletme rengini uygular; sayfadan çıkınca sistem renkleri (petrol/altın) geri gelir */
export function useBusinessTheme(color: string | null | undefined): void {
  const valid = color && isHexColor(color) ? normalizeHex(color) : null;
  useEffect(() => {
    if (!valid) return;
    const root = document.documentElement;
    const vars = businessThemeVars(valid);
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
    return () => {
      for (const key of VARS) root.style.removeProperty(key);
    };
  }, [valid]);
}
