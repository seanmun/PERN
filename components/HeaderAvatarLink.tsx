'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * If we're already inside a trip URL, the Me link goes to the trip-scoped
 * profile page. Otherwise it goes to the global /me — the user's trips
 * list + profile edit. No more forcing the user into pcup26 by default.
 */
function getMeHref(pathname: string): string {
  if (pathname.startsWith('/trips/')) {
    const slug = pathname.split('/')[2];
    if (slug) return `/trips/${slug}/me`;
  }
  return '/me';
}

export default function HeaderAvatarLink({
  initial,
  arcadePortraitUrl,
  avatarUrl,
  teamColor,
}: {
  initial: string;
  arcadePortraitUrl: string | null;
  avatarUrl: string | null;
  teamColor: string | null;
}) {
  const pathname = usePathname();
  const meHref = getMeHref(pathname);

  const url = arcadePortraitUrl ?? avatarUrl;
  const ring = arcadePortraitUrl && teamColor ? teamColor : undefined;

  return (
    <Link
      href={meHref}
      aria-label="Your account"
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
        <div className="flex h-full w-full items-center justify-center bg-zinc-800 font-mono text-sm font-bold text-zinc-300">
          {initial}
        </div>
      )}
    </Link>
  );
}
