import Link from 'next/link';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams, tripMembers, trips } from '@/db/schema';
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

  const { user, tripMember, isPlatformAdmin } = ctx;
  const nickname = tripMember?.nickname ?? user.fullName ?? user.email;
  const initial = nickname.slice(0, 1).toUpperCase();
  const arcadePortraitUrl = user.arcadePortraitUrl ?? null;
  const avatarUrl = tripMember?.avatarUrl ?? user.avatarUrl ?? null;
  const teamColor = tripMember?.teamId
    ? await getTeamColor(tripMember.teamId)
    : null;

  // Every trip slug where this user is trip_admin — used by the client to
  // show the Admin shortcut next to the avatar when they're on one of those
  // trips. Platform admins see it on every trip.
  const adminMemberships = await db
    .select({ tripId: tripMembers.tripId })
    .from(tripMembers)
    .where(
      and(
        eq(tripMembers.userId, user.id),
        eq(tripMembers.role, 'trip_admin')
      )
    );
  let adminSlugs: string[] = [];
  if (adminMemberships.length) {
    const adminTrips = await db
      .select({ slug: trips.slug })
      .from(trips)
      .where(inArray(trips.id, adminMemberships.map((m) => m.tripId)));
    adminSlugs = adminTrips.map((t) => t.slug);
  }

  return (
    <HeaderAvatarLink
      initial={initial}
      arcadePortraitUrl={arcadePortraitUrl}
      avatarUrl={avatarUrl}
      teamColor={teamColor}
      adminSlugs={adminSlugs}
      isPlatformAdmin={isPlatformAdmin}
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
