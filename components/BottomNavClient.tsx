'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Flame, Trophy, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import MoreMenu from './MoreMenu';

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

function getTripSlugFromPath(pathname: string): string | null {
  if (pathname.startsWith('/trips/')) {
    const slug = pathname.split('/')[2];
    if (slug && slug !== 'new') return slug;
  }
  return null;
}

export default function BottomNavClient({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const slug = getTripSlugFromPath(pathname);
  // Inside a trip, the four primary tabs point at the trip's pages and
  // "Me" goes to the player's trip-scoped profile. Outside a trip, those
  // tabs are disabled (greyed out) and "Me" goes to the global /me list.
  const tripBase = slug ? `/trips/${slug}` : null;
  const meHref = slug ? `/trips/${slug}/me` : '/me';

  const items: NavItem[] = tripBase
    ? [
        { href: `${tripBase}/schedule`, icon: Calendar, label: 'Schedule' },
        { href: `${tripBase}/scoreboard`, icon: Trophy, label: 'Cup' },
        { href: `${tripBase}/feed`, icon: Flame, label: 'Feed' },
        { href: meHref, icon: User, label: 'Me' },
      ]
    : [
        { href: '#', icon: Calendar, label: 'Schedule' },
        { href: '#', icon: Trophy, label: 'Cup' },
        { href: '#', icon: Flame, label: 'Feed' },
        { href: meHref, icon: User, label: 'Me' },
      ];
  const disabled = !tripBase;

  return (
    <nav
      data-bottom-nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-yellow-600/20 bg-black/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {items.map(({ href, icon: Icon, label }, i) => {
          const isMeTab = label === 'Me';
          // The Me tab always works (links to /me when outside a trip);
          // the other three are disabled when there's no trip context.
          const isDisabled = disabled && !isMeTab;
          const isActive =
            !isDisabled &&
            (pathname === href || pathname.startsWith(href + '/'));

          if (isDisabled) {
            return (
              <span
                key={`${label}-${i}`}
                aria-disabled="true"
                className="flex flex-1 cursor-not-allowed flex-col items-center gap-1 px-2 py-3 text-zinc-700"
                title="Open a trip from /me to use this"
              >
                <Icon size={20} strokeWidth={2} />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-widest">
                  {label}
                </span>
              </span>
            );
          }

          return (
            <Link
              key={`${label}-${i}`}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 px-2 py-3 transition-colors ${
                isActive
                  ? 'text-yellow-400'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Icon size={20} strokeWidth={2} />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest">
                {label}
              </span>
            </Link>
          );
        })}
        <MoreMenu isAdmin={isAdmin} />
      </div>
    </nav>
  );
}
