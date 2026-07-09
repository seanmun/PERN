import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, teams } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { getBuddies } from '@/lib/data/buddies';
import WizardShell from '@/components/admin/EventWizard/WizardShell';
import PlayersStepClient from '@/components/admin/EventWizard/PlayersStepClient';

export default async function SetupPlayersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');
  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, trip.id)) {
    redirect(`/trips/${slug}/admin/players`);
  }

  const members = await db
    .select({ member: tripMembers, team: teams })
    .from(tripMembers)
    .leftJoin(teams, eq(tripMembers.teamId, teams.id))
    .where(eq(tripMembers.tripId, trip.id));

  const memberUserIds = members
    .map((m) => m.member.userId)
    .filter((id): id is string => !!id);
  const buddies = await getBuddies(ctx.user.id, memberUserIds);

  return (
    <div className="pb-24">
      <WizardShell active="players" tripSlug={slug} />
      <div className="mx-auto max-w-xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Players.</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Search players who&apos;ve signed up on BuddyCup, or add someone brand new.
        </p>

        <PlayersStepClient
          tripId={trip.id}
          tripSlug={slug}
          initialMembers={members.map((m) => ({
            id: m.member.id,
            userId: m.member.userId,
            nickname: m.member.nickname,
            email: m.member.email,
            avatarUrl: m.member.avatarUrl,
            tripHandicap: m.member.tripHandicap,
            teamName: m.team?.name ?? null,
            teamColor: m.team?.color ?? null,
          }))}
          initialBuddies={buddies}
        />

        <div className="mt-8 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-900 pt-6">
          <a
            href={`/trips/${slug}/setup/details`}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
          >
            ← Details
          </a>
          <a
            href={`/trips/${slug}/setup/teams`}
            className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400"
          >
            Teams →
          </a>
        </div>
      </div>
    </div>
  );
}
