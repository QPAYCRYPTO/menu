// apps/web/src/components/OrderNoteTemplates.tsx
// Paylaşılabilir sipariş notu şablonları bileşeni.
// Hem garson hem müşteri tarafında kullanılır.
//
// KULLANIM:
//   <OrderNoteTemplates value={note} onChange={setNote} />
//
// Şablon tıklanınca metne "; " ile eklenir. Yıkıcı değil — biriktirir.
//
// variant: 'themed' → yeni tema (gece/gündüz, müşteri menüsü). 'legacy' (varsayılan) → eski koyu görünüm
// (garson ekranı yeni temaya taşınınca kaldırılacak).

import { useState } from 'react';
import { X } from 'lucide-react';

type Category = {
  id: string;
  emoji: string;
  label: string;
  color: string;
  bg: string;
  templates: string[];
};

// Türkiye kafe/restoran masa servisi için en sık kullanılan notlar
// 3 farklı AI'ın önerisi + gerçek deneyim sentezi
const CATEGORIES: Category[] = [
  {
    id: 'temp',
    emoji: '🔥',
    label: 'Sıcak/Soğuk',
    color: '#FCD34D',
    bg: 'rgba(245,158,11,0.18)',
    templates: [
      'Çok sıcak olsun',
      'Ilık olsun',
      'Buzlu',
      'Buzsuz',
      'Az buzlu',
      'Köpüklü olsun',
      'Açık çay',
      'Demli çay'
    ]
  },
  {
    id: 'cook',
    emoji: '🥩',
    label: 'Pişirme',
    color: '#FDBA74',
    bg: 'rgba(249,115,22,0.18)',
    templates: [
      'Az pişmiş',
      'Orta pişmiş',
      'İyi pişmiş',
      'Çıtır olsun',
      'Yumuşak olsun',
      'Sarı akışkan (yumurta)',
      'Sarı katı (yumurta)'
    ]
  },
  {
    id: 'remove',
    emoji: '🚫',
    label: 'İstemiyorum',
    color: '#FDA4AF',
    bg: 'rgba(244,63,94,0.18)',
    templates: [
      'Soğansız',
      'Sarımsaksız',
      'Acısız',
      'Tuzsuz',
      'Az tuzlu',
      'Yağsız',
      'Mayonezsiz',
      'Ketçapsız',
      'Turşusuz',
      'Sossuz',
      'Baharatsız'
    ]
  },
  {
    id: 'add',
    emoji: '➕',
    label: 'Ekstra',
    color: '#6EE7B7',
    bg: 'rgba(16,185,129,0.18)',
    templates: [
      'Ekstra acı',
      'Ekstra peynir',
      'Ekstra sos',
      'Bol limon',
      'Bol soğan',
      'Çift şeker',
      'Az şeker',
      'Yanında bal',
      'Yanında yoğurt'
    ]
  },
  {
    id: 'serve',
    emoji: '🍽️',
    label: 'Servis',
    color: '#93C5FD',
    bg: 'rgba(59,130,246,0.18)',
    templates: [
      'Sos ayrı gelsin',
      'Yanında ayrı tabakta',
      'Beraber gelsin',
      'Önce çorba/salata',
      'Çocuk için bölünsün',
      'Sıcak tabakta',
      'Ekmek kızarmış',
      'Tatlıyı sona bırak'
    ]
  },
  {
    id: 'health',
    emoji: '⚠️',
    label: 'Sağlık',
    color: '#FCA5A5',
    bg: 'rgba(239,68,68,0.18)',
    templates: [
      'Glutensiz',
      'Laktozsuz',
      'Vejetaryen',
      'Vegan',
      'Şekersiz',
      'Diyet (az yağlı)',
      'Fıstık alerjisi var',
      'Çocuk porsiyonu'
    ]
  }
];

type Props = {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  variant?: 'legacy' | 'themed';
};

export function OrderNoteTemplates({
  value,
  onChange,
  placeholder = 'Özel bir notunuz varsa yazın veya hızlı seçeneklerden ekleyin...',
  rows = 2,
  label = 'Sipariş Notu (opsiyonel)',
  variant = 'legacy'
}: Props) {
  const themed = variant === 'themed';
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  function appendTemplate(text: string) {
    const trimmed = value.trim();
    if (trimmed === '') {
      onChange(text);
    } else {
      // Aynı not zaten varsa ekleme
      const parts = trimmed.split(/[,;]\s*/).map(p => p.trim());
      if (parts.includes(text)) return;
      onChange(`${trimmed}, ${text}`);
    }
  }

  function clearNote() {
    onChange('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={`text-[11px] font-bold uppercase tracking-wider ${themed ? 'text-ink-muted' : 'text-white/70'}`}>
          {label}
        </label>
        {value.trim() && (
          <button onClick={clearNote}
            className="text-xs font-bold px-2 py-1 rounded-lg spring-btn flex items-center gap-1"
            style={{ color: themed ? 'var(--state-danger)' : 'var(--danger)' }}>
            <X size={12} /> Temizle
          </button>
        )}
      </div>

      {/* Kategori chip'leri — yatay scroll */}
      <div className="-mx-1 px-1 pb-1 mb-2 overflow-x-auto scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-1.5" style={{ minWidth: 'min-content' }}>
          {CATEGORIES.map(cat => themed ? (
            <button key={cat.id}
              onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
              aria-pressed={expandedCat === cat.id}
              className={`${expandedCat === cat.id ? 'ui-chip-active' : 'ui-chip'} min-h-[36px] px-3 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap spring-btn`}>
              {cat.emoji} {cat.label}
            </button>
          ) : (
            <button key={cat.id}
              onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
              className="glass-pill min-h-[36px] px-3 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap spring-btn"
              style={{
                background: expandedCat === cat.id ? cat.color + '55' : cat.bg,
                color: expandedCat === cat.id ? 'white' : cat.color,
                borderColor: expandedCat === cat.id ? cat.color : cat.color + '55',
                boxShadow: expandedCat === cat.id ? `0 6px 16px ${cat.color}40, inset 0 1px 1px rgba(255,255,255,0.6)` : undefined
              }}>
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Açılan kategorinin şablonları */}
      {expandedCat && (
        <div className={`mb-2 p-2 rounded-2xl fade-enter ${themed ? 'bg-surface-2 border border-line' : 'bg-black/25 border border-white/15'}`}>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.find(c => c.id === expandedCat)?.templates.map(tpl => (
              <button key={tpl}
                onClick={() => appendTemplate(tpl)}
                className={`${themed ? 'ui-chip' : 'glass-pill'} min-h-[32px] px-3 py-1 rounded-xl text-xs font-semibold spring-btn`}>
                + {tpl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Serbest metin alanı */}
      <textarea value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`${themed ? 'ui-input' : 'glass-input'} w-full px-3.5 py-2.5 rounded-2xl text-sm resize-none`} />
    </div>
  );
}