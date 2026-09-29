// apps/web/src/lib/theme.ts
// Gece/gündüz modu. İlk değer index.html'deki açılış betiğinde uygulanır (flash yok);
// burası çalışma anında değiştirmek ve dinlemek için. Anahtar ve öncelik kuralı açılış betiğiyle aynı:
// kaydedilmiş tercih (localStorage) > cihazın sistem ayarı.
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'atlasqr:theme';
const THEME_COLOR: Record<Theme, string> = { light: '#faf9f6', dark: '#0e1a20' };
const CHANGE_EVENT = 'atlasqr:theme-change';

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' || attr === 'light' ? attr : readStored() ?? systemTheme();
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  window.dispatchEvent(new CustomEvent<Theme>(CHANGE_EVENT, { detail: theme }));
}

/** Kullanıcı seçimi: uygular ve hatırlar */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // depolama kapalıysa yalnızca bu oturum için uygulanır
  }
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * Aktif tema + değiştirici. Aynı sayfadaki tüm düğmeler ve diğer sekmeler senkron kalır;
 * kullanıcı hiç seçim yapmadıysa cihazın sistem ayarı değişince tema da değişir.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void } {
  const [theme, setState] = useState<Theme>(() => getTheme());

  useEffect(() => {
    const onChange = (e: Event) => setState((e as CustomEvent<Theme>).detail);
    // Başka sekmede seçildi
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) applyTheme(e.newValue);
    };
    // Sistem ayarı değişti (yalnızca kullanıcı tercih kaydetmediyse)
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystem = () => {
      if (!readStored()) applyTheme(systemTheme());
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    media?.addEventListener?.('change', onSystem);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
      media?.removeEventListener?.('change', onSystem);
    };
  }, []);

  return {
    theme,
    setTheme: useCallback((t: Theme) => setTheme(t), []),
    toggleTheme: useCallback(() => { toggleTheme(); }, [])
  };
}
