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
import { getMatchScoringData } from '@/lib/data/match-scoring';
import { resolveMatchHandicaps } from '@/lib/scoring/handicap-method';

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

  // Strokes each player receives across the 18 holes, per the match's
  // handicap_method — same resolver every live compute uses.
  const scoringData = await getMatchScoringData(id);
  const strokesByPlayer = new Map<string, number>();
  if (scoringData) {
    const { enginePlayers, scratchHandicap } =
      await resolveMatchHandicaps(scoringData);
    const baseline =
      scratchHandicap ??
      Math.min(...enginePlayers.map((p) => p.handicap), Number.POSITIVE_INFINITY);
    for (const p of enginePlayers) {
      const strokes = Number.isFinite(baseline)
        ? Math.max(0, Math.round(p.handicap - baseline))
        : 0;
      strokesByPlayer.set(p.id, strokes);
    }
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
          segmentsEnabled={row.match.pointsFront9 > 0 || row.match.pointsBack9 > 0}
          pointsOverall={row.match.pointsOverall}
          pointsFront9={row.match.pointsFront9}
          pointsBack9={row.match.pointsBack9}
        />
      )}
    </div>
  );
}
