// apps/web/src/components/OrderNoteTemplates.tsx
// Paylaşılabilir sipariş notu şablonları bileşeni.
// Hem garson hem müşteri tarafında kullanılır.
//
// KULLANIM:
//   <OrderNoteTemplates value={note} onChange={setNote} />
//
// Şablon tıklanınca metne "; " ile eklenir. Yıkıcı değil — biriktirir.

import { useState } from 'react';

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
    color: '#B45309',
    bg: '#FEF3C7',
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
    color: '#9A3412',
    bg: '#FFEDD5',
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
    color: '#991B1B',
    bg: '#FEE2E2',
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
    color: '#15803D',
    bg: '#DCFCE7',
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
    color: '#1E40AF',
    bg: '#DBEAFE',
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
    color: '#7C2D12',
    bg: '#FEF2F2',
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
};

export function OrderNoteTemplates({
  value,
  onChange,
  placeholder = 'Özel bir notunuz varsa yazın veya hızlı seçeneklerden ekleyin...',
  rows = 2,
  label = 'Sipariş Notu (opsiyonel)'
}: Props) {
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
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
          {label}
        </label>
        {value.trim() && (
          <button onClick={clearNote}
            className="text-xs"
            style={{ color: '#DC2626' }}>
            ✕ Temizle
          </button>
        )}
      </div>

      {/* Kategori chip'leri — yatay scroll */}
      <div className="-mx-1 px-1 mb-2 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-1.5" style={{ minWidth: 'min-content' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id}
              onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap"
              style={{
                background: expandedCat === cat.id ? cat.color : cat.bg,
                color: expandedCat === cat.id ? 'white' : cat.color,
                border: '1px solid ' + (expandedCat === cat.id ? cat.color : 'transparent')
              }}>
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Açılan kategorinin şablonları */}
      {expandedCat && (
        <div className="mb-2 p-2 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.find(c => c.id === expandedCat)?.templates.map(tpl => (
              <button key={tpl}
                onClick={() => appendTemplate(tpl)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-95 transition-transform"
                style={{
                  background: 'white',
                  color: '#0F172A',
                  border: '1px solid #CBD5E1'
                }}>
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
        className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
        style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC' }} />
    </div>
  );
}