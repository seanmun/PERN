import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  rounds,
  matchParticipants,
  tripMembers,
  teams,
  holeScores,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import {
  isPlatformAdmin,
  isTripAdminOf,
  isAnyCaptainOnTrip,
} from '@/lib/auth/permissions';
import QuickResultForm from '@/components/QuickResultForm';
import { getScratchHandicap } from '@/lib/scoring/recompute';

export default async function QuickResultPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const [row] = await db
    .select({ match: matches, round: rounds })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, id))
    .limit(1);
  if (!row || row.round.tripId !== trip.id) notFound();

  const allowed =
    isPlatformAdmin(ctx) ||
    isTripAdminOf(ctx, trip.id) ||
    isAnyCaptainOnTrip(ctx, trip.id);
  if (!allowed) redirect(`/trips/${slug}/matches/${id}`);

  // Block quick-entry if real per-hole data exists. We distinguish real
  // entries from previous quick-entries via the result_text tag.
  const existing = await db
    .select({ id: holeScores.id })
    .from(holeScores)
    .where(eq(holeScores.matchId, id))
    .limit(1);
  const isPriorQuick =
    !!row.match.resultText && row.match.resultText.endsWith('(quick entry)');
  const hasRealScores = existing.length > 0 && !isPriorQuick;

  // Pull participants + teams to render the side-grouped form.
  const partRows = await db
    .select({
      participantId: tripMembers.id,
      nickname: tripMembers.nickname,
      tripHandicap: tripMembers.tripHandicap,
      teamId: teams.id,
      teamName: teams.name,
      teamColor: teams.color,
    })
    .from(matchParticipants)
    .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
    .innerJoin(teams, eq(matchParticipants.teamId, teams.id))
    .where(eq(matchParticipants.matchId, id));

  const distinctTeams = Array.from(
    new Map(partRows.map((r) => [r.teamId, { id: r.teamId, name: r.teamName, color: r.teamColor }])).values(),
  ).sort((a, b) => (a.id < b.id ? -1 : 1));
  const sideByTeam = new Map<string, 'A' | 'B'>();
  if (distinctTeams[0]) sideByTeam.set(distinctTeams[0].id, 'A');
  if (distinctTeams[1]) sideByTeam.set(distinctTeams[1].id, 'B');

  // Strokes each player receives across the 18 holes = max(0, hcp - scratch).
  // Same formula the live engine uses (foursome scratch baseline).
  const scratch = await getScratchHandicap(
    id,
    row.match.teeTimeId,
    row.round.id,
  );
  const minH = scratch ?? Math.min(
    ...partRows
      .map((r) => (r.tripHandicap ? Number(r.tripHandicap) : Number.POSITIVE_INFINITY))
      .filter((n) => Number.isFinite(n)),
  );
  const strokesByPlayer = new Map<string, number>();
  for (const r of partRows) {
    const hcp = r.tripHandicap ? Number(r.tripHandicap) : null;
    const strokes = hcp != null && Number.isFinite(minH)
      ? Math.max(0, Math.round(hcp - minH))
      : 0;
    strokesByPlayer.set(r.participantId, strokes);
  }

  const participants = partRows.map((r) => ({
    tripMemberId: r.participantId,
    nickname: r.nickname,
    tripHandicap: r.tripHandicap,
    teamName: r.teamName,
    teamColor: r.teamColor,
    side: (sideByTeam.get(r.teamId) ?? 'A') as 'A' | 'B',
    strokesGiven: strokesByPlayer.get(r.participantId) ?? 0,
  }));

  const sideALabel = distinctTeams[0]?.name ?? 'Side A';
  const sideBLabel = distinctTeams[1]?.name ?? 'Side B';

  return (
    <div className="mx-auto max-w-xl px-4 pt-6 pb-24">
      <Link
        href={`/trips/${slug}/matches/${id}`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Match
      </Link>

      <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
        Quick result
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        Enter totals + winner
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Paper scorecard came in. Enter each player&apos;s 18-hole total gross,
        pick the winning side, save. Skips the hole-by-hole scorecard entirely.
      </p>

      {hasRealScores ? (
        <div className="mt-6 rounded-sm border border-yellow-600/40 bg-yellow-500/5 p-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-400">
            Hole-by-hole data exists
          </p>
          <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            This match already has hole-by-hole scores entered. Quick entry
            would stomp on them, so it&apos;s blocked. Use the foursome
            scorecard to fix individual holes instead.
          </p>
        </div>
      ) : (
        <QuickResultForm
          matchId={id}
          participants={participants}
          sideALabel={sideALabel}
          sideBLabel={sideBLabel}
          cancelHref={`/trips/${slug}/matches/${id}`}
        />
      )}
    </div>
  );
}
