import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { getTeeTimeScoringData } from '@/lib/data/tee-time-scoring';
import { getThirtyBallEntryStates } from '@/lib/data/thirty-ball';
import { computeStrokes, computeTeamMatch } from '@buddycup/scoring/engine';
import { toCourseHandicap } from '@buddycup/scoring/handicap';
import { teeRatingOf, resolveMatchHandicaps } from '@/lib/scoring/handicap-method';
import ScoreEntryClient, {
  type ScoreClientPlayer,
  type ScoreClientHole,
  type ScoreClientScore,
  type ScoreClientTeam,
  type ScoreClientTeamScore,
} from '@/components/score-entry/ScoreEntryClient';

/**
 * Foursome-keyed score entry. The canonical score-entry surface as of
 * step 4 of docs/match-template-spec.md — handles both individual-input
 * formats (singles, best ball, two-man aggregate, stroke) and
 * team-input formats (scramble, alternate shot).
 *
 * Still a thin proxy over the legacy match-scoring loader: resolves
 * teeTimeId → widest match in the tee time, then renders that match's
 * scorecard. Step 5+ swap the loader for a real foursome-roster
 * resolver so cross-foursome matches and same-tee-time stacked
 * matches work without the widest-match heuristic.
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
  // scramble — USGA formulas exist for 2 or 4 per side.
  return counts.every((n) => n === 2 || n === 4);
}

export default async function TeeTimeScoreEntryPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id: teeTimeId } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const data = await getTeeTimeScoringData(teeTimeId);
  if (!data) notFound();

  const selfTripMemberId = ctx.tripMember?.id ?? null;
  const isAdmin =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, data.round.tripId);
  // Authorization now keys off the foursome's explicit roster, not the
  // primary match's participants. A player physically in this foursome
  // can score even if they're not in the match the primary data came
  // from (common: they're only in a round-wide cross-foursome match).
  const selfIsInRoster = data.rosterPlayers.some(
    (p) => p.member.id === selfTripMemberId,
  );
  if (!isAdmin && !selfIsInRoster) {
    redirect(`/trips/${slug}/schedule`);
  }

  // Build engine players from the FULL foursome roster so stroke
  // allocation includes everyone on the scorecard, not just the
  // primary match's participants. The stroke dots follow the PRIMARY
  // match's handicap_method (a physical card can't render two
  // allocations at once; stacked side matches with a different method
  // still resolve their own strokes on their match pages):
  //   course    → convert each roster handicap via the tee, scratch 0
  //   match_low → scratch = lowest handicap among the match's players
  //   group_low → engine default over the roster = foursome's lowest
  const method = data.match.handicapMethod;
  const tee = teeRatingOf(data);
  const engineRoster = data.rosterPlayers.map((p) => {
    const raw = p.member.tripHandicap ? Number(p.member.tripHandicap) : 18;
    return {
      id: p.member.id,
      handicap: method === 'course' ? toCourseHandicap(raw, tee) : raw,
      teamSide: p.side,
    };
  });
  const scratchOverride =
    method === 'course'
      ? 0
      : method === 'match_low'
        ? data.enginePlayers.length
          ? Math.min(...data.enginePlayers.map((p) => p.handicap))
          : undefined
        : undefined;
  const strokesMap = computeStrokes(engineRoster, data.engineHoles, scratchOverride);

  const holes: ScoreClientHole[] = data.engineHoles.map((h) => ({
    number: h.number,
    par: h.par,
    yardage:
      data.courseHoles.find((c) => c.holeNumber === h.number)?.yardage ?? null,
    handicapIndex: h.handicapIndex,
  }));

  const players: ScoreClientPlayer[] = data.rosterPlayers.map((p) => {
    const strokesByHole: Record<number, number> = {};
    const playerStrokes = strokesMap.get(p.member.id);
    if (playerStrokes) {
      for (const [holeNum, n] of playerStrokes) strokesByHole[holeNum] = n;
    }
    return {
      tripMemberId: p.member.id,
      nickname: p.member.nickname,
      avatarUrl: p.member.avatarUrl,
      teamId: p.team.id,
      teamColor: p.team.color,
      isSelf: p.member.id === selfTripMemberId,
      strokesByHole,
    };
  });

  const initialScores: ScoreClientScore[] = data.scores.map((s) => ({
    tripMemberId: s.tripMemberId,
    holeNumber: s.holeNumber,
    gross: s.gross,
    enteredByLabel: s.enteredByLabel,
  }));

  // Team-input formats: collapse the 4 participants into 2 team rows.
  // Team handicap + per-hole stroke allocation come from the team
  // engine; the UI renders the result.
  let teamsForClient: ScoreClientTeam[] = [];
  let initialTeamScores: ScoreClientTeamScore[] = [];
  // For 'course' method, team handicaps are recomputed from the players'
  // converted course handicaps — same resolver every compute site uses.
  const { engineTeams } = await resolveMatchHandicaps(data);
  if (
    data.inputMode === 'team' &&
    engineTeams &&
    engineTeams.length === 2
  ) {
    const teamComputed = computeTeamMatch({
      teams: [engineTeams[0], engineTeams[1]],
      holes: data.engineHoles,
      scores: data.engineTeamScores ?? [],
    });
    teamsForClient = engineTeams.map((et) => {
      const teammates = data.participants.filter((p) => p.team.id === et.id);
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
    // Non-admins only see their own team's row so a player can't
    // accidentally enter the opposing team's score. Admins still get
    // both rows for fix-ups.
    if (!isAdmin) {
      teamsForClient = teamsForClient.filter((t) => t.isSelfOnTeam);
    }
    // Team-level enteredByLabel: pull the label off any one teammate's
    // hole_score row — fan-out keeps them all identical.
    const teamHoleLabel = new Map<string, string | null>();
    for (const s of data.scores) {
      const p = data.participants.find(
        (pp) => pp.participant.id === s.tripMemberId,
      );
      if (!p) continue;
      const key = `${p.team.id}:${s.holeNumber}`;
      if (!teamHoleLabel.has(key)) {
        teamHoleLabel.set(key, s.enteredByLabel);
      }
    }
    initialTeamScores =
      data.engineTeamScores?.map((s) => ({
        teamId: s.teamId,
        holeNumber: s.holeNumber,
        gross: s.gross,
        enteredByLabel:
          teamHoleLabel.get(`${s.teamId}:${s.holeNumber}`) ?? null,
      })) ?? [];
  }

  // 30 Ball: per-side commit state for any thirty_ball match whose
  // players are on this foursome's card.
  const thirtyBall = await getThirtyBallEntryStates(
    data.round.id,
    data.rosterPlayers.map((p) => p.member.id),
    ctx,
  );

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <Link
        href={`/trips/${slug}/schedule`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Schedule
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
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-800 dark:text-yellow-400">
            Course needs hole data
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            {data.course.name} doesn&apos;t have par / yardage / stroke-index
            for its 18 holes yet, so scores can&apos;t be entered.
          </p>
          {isAdmin && (
            <Link
              href={`/trips/${slug}/admin/courses`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
            >
              Add hole data
            </Link>
          )}
        </div>
      ) : data.inputMode === 'team' && !validTeamSetup(data) ? (
        <div className="mt-8 rounded-sm border border-yellow-600/30 bg-yellow-500/5 p-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-800 dark:text-yellow-400">
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
              href={`/trips/${slug}/matches/${data.match.id}/edit`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
            >
              Edit matchup
            </Link>
          )}
        </div>
      ) : (
        <ScoreEntryClient
          matchId={data.match.id}
          matchIdByPlayer={data.matchIdByPlayer}
          holes={holes}
          players={players}
          initialScores={initialScores}
          canEdit={isAdmin || selfIsInRoster}
          selfTripMemberId={selfTripMemberId}
          mode={data.inputMode}
          teams={teamsForClient}
          initialTeamScores={initialTeamScores}
          thirtyBall={thirtyBall}
        />
      )}
    </div>
  );
}
