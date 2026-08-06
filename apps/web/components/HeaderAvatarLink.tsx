'use client';

import Link from 'next/link';

/**
 * The header avatar, and nothing else.
 *
 * It used to carry an Admin shortcut that appeared on any trip route the
 * viewer could administer. That button now lives on the schedule page,
 * next to the thing it edits, so the header does not have to know which
 * trip you are looking at or what you may do to it.
 */
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
  const url = arcadePortraitUrl ?? avatarUrl;
  const ring = arcadePortraitUrl && teamColor ? teamColor : undefined;

  return (
    <div className="flex items-center gap-2">
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
