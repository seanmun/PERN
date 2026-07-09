import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, teams } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import WizardShell from '@/components/admin/EventWizard/WizardShell';
import TeamsStepClient from '@/components/admin/EventWizard/TeamsStepClient';

export default async function SetupTeamsPage({
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

  const tripTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, trip.id))
    .orderBy(asc(teams.name));

  const members = await db
    .select({
      id: tripMembers.id,
      nickname: tripMembers.nickname,
      avatarUrl: tripMembers.avatarUrl,
      tripHandicap: tripMembers.tripHandicap,
      teamId: tripMembers.teamId,
    })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, trip.id));

  return (
    <div className="pb-24">
      <WizardShell active="teams" tripSlug={slug} />
      <div className="mx-auto max-w-xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Teams.</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Rename and recolor the two teams, then split the roster.
        </p>

        <TeamsStepClient teams={tripTeams} members={members} />

        <div className="mt-8 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-900 pt-6">
          <a
            href={`/trips/${slug}/setup/players`}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
          >
            ← Players
          </a>
          <a
            href={`/trips/${slug}/setup/groups`}
            className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400"
          >
            Groups →
          </a>
        </div>
      </div>
    </div>
  );
}
