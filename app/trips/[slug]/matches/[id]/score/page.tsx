import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import {
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import { computeStrokes, computeTeamMatch } from '@/lib/scoring/engine';
import ScoreEntryClient, {
  type ScoreClientPlayer,
  type ScoreClientHole,
  type ScoreClientScore,
  type ScoreClientTeam,
  type ScoreClientTeamScore,
} from '@/components/score-entry/ScoreEntryClient';

/**
 * Team-input formats need a roster the team-handicap formula understands.
 *
 *  - Scramble: 2 or 4 players per team (USGA formulas exist for both).
 *  - Alternate Shot: exactly 2 per team — one ball, two players alternating.
 *
 * Anything else blocks the score-entry UI so a bad lineup can't silently
 * produce wrong handicaps.
 */
function validTeamSetup(data: {
  match: { format: string };
  participants: { team: { id: string } }[];
}): boolean {
  const byTeam = new Map<string, number>();
  for (const p of data.participants) {
    byTeam.set(p.team.id, (byTeam.get(p.team.id) ?? 0) + 1);
  }
  if (byTeam.size !== 2) return false;
  const counts = Array.from(byTeam.values());
  if (data.match.format === 'alternate_shot') {
    return counts.every((n) => n === 2);
  }
  // scramble
  return counts.every((n) => n === 2 || n === 4);
}

export default async function ScoreEntryPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const data = await getMatchScoringData(id);
  if (!data) notFound();

  // Authorization: must be a participant OR admin
  const selfTripMemberId = ctx.tripMember?.id ?? null;
  const isAdmin =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, data.round.tripId);
  const selfIsParticipant = data.participants.some(
    (p) => p.participant.id === selfTripMemberId
  );
  if (!isAdmin && !selfIsParticipant) {
    redirect(`/trips/${slug}/matches/${id}`);
  }

  const strokesMap = computeStrokes(data.enginePlayers, data.engineHoles);

  const holes: ScoreClientHole[] = data.engineHoles.map((h) => ({
    number: h.number,
    par: h.par,
    yardage:
      data.courseHoles.find((c) => c.holeNumber === h.number)?.yardage ?? null,
    handicapIndex: h.handicapIndex,
  }));

  const players: ScoreClientPlayer[] = data.participants.map((p) => {
    const strokesByHole: Record<number, number> = {};
    const playerStrokes = strokesMap.get(p.participant.id);
    if (playerStrokes) {
      for (const [holeNum, n] of playerStrokes) strokesByHole[holeNum] = n;
    }
    return {
      tripMemberId: p.participant.id,
      nickname: p.participant.nickname,
      avatarUrl: p.participant.avatarUrl,
      teamId: p.team.id,
      teamColor: p.team.color,
      isSelf: p.participant.id === selfTripMemberId,
      strokesByHole,
    };
  });

  const initialScores: ScoreClientScore[] = data.scores.map((s) => ({
    tripMemberId: s.tripMemberId,
    holeNumber: s.holeNumber,
    gross: s.gross,
  }));

  // Team-input formats (scramble, alt shot): collapse the 4 participants into
  // 2 team rows. Team handicap + per-hole stroke allocation come from the
  // team engine; the UI just renders them.
  let teamsForClient: ScoreClientTeam[] = [];
  let initialTeamScores: ScoreClientTeamScore[] = [];
  if (
    data.inputMode === 'team' &&
    data.engineTeams &&
    data.engineTeams.length === 2
  ) {
    const teamComputed = computeTeamMatch({
      teams: [data.engineTeams[0], data.engineTeams[1]],
      holes: data.engineHoles,
      scores: data.engineTeamScores ?? [],
    });
    teamsForClient = data.engineTeams.map((et) => {
      const teammates = data.participants.filter(
        (p) => p.team.id === et.id,
      );
      const team = teammates[0]?.team;
      const memberLine = teammates
        .map((p) => p.participant.nickname)
        .join(' & ');
      const isSelfOnTeam = teammates.some(
        (p) => p.participant.id === selfTripMemberId,
      );
      const strokesByHole: Record<number, number> = {};
      const strokes = teamComputed.strokesByPlayer.get(et.id);
      if (strokes) {
        for (const [holeNum, n] of strokes) strokesByHole[holeNum] = n;
      }
      return {
        teamId: et.id,
        name: team?.name ?? 'Team',
        color: team?.color ?? null,
        memberLine,
        teamHandicap: et.handicap,
        isSelfOnTeam,
        strokesByHole,
      };
    });
    // Non-admins only see their own team's row — keeps players from
    // accidentally entering the opposing team's score. Admins still get
    // both rows so they can fix mistakes or score on someone's behalf.
    if (!isAdmin) {
      teamsForClient = teamsForClient.filter((t) => t.isSelfOnTeam);
    }
    initialTeamScores =
      data.engineTeamScores?.map((s) => ({
        teamId: s.teamId,
        holeNumber: s.holeNumber,
        gross: s.gross,
      })) ?? [];
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <Link
        href={`/trips/${slug}/matches/${id}`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Match
      </Link>

      <h1 className="mt-4 text-xl font-bold tracking-tight">
        {data.course.name}
      </h1>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Round {data.round.order} · {data.round.label ?? data.round.format}
        {data.tee && (
          <>
            <span className="mx-1.5 text-zinc-700">·</span>
            {data.tee.color && (
              <span
                aria-hidden
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: data.tee.color }}
              />
            )}
            {data.tee.name} tees
            {data.tee.totalYardage != null ? ` · ${data.tee.totalYardage} yds` : ''}
          </>
        )}
      </p>

      {holes.length === 0 ? (
        <div className="mt-8 rounded-sm border border-yellow-600/30 bg-yellow-500/5 p-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-400">
            Course needs hole data
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            {data.course.name} doesn&apos;t have par / yardage / stroke-index
            for its 18 holes yet, so scores can&apos;t be entered.
          </p>
          {isAdmin && (
            <Link
              href={`/trips/${slug}/admin/courses`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
            >
              Add hole data
            </Link>
          )}
        </div>
      ) : data.inputMode === 'team' && !validTeamSetup(data) ? (
        <div className="mt-8 rounded-sm border border-yellow-600/30 bg-yellow-500/5 p-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-400">
            Roster doesn&apos;t match this format
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            {data.match.format === 'scramble'
              ? 'Scramble needs 2 or 4 players per team (matching teams on both sides).'
              : 'Alternate shot needs exactly 2 players per team.'}{' '}
            Edit the matchup so each side has the right number of participants.
          </p>
          {isAdmin && (
            <Link
              href={`/trips/${slug}/matches/${id}/edit`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
            >
              Edit matchup
            </Link>
          )}
        </div>
      ) : (
        <ScoreEntryClient
          matchId={id}
          holes={holes}
          players={players}
          initialScores={initialScores}
          canEdit={isAdmin || selfIsParticipant}
          selfTripMemberId={selfTripMemberId}
          mode={data.inputMode}
          teams={teamsForClient}
          initialTeamScores={initialTeamScores}
        />
      )}
    </div>
  );
}
