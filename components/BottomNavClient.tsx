'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Trophy, User, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

export default function BottomNavClient({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: '/schedule', icon: Calendar, label: 'Schedule' },
    { href: '/scoreboard', icon: Trophy, label: 'Cup' },
    { href: '/me', icon: User, label: 'Me' },
    ...(isAdmin
      ? [{ href: '/admin', icon: Settings, label: 'Admin' } as NavItem]
      : []),
  ];

  return (
    <nav
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
      </div>
    </nav>
  );
}
