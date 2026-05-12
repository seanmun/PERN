import Link from 'next/link';
import { getAuthContext } from '@/lib/auth/current-user';

export default async function HeaderAvatar() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <Link
        href="/sign-in"
        className="rounded-sm border border-yellow-600/40 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-yellow-400 hover:bg-yellow-600/10 hover:text-yellow-300"
      >
        Sign in
      </Link>
    );
  }

  const { user, tripMember } = ctx;
  const initial = (tripMember?.nickname ?? user.email).slice(0, 1).toUpperCase();
  const ringColor = '#3f3f46';

  return (
    <Link
      href="/me"
      aria-label="Your account"
      className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden ring-2 ring-zinc-700 hover:ring-yellow-500"
      style={{ borderColor: ringColor }}
    >
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
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
