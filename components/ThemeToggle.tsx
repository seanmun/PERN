'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';

/**
 * Theme switcher in the header. Three-state cycle: System → Light → Dark →
 * System. Icon reflects the resolved theme (not the choice) so the user
 * sees what they're currently looking at and the title tells them what the
 * stored choice is + what tapping does next.
 */
export default function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();

  const next: { [k: string]: 'light' | 'dark' | 'system' } = {
    system: 'light',
    light: 'dark',
    dark: 'system',
  };

  const Icon =
    theme === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  const title = `Theme: ${theme}. Tap to switch to ${next[theme]}.`;

  return (
    <button
      type="button"
      onClick={() => setTheme(next[theme])}
      aria-label={title}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}
