// apps/web/src/components/ThemeToggle.tsx
// Gece/gündüz düğmesi — her ekranın başlığında. Seçim localStorage'a kaydedilir (lib/theme.ts).
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

export function ThemeToggle({ className = '', size = 16, large = false }: {
  className?: string;
  size?: number;
  /** Dokunmatik ekranlar (mutfak) için büyük düğme */
  large?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Gündüz moduna geç' : 'Gece moduna geç';
  return (
    <button type="button" onClick={toggleTheme} aria-label={label} title={label}
      className={`ui-chip ${large ? 'w-12 h-12 rounded-2xl' : 'w-10 h-10 rounded-full'} flex items-center justify-center spring-btn shrink-0 ${className}`}>
      {dark ? <Sun size={size} className="text-accent" /> : <Moon size={size} />}
    </button>
  );
}
