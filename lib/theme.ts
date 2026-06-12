'use client';

/**
 * Theme: dark / light / system (auto-follow OS).
 *
 * The chosen value is stored in localStorage under `theme`. An inline
 * script in <head> reads it BEFORE first paint so there's no flash of
 * the wrong theme when navigating between pages.
 *
 * The actual class application happens in two places:
 *   1. The inline script in app/layout.tsx — runs synchronously on every
 *      navigation, sets `.dark` on <html> if appropriate.
 *   2. setTheme() below — runs on toggle, updates localStorage and
 *      re-applies the class so the change is visible immediately.
 *
 * Tailwind's `dark:` variant matches `<html class="dark">` per the
 * @variant rule in globals.css.
 */

import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

export function getStoredTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = choice === 'dark' || (choice === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
}

export function setTheme(choice: ThemeChoice) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, choice);
  applyTheme(choice);
}

/**
 * Reactive hook for components that need to render based on the active
 * theme (e.g. the toggle button showing the right icon). Also reacts to
 * OS-level changes while the user is on `system` mode.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    function compute() {
      const prefers = mql.matches;
      const next: 'light' | 'dark' =
        stored === 'dark' || (stored === 'system' && prefers) ? 'dark' : 'light';
      setResolved(next);
    }
    compute();
    // React to OS-level theme changes only when the user is in `system` mode.
    function onChange() {
      if (getStoredTheme() === 'system') {
        applyTheme('system');
        compute();
      }
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  function change(next: ThemeChoice) {
    setThemeState(next);
    setTheme(next);
    // Update resolved immediately so the UI doesn't lag the icon.
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches;
    setResolved(
      next === 'dark' || (next === 'system' && prefersDark) ? 'dark' : 'light',
    );
  }

  return { theme, resolved, setTheme: change };
}
