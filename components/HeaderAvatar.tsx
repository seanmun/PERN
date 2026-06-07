import Link from 'next/link';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import HeaderAvatarLink from './HeaderAvatarLink';

export default async function HeaderAvatar() {
  const ctx = await getGlobalAuthContext();

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
  const nickname = tripMember?.nickname ?? user.fullName ?? user.email;
  const initial = nickname.slice(0, 1).toUpperCase();
  // Arcade portrait wins everywhere; only fall back to a real photo when
  // there isn't one yet. The team color (if the user is on a team) gives
  // the transparent portrait a backdrop instead of black.
  const arcadePortraitUrl = user.arcadePortraitUrl ?? null;
  const avatarUrl = tripMember?.avatarUrl ?? user.avatarUrl ?? null;
  const teamColor = tripMember?.teamId ? await getTeamColor(tripMember.teamId) : null;

  return (
    <HeaderAvatarLink
      initial={initial}
      arcadePortraitUrl={arcadePortraitUrl}
      avatarUrl={avatarUrl}
      teamColor={teamColor}
    />
  );
}

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams } from '@/db/schema';

async function getTeamColor(teamId: string): Promise<string | null> {
  const [t] = await db
    .select({ color: teams.color })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return t?.color ?? null;
}
