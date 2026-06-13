'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme';

// Logged-out / marketing routes are pinned dark by ForceDarkMode; the
// toggle would just fight the pin, so hide it on those routes.
const HIDE_ON = ['/', '/about', '/sign-in', '/sign-up'];

/**
 * Theme switcher in the header. Three-state cycle: System → Light → Dark →
 * System. Icon reflects the resolved theme (not the choice) so the user
 * sees what they're currently looking at and the title tells them what the
 * stored choice is + what tapping does next.
 */
export default function ThemeToggle() {
  const pathname = usePathname();
  const { theme, resolved, setTheme } = useTheme();

  if (
    HIDE_ON.includes(pathname) ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')
  ) {
    return null;
  }

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
