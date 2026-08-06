import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import HeaderAvatarLink from './HeaderAvatarLink';

export default async function HeaderAvatar() {
  const ctx = await getGlobalAuthContext();

  if (!ctx) {
    return (
      <Link
        href="/sign-in"
        className="rounded-sm border border-yellow-600/40 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-400 hover:bg-yellow-600/10 hover:text-yellow-300"
      >
        Sign in
      </Link>
    );
  }

  const { user, tripMember } = ctx;
  const nickname = tripMember?.nickname ?? user.fullName ?? user.email;
  const initial = nickname.slice(0, 1).toUpperCase();
  const arcadePortraitUrl = user.arcadePortraitUrl ?? null;
  const avatarUrl = tripMember?.avatarUrl ?? user.avatarUrl ?? null;
  const teamColor = tripMember?.teamId
    ? await getTeamColor(tripMember.teamId)
    : null;

  // The two queries that resolved "which trips may this user administer"
  // went with the header's Admin button — the schedule page answers that
  // for the one trip in scope, which is the only trip it was ever asked
  // about. Two round trips saved on every page render.
  return (
    <HeaderAvatarLink
      initial={initial}
      arcadePortraitUrl={arcadePortraitUrl}
      avatarUrl={avatarUrl}
      teamColor={teamColor}
    />
  );
}

async function getTeamColor(teamId: string): Promise<string | null> {
  const [t] = await db
    .select({ color: teams.color })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return t?.color ?? null;
}
