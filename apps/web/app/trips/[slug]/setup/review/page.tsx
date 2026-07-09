import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { rounds, teeTimes, matches, tripMembers, teams } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import WizardShell from '@/components/admin/EventWizard/WizardShell';
import ReviewStepClient from '@/components/admin/EventWizard/ReviewStepClient';

export default async function SetupReviewPage({
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

  const [tripTeams, members, tripRounds] = await Promise.all([
    db.select().from(teams).where(eq(teams.tripId, trip.id)),
    db
      .select({ id: tripMembers.id, nickname: tripMembers.nickname, email: tripMembers.email, teamId: tripMembers.teamId })
      .from(tripMembers)
      .where(eq(tripMembers.tripId, trip.id)),
    db.select({ id: rounds.id }).from(rounds).where(eq(rounds.tripId, trip.id)),
  ]);

  // Simple counts — small trips, fine to do this as separate small
  // queries rather than one big join.
  let totalGroups = 0;
  let totalMatches = 0;
  for (const r of tripRounds) {
    const tts = await db.select({ id: teeTimes.id }).from(teeTimes).where(eq(teeTimes.roundId, r.id));
    totalGroups += tts.length;
    const ms = await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, r.id));
    totalMatches += ms.length;
  }

  const membersWithEmail = members.filter((m) => m.email);

  return (
    <div className="pb-24">
      <WizardShell active="review" tripSlug={slug} />
      <div className="mx-auto max-w-xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Review &amp; send.</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Everything below is already saved. Sending invites is the last step.
        </p>

        <div className="mt-6 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/60">
          <div className="bg-gradient-to-br from-green-900 to-black px-5 py-5 text-white">
            <h2 className="text-xl font-bold tracking-tight">{trip.name}</h2>
            {(trip.startDate || trip.endDate) && (
              <p className="mt-1 text-[13px] text-green-200">
                {trip.startDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {trip.endDate && trip.endDate.getTime() !== trip.startDate?.getTime()
                  ? ` – ${trip.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : ''}
              </p>
            )}
          </div>
          <ReviewRow label="Players">{members.length} added</ReviewRow>
          <ReviewRow label="Teams">
            {tripTeams.map((t) => `${t.name} (${members.filter((m) => m.teamId === t.id).length})`).join(' vs ')}
          </ReviewRow>
          <ReviewRow label="Rounds">{tripRounds.length}</ReviewRow>
          <ReviewRow label="Groups">{totalGroups}</ReviewRow>
          <ReviewRow label="Matches">{totalMatches}</ReviewRow>
        </div>

        <ReviewStepClient
          tripSlug={slug}
          membersWithEmail={membersWithEmail.map((m) => ({ id: m.id, nickname: m.nickname }))}
        />

        <div className="mt-8 border-t border-zinc-200 dark:border-zinc-900 pt-6">
          <a
            href={`/trips/${slug}/setup/matches`}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
          >
            ← Matches
          </a>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex border-b border-zinc-200 dark:border-zinc-900 px-5 py-3 text-[13px] last:border-b-0">
      <span className="w-24 flex-none font-semibold text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}
