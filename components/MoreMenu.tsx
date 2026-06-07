'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Cog } from 'lucide-react';

function getTripSlugFromPath(pathname: string): string | null {
  if (pathname.startsWith('/trips/')) {
    const slug = pathname.split('/')[2];
    if (slug && slug !== 'new') return slug;
  }
  return null;
}

export default function MoreMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const slug = getTripSlugFromPath(pathname);
  const tripBase = slug ? `/trips/${slug}` : null;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('touchstart', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('touchstart', onClick);
    };
  }, [open]);

  const showAdmin = Boolean(tripBase && isAdmin);
  const hasItems = showAdmin;
  const activeWhenOnMenuPath = pathname.includes('/admin');

  if (!hasItems) {
    return (
      <span
        aria-disabled="true"
        className="flex flex-1 cursor-not-allowed flex-col items-center gap-1 px-2 py-3 text-zinc-700"
        title="Open a trip to use this"
      >
        <Menu size={20} strokeWidth={2} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest">
          More
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-1 items-stretch">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex flex-1 flex-col items-center gap-1 px-2 py-3 transition-colors ${
          open || activeWhenOnMenuPath
            ? 'text-yellow-400'
            : 'text-zinc-500 hover:text-zinc-200'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
      >
        <Menu size={20} strokeWidth={2} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest">
          More
        </span>
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={popoverRef}
              role="menu"
              className="fixed right-2 z-[60] w-52 overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950 shadow-2xl"
              style={{ bottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}
            >
              {showAdmin && tripBase && (
                <MenuLink
                  href={`${tripBase}/admin`}
                  icon={<Cog size={16} />}
                  label="Admin"
                  hint="Trip controls"
                />
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  hint,
  divider,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  divider?: boolean;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      className={`flex items-center gap-3 px-4 py-3 text-zinc-100 hover:bg-zinc-900 ${
        divider ? 'border-t border-zinc-800' : ''
      }`}
    >
      <span className="text-yellow-500">{icon}</span>
      <span className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
      </span>
    </Link>
  );
}
