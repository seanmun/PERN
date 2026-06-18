'use client';

import { useEffect } from 'react';

// Drop into any page that should be pinned to dark regardless of the user's
// preference (logged-out marketing / sign-in / about). Pins `.dark` on
// <html> while mounted, and a MutationObserver re-pins it if the header
// toggle (or anything else) tries to remove it. On unmount it restores the
// user's stored preference so logged-in routes pick up wherever they were.
export default function ForceDarkMode() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');

    const obs = new MutationObserver(() => {
      if (!root.classList.contains('dark')) root.classList.add('dark');
    });
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      obs.disconnect();
      try {
        const stored = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const shouldBeDark =
          stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
        if (shouldBeDark) root.classList.add('dark');
        else root.classList.remove('dark');
      } catch {
        // localStorage blocked — leave dark on.
      }
    };
  }, []);

  return null;
}
