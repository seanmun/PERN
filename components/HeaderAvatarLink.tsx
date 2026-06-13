'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cog } from 'lucide-react';

function getTripSlugFromPath(pathname: string): string | null {
  if (pathname.startsWith('/trips/')) {
    const slug = pathname.split('/')[2];
    if (slug && slug !== 'new') return slug;
  }
  return null;
}

export default function HeaderAvatarLink({
  initial,
  arcadePortraitUrl,
  avatarUrl,
  teamColor,
  adminSlugs,
  isPlatformAdmin,
}: {
  initial: string;
  arcadePortraitUrl: string | null;
  avatarUrl: string | null;
  teamColor: string | null;
  adminSlugs: string[];
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const tripSlug = getTripSlugFromPath(pathname);

  const canAdminThisTrip =
    !!tripSlug && (isPlatformAdmin || adminSlugs.includes(tripSlug));

  const url = arcadePortraitUrl ?? avatarUrl;
  const ring = arcadePortraitUrl && teamColor ? teamColor : undefined;

  return (
    <div className="flex items-center gap-2">
      {canAdminThisTrip && tripSlug && (
        <Link
          href={`/trips/${tripSlug}/admin`}
          aria-label="Trip admin"
          className="flex h-9 items-center gap-1.5 rounded-sm border border-yellow-600/40 bg-yellow-600/10 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-yellow-800 dark:text-yellow-400 hover:bg-yellow-600/20"
        >
          <Cog size={12} strokeWidth={2.5} />
          Admin
        </Link>
      )}

      <Link
        href="/me"
        aria-label="Your profile"
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm hover:opacity-90"
        style={{
          background:
            arcadePortraitUrl && teamColor
              ? `linear-gradient(180deg, ${teamColor} 0%, ${teamColor}cc 70%, ${teamColor}66 100%)`
              : undefined,
          boxShadow: ring ? `0 0 0 2px ${ring}` : '0 0 0 2px #3f3f46',
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className={`h-full w-full ${arcadePortraitUrl ? 'object-contain' : 'object-cover'}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-800 font-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">
            {initial}
          </div>
        )}
      </Link>
    </div>
  );
}
