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

// While only one trip exists, this is the canonical fallback for nav rendered
// outside a /trips/[slug]/* route (root, sign-in, etc.). Replace with a
// user-default-trip lookup once the trip picker ships.
const DEFAULT_TRIP_SLUG = 'pcup26';

function getTripSlugFromPath(pathname: string): string {
  if (pathname.startsWith('/trips/')) {
    const slug = pathname.split('/')[2];
    if (slug) return slug;
  }
  return DEFAULT_TRIP_SLUG;
}

export default function BottomNavClient({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const slug = getTripSlugFromPath(pathname);
  const tripBase = `/trips/${slug}`;

  const items: NavItem[] = [
    { href: `${tripBase}/schedule`, icon: Calendar, label: 'Schedule' },
    { href: `${tripBase}/scoreboard`, icon: Trophy, label: 'Cup' },
    { href: `${tripBase}/feed`, icon: Flame, label: 'Feed' },
    { href: `${tripBase}/me`, icon: User, label: 'Me' },
  ];

  return (
    <nav
      data-bottom-nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-yellow-600/20 bg-black/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {items.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
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
