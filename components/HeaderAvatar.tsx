import Link from 'next/link';
import { getAuthContext } from '@/lib/auth/current-user';
import HeaderAvatarLink from './HeaderAvatarLink';

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
  const avatarUrl = tripMember?.avatarUrl ?? null;

  return <HeaderAvatarLink initial={initial} avatarUrl={avatarUrl} />;
}
