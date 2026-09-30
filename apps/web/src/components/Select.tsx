// apps/web/src/components/Select.tsx
// Temaya uyan açılır seçim kutusu (tarayıcının beyaz yerel listesinin yerine)
//
// Kullanım:
//   <Select value={status} onChange={setStatus} ariaLabel="Durum"
//     options={[{ value: 'all', label: 'Tüm durumlar' }, ...]}
//     className="ui-input px-3 py-2 rounded-xl text-sm" />
//
// - className/style tetik düğmesine gider (mevcut ui-input ölçüleri korunur)
// - Liste body'ye portal ile açılır: modal/overflow içinde kesilmez, altta yer yoksa yukarı açılır
// - Klavye: ↑ ↓ Home End Enter Esc Tab, harfle atlama

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption<T extends string = string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  /** Değer listede yoksa gösterilecek metin */
  placeholder?: string;
  /** Oku gizle (satır içi, sade kullanım) */
  hideChevron?: boolean;
};

const MAX_PANEL_H = 280;

export function Select<T extends string>({
  value, onChange, options, className = '', style, ariaLabel, placeholder, hideChevron
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useRef(`sel-${Math.random().toString(36).slice(2, 9)}`).current;

  const selectedIndex = options.findIndex(o => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const want = Math.min(MAX_PANEL_H, options.length * 40 + 12);
    const width = Math.max(r.width, 160);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    if (below >= want || below >= above) {
      setPos({ left, width, top: r.bottom + 6, maxH: Math.min(MAX_PANEL_H, below - 6) });
    } else {
      setPos({ left, width, bottom: window.innerHeight - r.top + 6, maxH: Math.min(MAX_PANEL_H, above - 6) });
    }
  }, [options.length]);

  const openList = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    place();
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) triggerRef.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    close();
  };

  // Dışarı tıklama / kaydırma / yeniden boyutlandırma
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  // Etkin satırı görünür tut
  useLayoutEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive(a => Math.max(0, a - 1)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(options.length - 1); break;
      case 'Enter': case ' ': e.preventDefault(); choose(active); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': close(false); break;
      default:
        if (e.key.length === 1) {
          const ch = e.key.toLocaleLowerCase('tr');
          const n = options.length;
          for (let k = 1; k <= n; k++) {
            const i = (active + k) % n;
            if (options[i].label.toLocaleLowerCase('tr').startsWith(ch)) { setActive(i); break; }
          }
        }
    }
  };

  return (
    <>
      <button ref={triggerRef} type="button"
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={ariaLabel}
        className={`${className} inline-flex items-center justify-between gap-2 text-left cursor-pointer`}
        style={style}>
        <span className={`truncate ${selected ? '' : 'text-ink-muted'}`}>{selected?.label ?? placeholder ?? ''}</span>
        {!hideChevron && (
          <ChevronDown size={15} aria-hidden
            className={`shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} id={listId} role="listbox" aria-label={ariaLabel}
          className="ui-card fixed overflow-y-auto p-1.5 rounded-2xl text-sm"
          style={{
            left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH,
            zIndex: 10000, animation: 'selectIn 140ms ease-out'
          }}>
          {options.map((o, i) => {
            const isSel = o.value === value;
            return (
              <div key={o.value} data-idx={i} role="option" aria-selected={isSel}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer ${i === active ? 'bg-surface-2' : ''} ${isSel ? 'font-semibold' : ''}`}
                style={{ color: 'var(--ink)' }}>
                <span className="flex-1 truncate">{o.label}</span>
                {isSel && <Check size={15} aria-hidden style={{ color: 'var(--accent)' }} />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
