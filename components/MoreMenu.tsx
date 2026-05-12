'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Plane, Cog } from 'lucide-react';

export default function MoreMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const activeWhenOnMenuPath =
    pathname.startsWith('/admin') || pathname.startsWith('/flights');

  return (
    <div className="relative flex flex-1 items-stretch" ref={menuRef}>
      <button
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
        <Settings size={20} strokeWidth={2} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest">
          More
        </span>
      </button>

      {open && (
        <>
          {/* Backdrop to capture outside taps */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          />
          {/* Menu popover */}
          <div
            role="menu"
            className="fixed bottom-20 right-2 z-40 w-52 rounded-sm border border-zinc-800 bg-zinc-950 shadow-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <MenuLink
              href="/flights"
              icon={<Plane size={16} />}
              label="Flights"
              hint="Travel coordination"
            />
            {isAdmin && (
              <MenuLink
                href="/admin"
                icon={<Cog size={16} />}
                label="Admin"
                hint="Trip controls"
                divider
              />
            )}
          </div>
        </>
      )}
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
