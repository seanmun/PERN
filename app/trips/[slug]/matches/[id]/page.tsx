import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { eq, asc, and } from 'drizzle-orm';
import { ArrowLeft, Calendar, Pencil, PenLine, Trophy } from 'lucide-react';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  tripMembers,
  teams,
  rounds,
  courses,
  courseTees,
  teeTimes,
  users,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import {
  formatTripTime,
  formatTripDayLong,
  roundFormatLabel,
} from '@/lib/format';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import {
  computeMatch,
  computeStableford,
  computeTeamMatch,
  DEFAULT_STABLEFORD_POINTS,
  formatStatus,
  type ComputedStableford,
  type HoleResult,
  type PlayerInputFormat,
} from '@/lib/scoring/engine';

const PLAYER_INPUT_FORMATS: ReadonlySet<string> = new Set<PlayerInputFormat>([
  'best_ball',
  'singles',
  'two_man_aggregate',
]);

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const [match] = await db
    .select({
      match: matches,
      round: rounds,
      course: courses,
      teeTime: teeTimes,
    })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .leftJoin(teeTimes, eq(matches.teeTimeId, teeTimes.id))
    .where(eq(matches.id, id))
    .limit(1);

  if (!match) notFound();

  // Resolve the tee this round plays from (explicit override, else default).
  let roundTee: typeof courseTees.$inferSelect | null = null;
  if (match.round.courseTeeId) {
    const [t] = await db
      .select()
      .from(courseTees)
      .where(eq(courseTees.id, match.round.courseTeeId))
      .limit(1);
    roundTee = t ?? null;
  }
  if (!roundTee) {
    const [t] = await db
      .select()
      .from(courseTees)
      .where(
        and(
          eq(courseTees.courseId, match.course.id),
          eq(courseTees.isDefault, true),
        ),
      )
      .limit(1);
    roundTee = t ?? null;
  }

  const participants = await db
    .select({
      participant: matchParticipants,
      member: tripMembers,
      team: teams,
      // Pull the arcade portrait off the user row so we can show it in the
      // face-to-face showdown. leftJoin because unclaimed members have no
      // userId yet — they fall back to regular avatar / monogram.
      arcadePortraitUrl: users.arcadePortraitUrl,
    })
    .from(matchParticipants)
    .innerJoin(
      tripMembers,
      eq(matchParticipants.tripMemberId, tripMembers.id)
    )
    .innerJoin(teams, eq(matchParticipants.teamId, teams.id))
    .leftJoin(users, eq(tripMembers.userId, users.id))
    .where(eq(matchParticipants.matchId, id))
    .orderBy(asc(teams.name));

  type ShowdownMember = typeof tripMembers.$inferSelect & {
    arcadePortraitUrl: string | null;
  };

  // Group participants by team
  const byTeam = new Map<
    string,
    { team: typeof teams.$inferSelect; members: ShowdownMember[] }
  >();
  for (const p of participants) {
    const entry = byTeam.get(p.team.id) ?? { team: p.team, members: [] };
    entry.members.push({ ...p.member, arcadePortraitUrl: p.arcadePortraitUrl });
    byTeam.set(p.team.id, entry);
  }
  const sides = Array.from(byTeam.values());

  const canEdit =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, match.round.tripId);

  // Live status from the scoring engine. Branches on the match's
  // scoring mode (match_play vs stableford), then on team vs player
  // input. Only one of liveMatch / liveStableford is populated.
  const scoringData = await getMatchScoringData(id);
  let liveMatch = null;
  let liveStableford: ComputedStableford | null = null;
  if (scoringData) {
    if (scoringData.match.scoring === 'stableford') {
      liveStableford = computeStableford({
        players: scoringData.enginePlayers,
        holes: scoringData.engineHoles,
        scores: scoringData.engineScores,
        points: {
          eagle: scoringData.match.ptsEagle ?? DEFAULT_STABLEFORD_POINTS.eagle,
          birdie: scoringData.match.ptsBirdie ?? DEFAULT_STABLEFORD_POINTS.birdie,
          par: scoringData.match.ptsPar ?? DEFAULT_STABLEFORD_POINTS.par,
          bogey: scoringData.match.ptsBogey ?? DEFAULT_STABLEFORD_POINTS.bogey,
          doublePlus:
            scoringData.match.ptsDoublePlus ?? DEFAULT_STABLEFORD_POINTS.doublePlus,
        },
      });
    } else if (
      scoringData.inputMode === 'team' &&
      scoringData.engineTeams &&
      scoringData.engineTeams.length === 2
    ) {
      liveMatch = computeTeamMatch({
        teams: [scoringData.engineTeams[0], scoringData.engineTeams[1]],
        holes: scoringData.engineHoles,
        scores: scoringData.engineTeamScores ?? [],
      });
    } else {
      liveMatch = computeMatch({
        players: scoringData.enginePlayers,
        holes: scoringData.engineHoles,
        scores: scoringData.engineScores,
        format: PLAYER_INPUT_FORMATS.has(scoringData.match.format)
          ? (scoringData.match.format as PlayerInputFormat)
          : 'best_ball',
      });
    }
  }
  const liveStatusText = liveMatch ? formatStatus(liveMatch.status) : null;

  const selfTripMemberId = ctx.tripMember?.id ?? null;
  const selfIsParticipant = participants.some(
    (p) => p.member.id === selfTripMemberId
  );
  const canEnterScores = canEdit || selfIsParticipant;

  return (
    <div className="pb-24">
      <section
        className="relative -mt-px overflow-hidden border-b border-zinc-300 dark:border-zinc-800"
        style={
          match.course.imageUrl
            ? {
                backgroundImage: `url(${match.course.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black" />
        <div className="relative mx-auto max-w-md px-4 pb-10 pt-6">
          <Link
            href={`/trips/${slug}/schedule`}
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:text-yellow-400"
          >
            <ArrowLeft size={12} /> Schedule
          </Link>

          <div className="mt-8 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-yellow-800 dark:text-yellow-400" />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-400">
                  Round {match.round.order} · {roundFormatLabel(match.round.format)}
                  {roundTee && (
                    <>
                      <span className="mx-1.5 text-zinc-700">·</span>
                      {roundTee.color && (
                        <span
                          aria-hidden
                          className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: roundTee.color }}
                        />
                      )}
                      {roundTee.name}
                    </>
                  )}
                </p>
              </div>
              <h1 className="mt-2 text-4xl font-bold tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                {match.course.name}
              </h1>
              {match.course.location && (
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{match.course.location}</p>
              )}
            </div>
            {canEdit && (
              <Link
                href={`/trips/${slug}/matches/${match.match.id}/edit`}
                aria-label="Edit matchup"
                className="shrink-0 rounded-sm border border-zinc-700/60 bg-zinc-50 dark:bg-black/50 p-2 text-zinc-800 dark:text-zinc-200 hover:border-yellow-500/50 hover:text-yellow-400"
              >
                <Pencil size={14} />
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-md px-4 pt-6">

      {match.teeTime?.time && (
        <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Tee time
          </p>
          <p className="mt-1 text-lg font-semibold">
            {formatTripDayLong(match.teeTime.time)}
          </p>
          <p className="font-mono text-base font-bold tabular-nums text-yellow-800 dark:text-yellow-400">
            {formatTripTime(match.teeTime.time)} · Group {match.teeTime.groupNumber}
          </p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Matchup
        </p>
        {sides.length === 2 ? (
          <MatchupShowdown left={sides[0]} right={sides[1]} />
        ) : (
          <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 text-sm text-zinc-500">
            Matchup not set yet.
          </div>
        )}
      </div>

      <div className="mt-6 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Status
          {scoringData?.match.scoring === 'stableford' && (
            <span className="ml-2 text-yellow-800 dark:text-yellow-500">· Stableford</span>
          )}
        </p>
        {liveStableford && liveStableford.holesPlayed > 0 ? (
          <>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-yellow-800 dark:text-yellow-400">
              {liveStableford.aPoints}
              <span className="mx-1 text-zinc-700">·</span>
              {liveStableford.bPoints}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {liveStableford.holesPlayed} of {liveStableford.totalHoles} holes
              {liveStableford.status.kind === 'final' &&
                ' · ' +
                  (liveStableford.status.winner === 'halved'
                    ? 'Halved'
                    : 'Final')}
            </p>
          </>
        ) : liveMatch && liveMatch.holesPlayed > 0 ? (
          <>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-yellow-800 dark:text-yellow-400">
              {liveStatusText}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {liveMatch.holesPlayed} of {liveMatch.totalHoles} holes
            </p>
          </>
        ) : (
          <p className="mt-1 text-base font-semibold capitalize">
            {match.match.status.replace('_', ' ')}
          </p>
        )}
      </div>

      {liveMatch && liveMatch.holesPlayed > 0 && scoringData && (
        <HoleScorecard
          holeResults={liveMatch.holeResults}
          aTeamName={scoringData.participants.find((p) => p.side === 'A')?.team.name ?? 'A'}
          bTeamName={scoringData.participants.find((p) => p.side === 'B')?.team.name ?? 'B'}
          aTeamColor={scoringData.participants.find((p) => p.side === 'A')?.team.color ?? null}
          bTeamColor={scoringData.participants.find((p) => p.side === 'B')?.team.color ?? null}
        />
      )}

      {liveStableford && liveStableford.holesPlayed > 0 && scoringData && (
        <StablefordScorecard
          stableford={liveStableford}
          participants={scoringData.participants}
          holes={scoringData.engineHoles}
        />
      )}

      {canEnterScores && (
        <Link
          href={`/trips/${slug}/matches/${match.match.id}/score`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
        >
          <PenLine size={14} /> Enter scores
        </Link>
      )}

      <div className="mt-8 grid grid-cols-2 gap-2">
        <Link
          href={`/trips/${slug}/schedule`}
          className="flex items-center justify-center gap-2 rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          <Calendar size={12} /> Schedule
        </Link>
        <Link
          href={`/trips/${slug}/scoreboard`}
          className="flex items-center justify-center gap-2 rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          <Trophy size={12} /> Cup
        </Link>
      </div>
      </div>
    </div>
  );
}

type ShowdownMember = typeof tripMembers.$inferSelect & {
  arcadePortraitUrl: string | null;
};

type MatchSide = {
  team: typeof teams.$inferSelect;
  members: ShowdownMember[];
};

/**
 * NBA Jam-style roster matchup card.
 *
 * Single outer container with two sections:
 *   - TOP: portraits side, banner in middle, portraits side
 *   - BOTTOM: dark "wood" panel with names (yellow) and rating bars per player
 *
 * Rating bar fill % is computed from the player's trip handicap, lower
 * handicap = longer bar.
 */
function MatchupShowdown({ left, right }: { left: MatchSide; right: MatchSide }) {
  const leftColor = left.team.color ?? '#71717a';
  const rightColor = right.team.color ?? '#71717a';
  return (
    <div
      className="overflow-hidden rounded-sm"
      style={{
        // Thick gold frame, NBA Jam style.
        boxShadow:
          '0 0 0 3px #eab308, 0 0 0 5px #18181b, 0 0 24px rgba(202,138,4,0.25)',
      }}
    >
      {/* TOP — portraits + center banner */}
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-stretch"
        style={{
          background:
            'linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)',
        }}
      >
        <PortraitsCell members={left.members} color={leftColor} align="left" />
        <CenterBanner />
        <PortraitsCell members={right.members} color={rightColor} align="right" />
      </div>

      {/* BOTTOM — stats panel */}
      <div
        className="grid grid-cols-[1fr_auto_1fr] gap-3 border-t-2 border-yellow-600 px-3 py-3"
        style={{
          background:
            'linear-gradient(180deg, #44322a 0%, #2a1f1a 60%, #1a120e 100%)',
        }}
      >
        <StatsCell members={left.members} color={leftColor} align="left" />
        <div className="flex items-center px-1">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-yellow-800 dark:text-yellow-400"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
          >
            Rating
          </p>
        </div>
        <StatsCell members={right.members} color={rightColor} align="right" />
      </div>
    </div>
  );
}

function CenterBanner() {
  return (
    <div className="flex items-center justify-center px-3">
      <div
        className="flex h-12 w-14 items-center justify-center rounded-sm border-2 border-yellow-600"
        style={{
          background: 'linear-gradient(180deg, #ca8a04 0%, #a16207 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 8px rgba(0,0,0,0.6)',
        }}
      >
        <span
          className="font-mono text-base font-extrabold text-black"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}
        >
          VS
        </span>
      </div>
    </div>
  );
}

function PortraitsCell({
  members,
  color,
  align,
}: {
  members: ShowdownMember[];
  color: string;
  align: 'left' | 'right';
}) {
  // Bottom-aligned grid: even if subjects have different vertical sizes
  // inside their PNGs (AI variance), every portrait gets anchored to the
  // SAME baseline at the bottom of the cell. Reads as "standing on the
  // same floor" instead of floating at random heights.
  return (
    <div
      className="grid items-end gap-1 px-2 pt-3"
      style={{
        gridTemplateColumns: `repeat(${members.length}, minmax(0, 1fr))`,
        background: `linear-gradient(${align === 'left' ? '90deg' : '270deg'}, ${color}55 0%, transparent 100%)`,
      }}
    >
      {members.map((m) => (
        <PortraitSlot key={m.id} member={m} color={color} />
      ))}
    </div>
  );
}

function PortraitSlot({
  member,
  color,
}: {
  member: ShowdownMember;
  color: string;
}) {
  // Slot is aspect-square + bottom-aligned via flex on the wrapper. The
  // arcade portrait's <img> uses object-contain + object-bottom so the
  // subject's feet/chest sit at the bottom edge of the slot — uneven
  // subject heights still read as standing on the same line.
  return (
    <div className="relative flex aspect-square w-full min-w-0 items-end justify-center">
      {member.arcadePortraitUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.arcadePortraitUrl}
          alt={member.nickname}
          className="absolute inset-x-0 bottom-0 h-full w-full object-contain object-bottom"
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      ) : member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatarUrl}
          alt={member.nickname}
          className="absolute inset-0 h-full w-full rounded-sm object-cover object-bottom"
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-sm bg-zinc-100 dark:bg-zinc-900 font-mono text-2xl font-bold text-zinc-900 dark:text-white"
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        >
          {member.nickname.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function StatsCell({
  members,
  color,
  align,
}: {
  members: ShowdownMember[];
  color: string;
  align: 'left' | 'right';
}) {
  return (
    <div className={`flex flex-col gap-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {members.map((m) => (
        <StatRow key={m.id} member={m} color={color} align={align} />
      ))}
    </div>
  );
}

function StatRow({
  member,
  color,
  align,
}: {
  member: ShowdownMember;
  color: string;
  align: 'left' | 'right';
}) {
  const pct = handicapToRating(member.tripHandicap);
  return (
    <div>
      <p
        className="truncate font-mono text-[11px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
      >
        {member.nickname}
      </p>
      <div
        className="mt-1 h-2.5 overflow-hidden rounded-[1px] bg-zinc-50 dark:bg-black/60"
        style={{
          // Direction the bar fills — left team fills L→R, right team fills R→L.
          direction: align === 'right' ? 'rtl' : 'ltr',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Trip handicap → rating-bar percentage. Lower handicap (better player) gets
 * a longer bar.
 *
 *   < 5      → 100%
 *   5–10     → 90%
 *   10–15    → 80%
 *   15–20    → 70%
 *   20–25    → 60%
 *   25–30    → 50%
 *   > 30     → 20%
 *   unknown  → 0%
 */
function handicapToRating(tripHandicap: string | null): number {
  if (tripHandicap == null) return 0;
  const h = parseFloat(tripHandicap);
  if (!Number.isFinite(h)) return 0;
  if (h < 5) return 100;
  if (h < 10) return 90;
  if (h < 15) return 80;
  if (h < 20) return 70;
  if (h < 25) return 60;
  if (h < 30) return 50;
  return 20;
}

/**
 * Hole-by-hole scorecard. Renders every hole with the par, each side's
 * best net score, and which side won (filled cell in the team color).
 * Halved holes get a neutral grey indicator. The running match-play
 * state ("1 UP", "AS") sits in the rightmost column so you can trace
 * momentum hole-by-hole.
 */
function HoleScorecard({
  holeResults,
  aTeamName,
  bTeamName,
  aTeamColor,
  bTeamColor,
}: {
  holeResults: HoleResult[];
  aTeamName: string;
  bTeamName: string;
  aTeamColor: string | null;
  bTeamColor: string | null;
}) {
  const colorA = aTeamColor ?? '#71717a';
  const colorB = bTeamColor ?? '#71717a';

  function runningStatus(upA: number, upB: number): string {
    if (upA === upB) return 'AS';
    if (upA > upB) return `${upA - upB} UP`;
    return `${upB - upA} DN`;
  }

  return (
    <section className="mt-6 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="border-b border-zinc-200 dark:border-zinc-900 px-3 py-2.5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Scorecard
        </p>
      </div>

      <div className="grid grid-cols-[28px_28px_1fr_1fr_42px] items-center gap-2 border-b border-zinc-200 dark:border-zinc-900 bg-zinc-100 dark:bg-zinc-900/30 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
        <span>#</span>
        <span>Par</span>
        <span
          className="truncate"
          style={{ color: colorA }}
          title={aTeamName}
        >
          {aTeamName}
        </span>
        <span
          className="truncate text-right"
          style={{ color: colorB }}
          title={bTeamName}
        >
          {bTeamName}
        </span>
        <span className="text-right">Result</span>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-900">
        {holeResults.map((r) => {
          const aWon = r.winner === 'A';
          const bWon = r.winner === 'B';
          const halved = r.winner === 'halved';
          const status = runningStatus(r.statusAfter.upA, r.statusAfter.upB);
          return (
            <div
              key={r.holeNumber}
              className="grid grid-cols-[28px_28px_1fr_1fr_42px] items-center gap-2 px-3 py-2 font-mono text-xs tabular-nums"
            >
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{r.holeNumber}</span>
              <span className="text-zinc-600 dark:text-zinc-400">{r.par}</span>
              <span
                className={`rounded-sm px-2 py-1 text-center font-bold ${
                  aWon ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'
                }`}
                style={
                  aWon
                    ? { background: `${colorA}33`, boxShadow: `inset 0 0 0 1px ${colorA}` }
                    : undefined
                }
              >
                {r.aBestNet ?? '—'}
              </span>
              <span
                className={`rounded-sm px-2 py-1 text-center font-bold ${
                  bWon ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'
                }`}
                style={
                  bWon
                    ? { background: `${colorB}33`, boxShadow: `inset 0 0 0 1px ${colorB}` }
                    : undefined
                }
              >
                {r.bBestNet ?? '—'}
              </span>
              <span
                className={`text-right ${
                  halved
                    ? 'text-zinc-500'
                    : r.statusAfter.upA > r.statusAfter.upB
                      ? ''
                      : r.statusAfter.upA < r.statusAfter.upB
                        ? ''
                        : 'text-zinc-500'
                }`}
                style={{
                  color:
                    r.statusAfter.upA > r.statusAfter.upB
                      ? colorA
                      : r.statusAfter.upA < r.statusAfter.upB
                        ? colorB
                        : undefined,
                }}
              >
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Stableford scorecard. Renders each player's per-hole points table
 * with their total, grouped by side. Highest per-side total wins; the
 * final winner cell glows in the team color.
 */
function StablefordScorecard({
  stableford,
  participants,
  holes,
}: {
  stableford: ComputedStableford;
  participants: { participant: { id: string; nickname: string }; team: { id: string; name: string; color: string | null }; side: 'A' | 'B' }[];
  holes: { number: number; par: number }[];
}) {
  const memberById = new Map(participants.map((p) => [p.participant.id, p]));
  const aPlayers = stableford.players.filter((p) => p.side === 'A');
  const bPlayers = stableford.players.filter((p) => p.side === 'B');

  function renderSide(
    label: string,
    sidePlayers: typeof stableford.players,
    color: string,
  ) {
    if (!sidePlayers.length) return null;
    return (
      <div className="border-b border-zinc-200 dark:border-zinc-900 last:border-b-0">
        <div className="border-b border-zinc-200 dark:border-zinc-900 bg-zinc-100 dark:bg-zinc-900/30 px-3 py-1.5">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-widest"
            style={{ color }}
          >
            {label}
          </p>
        </div>
        {sidePlayers.map((p) => {
          const meta = memberById.get(p.playerId);
          return (
            <div
              key={p.playerId}
              className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs tabular-nums"
            >
              <span className="truncate text-zinc-700 dark:text-zinc-300">
                {meta?.participant.nickname ?? 'Player'}
              </span>
              <span className="font-bold text-yellow-800 dark:text-yellow-400">
                {p.total} pts
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  const aColor =
    participants.find((p) => p.side === 'A')?.team.color ?? '#71717a';
  const bColor =
    participants.find((p) => p.side === 'B')?.team.color ?? '#71717a';
  const aName = participants.find((p) => p.side === 'A')?.team.name ?? 'Side A';
  const bName = participants.find((p) => p.side === 'B')?.team.name ?? 'Side B';

  return (
    <section className="mt-6 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="border-b border-zinc-200 dark:border-zinc-900 px-3 py-2.5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Stableford · {holes.length}-hole points
        </p>
      </div>

      <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-900">
        <div>
          {renderSide(aName, aPlayers, aColor)}
          <div className="flex items-center justify-between gap-3 border-t border-zinc-300 dark:border-zinc-800 px-3 py-2 font-mono text-xs font-bold tabular-nums">
            <span className="uppercase tracking-widest text-zinc-500">Total</span>
            <span style={{ color: aColor }}>{stableford.aPoints}</span>
          </div>
        </div>
        <div>
          {renderSide(bName, bPlayers, bColor)}
          <div className="flex items-center justify-between gap-3 border-t border-zinc-300 dark:border-zinc-800 px-3 py-2 font-mono text-xs font-bold tabular-nums">
            <span className="uppercase tracking-widest text-zinc-500">Total</span>
            <span style={{ color: bColor }}>{stableford.bPoints}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
