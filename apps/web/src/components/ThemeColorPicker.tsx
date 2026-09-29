// apps/web/src/components/ThemeColorPicker.tsx
// İşletme tema rengi seçici: 12 hazır renk + serbest hex girişi + sistem renk seçici.
// Seçilen renk yalnızca müşteri menüsünde butonlara ve vurgulara uygulanır; her temada okunurluk
// lib/businessTheme.ts tarafından ayarlanır. Önizleme gündüz ve gece için gerçek sonucu gösterir.
// Not: Admin paneli yeni temaya taşınana kadar eski koyu görünüm sınıflarıyla (glass-*) çizilir.
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { businessThemeVars } from '../lib/businessTheme';
import { isHexColor, normalizeHex } from '../lib/color';

export const THEME_COLOR_PRESETS: { hex: string; name: string }[] = [
  { hex: '#073f46', name: 'Petrol' },
  { hex: '#ae9168', name: 'Altın' },
  { hex: '#c2410c', name: 'Kiremit' },
  { hex: '#9f1239', name: 'Bordo' },
  { hex: '#be185d', name: 'Gül' },
  { hex: '#6d28d9', name: 'Mor' },
  { hex: '#3730a3', name: 'Lacivert' },
  { hex: '#0369a1', name: 'Deniz' },
  { hex: '#0f766e', name: 'Çam' },
  { hex: '#15803d', name: 'Yeşil' },
  { hex: '#a16207', name: 'Hardal' },
  { hex: '#44403c', name: 'Antrasit' }
];

type Props = {
  value: string;
  onChange: (hex: string) => void;
};

export function ThemeColorPicker({ value, onChange }: Props) {
  const current = isHexColor(value) ? normalizeHex(value) : '';
  const [text, setText] = useState(current);

  // Dışarıdan (hazır renk / sistem seçici / kayıt sonrası) değişince kutuyu eşitle
  useEffect(() => { setText(current); }, [current]);

  const textValid = isHexColor(text);
  const preview = current ? businessThemeVars(current) : null;

  function commitText(raw: string) {
    let v = raw.trim();
    if (v && !v.startsWith('#')) v = `#${v}`;
    setText(v);
    if (isHexColor(v)) onChange(normalizeHex(v));
  }

  return (
    <div>
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2" role="radiogroup" aria-label="Hazır tema renkleri">
        {THEME_COLOR_PRESETS.map(p => {
          const selected = current === p.hex;
          return (
            <button key={p.hex} type="button" role="radio" aria-checked={selected}
              onClick={() => onChange(p.hex)} title={`${p.name} ${p.hex}`} aria-label={p.name}
              className="aspect-square rounded-xl flex items-center justify-center spring-btn"
              style={{
                background: p.hex,
                border: selected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)',
                boxShadow: selected ? `0 0 0 2px ${p.hex}` : undefined
              }}>
              {selected && <Check size={16} color="#fff" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <label className="glass-input flex items-center gap-2 px-3 py-2 rounded-2xl flex-1">
          <input type="color" value={current || '#073f46'} onChange={e => onChange(normalizeHex(e.target.value))}
            aria-label="Özel renk seç" className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
          <input value={text} onChange={e => commitText(e.target.value)} maxLength={7}
            aria-label="Hex renk kodu" placeholder="#073f46" spellCheck={false}
            className="bg-transparent outline-none text-sm font-mono text-white w-full" />
        </label>
      </div>
      {!textValid && text.length > 0 && (
        <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Geçerli bir hex kodu girin (örn. #c2410c).</p>
      )}

      {preview && (
        <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Müşteri menüsü önizleme">
          {([
            ['Gündüz', '#faf9f6', '#073f46', preview['--biz-light'], preview['--on-biz-light'], preview['--biz-accent-light']],
            ['Gece', '#0e1a20', '#efebe3', preview['--biz-dark'], preview['--on-biz-dark'], preview['--biz-accent-dark']]
          ] as const).map(([label, bg, ink, fill, onFill, accent]) => (
            <div key={label} className="rounded-2xl p-3 border border-white/15" style={{ background: bg, color: ink }}>
              <div className="text-[10px] font-semibold tracking-[0.25em] uppercase" style={{ color: accent }}>{label}</div>
              <div className="font-serif font-bold text-sm mt-1">Serpme Kahvaltı</div>
              <div className="mt-2 inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: fill, color: onFill }}>
                Sepete Ekle
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
