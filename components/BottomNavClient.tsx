'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Flame, Home, Trophy, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
};

function getTripSlugFromPath(pathname: string): string | null {
  if (pathname.startsWith('/trips/')) {
    const slug = pathname.split('/')[2];
    if (slug && slug !== 'new') return slug;
  }
  return null;
}

export default function BottomNavClient() {
  const pathname = usePathname();
  const slug = getTripSlugFromPath(pathname);
  const tripBase = slug ? `/trips/${slug}` : null;

  const items: NavItem[] = [
    { href: '/home', icon: Home, label: 'Home' },
    tripBase
      ? { href: `${tripBase}/schedule`, icon: Calendar, label: 'Schedule' }
      : { href: '#', icon: Calendar, label: 'Schedule', disabled: true },
    tripBase
      ? { href: `${tripBase}/scoreboard`, icon: Trophy, label: 'Cup' }
      : { href: '#', icon: Trophy, label: 'Cup', disabled: true },
    tripBase
      ? { href: `${tripBase}/feed`, icon: Flame, label: 'Feed' }
      : { href: '#', icon: Flame, label: 'Feed', disabled: true },
    { href: '/me', icon: User, label: 'Me' },
  ];

  return (
    <nav
      data-bottom-nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-yellow-600/20 bg-black/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {items.map(({ href, icon: Icon, label, disabled }, i) => {
          const isActive =
            !disabled &&
            (pathname === href || pathname.startsWith(href + '/'));

          if (disabled) {
            return (
              <span
                key={`${label}-${i}`}
                aria-disabled="true"
                className="flex flex-1 cursor-not-allowed flex-col items-center gap-1 px-2 py-3 text-zinc-700"
                title="Open a trip from Home to use this"
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
      </div>
    </nav>
  );
}
