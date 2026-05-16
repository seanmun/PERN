'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DEFAULT_TRIP_SLUG = 'pcup26';

function getTripSlugFromPath(pathname: string): string {
  if (pathname.startsWith('/trips/')) {
    const slug = pathname.split('/')[2];
    if (slug) return slug;
  }
  return DEFAULT_TRIP_SLUG;
}

export default function HeaderAvatarLink({
  initial,
  avatarUrl,
}: {
  initial: string;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const slug = getTripSlugFromPath(pathname);

  return (
    <Link
      href={`/trips/${slug}/me`}
      aria-label="Your account"
      className="flex h-10 w-10 items-center justify-center rounded-sm overflow-hidden ring-2 ring-zinc-700 hover:ring-yellow-500"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-800 font-mono text-sm font-bold text-zinc-300">
          {initial}
        </div>
      )}
    </Link>
  );
}
