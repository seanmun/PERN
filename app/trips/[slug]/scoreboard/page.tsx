import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { matches, matchParticipants, rounds, teeTimes, teams, tripMembers } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { getLeaderboard, type PlayerTotal, type TeamTotal } from '@/lib/data/leaderboard';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import { computeMatch, formatStatus, type PlayerInputFormat } from '@/lib/scoring/engine';
import FormatBadge, { type MatchFormat } from '@/components/FormatBadge';

const PLAYER_INPUT_FORMATS: ReadonlySet<string> = new Set<PlayerInputFormat>([
  'best_ball',
  'singles',
  'two_man_aggregate',
]);

export default async function ScoreboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  // Match kind: there's only one match. Skip the standings concept entirely
  // and drop the user straight into the match page.
  if (trip.kind === 'match') {
    const [m] = await db
      .select({ id: matches.id })
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(eq(rounds.tripId, trip.id))
      .limit(1);
    if (m) redirect(`/trips/${slug}/matches/${m.id}`);
    // No match yet — fall through to a stub.
    return (
      <div className="mx-auto max-w-md px-4 pt-10">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
          No match yet
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Add a match from the admin page to start keeping score.
        </p>
      </div>
    );
  }

  // Outing kind: one day, multiple groups, no season standings. Show live
  // status of every match in the field.
  if (trip.kind === 'outing') {
    return <OutingLiveBoard tripId={trip.id} tripName={trip.name} slug={slug} />;
  }

  // Trip kind (default): cumulative team Cup standings + individual leaderboard.
  const board = await getLeaderboard(trip.id);
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        Cup standings
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{trip.name}</h1>

      <TeamScoreRow teams={board.teamTotals} slug={slug} />

      <p className="mt-4 text-center font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {board.matchesContested} of {board.matchesTotal} matches in the books · {board.pointsAvailable} pts left
      </p>

      <TripIndividualLeaderboard board={board} slug={slug} />
    </div>
  );
}

// ───────────────────────── OUTING LIVE BOARD ─────────────────────────

const LEADERBOARD_VISIBLE = 12;

function TripIndividualLeaderboard({
  board,
  slug,
}: {
  board: Awaited<ReturnType<typeof getLeaderboard>>;
  slug: string;
}) {
  if (board.playerTotals.length === 0) return null;
  const visible = board.playerTotals.slice(0, LEADERBOARD_VISIBLE);
  const overflow = Math.max(0, board.playerTotals.length - LEADERBOARD_VISIBLE);
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
          Individual leaderboard
        </p>
        {overflow > 0 && (
          <Link
            href={`/trips/${slug}/scoreboard/leaderboard`}
            className="font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-400 hover:text-yellow-300"
          >
            View all {board.playerTotals.length} →
          </Link>
        )}
      </div>
      <div className="mt-3 overflow-hidden rounded-sm border border-zinc-800">
        {visible.map((p, i) => (
          <PlayerRow key={p.tripMemberId} player={p} rank={i + 1} slug={slug} />
        ))}
      </div>
      {overflow > 0 && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          +{overflow} more
        </p>
      )}
    </section>
  );
}

async function OutingLiveBoard({
  tripId,
  tripName,
  slug,
}: {
  tripId: string;
  tripName: string;
  slug: string;
}) {
  // Individual leaderboard alongside the live matches — same vs-par totals
  // we show on multi-day Trip cup tabs, scoped to this outing.
  const board = await getLeaderboard(tripId);
  const lbVisible = board.playerTotals.slice(0, LEADERBOARD_VISIBLE);
  const lbOverflow = Math.max(
    0,
    board.playerTotals.length - LEADERBOARD_VISIBLE,
  );
  // Fetch every match in this trip, joined with its tee time + round, plus
  // participants & their teams. Group by tee time so we can render side-by-side.
  const allMatches = await db
    .select({
      match: matches,
      teeTime: teeTimes,
      roundLabel: rounds.label,
      roundOrder: rounds.order,
    })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .leftJoin(teeTimes, eq(matches.teeTimeId, teeTimes.id))
    .where(eq(rounds.tripId, tripId))
    .orderBy(asc(teeTimes.groupNumber));

  const matchIds = allMatches.map((m) => m.match.id);
  const partRows = matchIds.length
    ? await db
        .select({ p: matchParticipants, member: tripMembers, team: teams })
        .from(matchParticipants)
        .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
        .innerJoin(teams, eq(matchParticipants.teamId, teams.id))
        .where(inArray(matchParticipants.matchId, matchIds))
    : [];

  const partsByMatch = new Map<string, typeof partRows>();
  for (const r of partRows) {
    const list = partsByMatch.get(r.p.matchId) ?? [];
    list.push(r);
    partsByMatch.set(r.p.matchId, list);
  }

  // Compute live status per match. N queries; fine for an outing scale.
  const liveByMatch = new Map<string, Awaited<ReturnType<typeof computeLive>>>();
  for (const m of allMatches) {
    liveByMatch.set(m.match.id, await computeLive(m.match.id));
  }

  // Group by tee time id (or "ungrouped" for matches without a tee time)
  const byTeeTime = new Map<
    string,
    { teeTime: typeof allMatches[number]['teeTime']; rows: typeof allMatches }
  >();
  for (const row of allMatches) {
    const key = row.teeTime?.id ?? 'ungrouped';
    const entry = byTeeTime.get(key) ?? { teeTime: row.teeTime, rows: [] };
    entry.rows.push(row);
    byTeeTime.set(key, entry);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        Outing live board
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{tripName}</h1>

      {allMatches.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">
          No matches set up yet. Add them from the admin page.
        </p>
      ) : (
        <div className="mt-8 space-y-3">
          {Array.from(byTeeTime.entries()).map(([key, { teeTime, rows }]) => (
            <div
              key={key}
              className="rounded-sm border border-zinc-800 bg-zinc-950/40"
            >
              {/* Tee-time header — shown once per group */}
              <div className="flex items-baseline justify-between gap-3 border-b border-zinc-900 px-3 py-2.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-yellow-500">
                  Group {teeTime?.groupNumber ?? '—'}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {rows.length} match{rows.length === 1 ? '' : 'es'}
                </p>
              </div>

              {/* Match sub-rows */}
              <div className="divide-y divide-zinc-900">
                {rows.map((row) => {
                  const parts = partsByMatch.get(row.match.id) ?? [];
                  const byTeam = new Map<
                    string,
                    { color: string | null; name: string; nicknames: string[] }
                  >();
                  for (const p of parts) {
                    const entry =
                      byTeam.get(p.team.id) ??
                      { color: p.team.color, name: p.team.name, nicknames: [] };
                    entry.nicknames.push(p.member.nickname);
                    byTeam.set(p.team.id, entry);
                  }
                  const sides = Array.from(byTeam.values());
                  const live = liveByMatch.get(row.match.id);
                  return (
                    <MatchLiveRow
                      key={row.match.id}
                      slug={slug}
                      matchId={row.match.id}
                      format={row.match.format}
                      sides={sides}
                      upA={live?.upA ?? 0}
                      upB={live?.upB ?? 0}
                      holesPlayed={live?.holesPlayed ?? 0}
                      totalHoles={live?.totalHoles ?? 18}
                      statusText={live?.statusText ?? '—'}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {board.playerTotals.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
              Individual leaderboard
            </p>
            {lbOverflow > 0 && (
              <Link
                href={`/trips/${slug}/scoreboard/leaderboard`}
                className="font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-400 hover:text-yellow-300"
              >
                View all {board.playerTotals.length} →
              </Link>
            )}
          </div>
          <div className="mt-3 overflow-hidden rounded-sm border border-zinc-800">
            {lbVisible.map((p, i) => (
              <PlayerRow key={p.tripMemberId} player={p} rank={i + 1} slug={slug} />
            ))}
          </div>
          {lbOverflow > 0 && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              +{lbOverflow} more
            </p>
          )}
        </section>
      )}
    </div>
  );
}

async function computeLive(matchId: string) {
  const data = await getMatchScoringData(matchId);
  if (!data) return null;
  const fmt = PLAYER_INPUT_FORMATS.has(data.match.format)
    ? (data.match.format as PlayerInputFormat)
    : 'best_ball';
  const computed = computeMatch({
    players: data.enginePlayers,
    holes: data.engineHoles,
    scores: data.engineScores,
    format: fmt,
  });
  return {
    upA: computed.upA,
    upB: computed.upB,
    holesPlayed: computed.holesPlayed,
    totalHoles: computed.totalHoles,
    statusText: formatStatus(computed.status),
  };
}

function MatchLiveRow({
  slug,
  matchId,
  format,
  sides,
  upA,
  upB,
  holesPlayed,
  totalHoles,
  statusText,
}: {
  slug: string;
  matchId: string;
  format: string;
  sides: { color: string | null; name: string; nicknames: string[] }[];
  upA: number;
  upB: number;
  holesPlayed: number;
  totalHoles: number;
  statusText: string;
}) {
  const sideA = sides[0];
  const sideB = sides[1];
  const remaining = Math.max(0, totalHoles - holesPlayed);
  return (
    <Link
      href={`/trips/${slug}/matches/${matchId}`}
      className="block px-3 py-2.5 hover:bg-zinc-900/40"
    >
      <div className="flex items-center justify-between gap-3">
        <FormatBadge format={format} size="xs" />
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {holesPlayed === 0
            ? 'Not started'
            : `${statusText} · thru ${holesPlayed}${remaining > 0 ? ` · ${remaining} to play` : ''}`}
        </p>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <SideName side={sideA} align="left" />
        <p className="font-mono text-2xl font-bold tabular-nums text-yellow-400">
          <span style={{ color: sideA?.color ?? undefined }}>{upA}</span>
          <span className="mx-1 text-zinc-700">·</span>
          <span style={{ color: sideB?.color ?? undefined }}>{upB}</span>
        </p>
        <SideName side={sideB} align="right" />
      </div>
    </Link>
  );
}

function SideName({
  side,
  align,
}: {
  side: { color: string | null; name: string; nicknames: string[] } | undefined;
  align: 'left' | 'right';
}) {
  if (!side) {
    return <p className={`text-xs text-zinc-600 ${align === 'right' ? 'text-right' : ''}`}>—</p>;
  }
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p
        className="font-mono text-[9px] font-semibold uppercase tracking-widest"
        style={{ color: side.color ?? '#a1a1aa' }}
      >
        {side.name}
      </p>
      <p className="truncate text-sm font-semibold text-zinc-100">
        {side.nicknames.join(' & ')}
      </p>
    </div>
  );
}

// ───────────────────────── TRIP-KIND STANDINGS (unchanged) ─────────────────────────

function TeamScoreRow({ teams, slug }: { teams: TeamTotal[]; slug: string }) {
  if (teams.length !== 2) return null;
  const [a, b] = teams;
  return (
    <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
      <TeamSide team={a} align="left" slug={slug} />
      <div className="flex items-center justify-center">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600">
          vs
        </span>
      </div>
      <TeamSide team={b} align="right" slug={slug} />
    </div>
  );
}

function TeamSide({ team, align, slug }: { team: TeamTotal; align: 'left' | 'right'; slug: string }) {
  const color = team.teamColor ?? '#71717a';
  return (
    <div
      className="flex flex-col rounded-sm border p-5"
      style={{
        borderColor: `${color}66`,
        background: `linear-gradient(180deg, ${color}22 0%, transparent 100%)`,
        textAlign: align,
      }}
    >
      <p
        className="font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
        style={{ color }}
      >
        {team.teamName}
      </p>
      <p
        className="mt-2 font-bold tabular-nums leading-none"
        style={{
          color,
          fontSize: '4rem',
          textShadow: `0 0 24px ${color}55`,
        }}
      >
        {formatPoints(team.points)}
      </p>
      <Link
        href={`/trips/${slug}/teams/${team.teamId}`}
        className={`mt-4 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:text-yellow-400 ${
          align === 'right' ? 'ml-auto' : ''
        }`}
      >
        View team →
      </Link>
    </div>
  );
}

function PlayerRow({ player, rank, slug }: { player: PlayerTotal; rank: number; slug: string }) {
  const color = player.teamColor ?? '#71717a';
  const scoreLabel = formatScoreVsPar(player);
  const scoreColor =
    player.holesScored === 0
      ? 'text-zinc-600'
      : player.scoreVsPar < 0
        ? 'text-red-400'
        : player.scoreVsPar === 0
          ? 'text-zinc-100'
          : 'text-zinc-400';
  return (
    <Link
      href={`/trips/${slug}/profile/${player.tripMemberId}`}
      className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/40 px-3 py-2.5 last:border-b-0 hover:bg-zinc-900/40"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <p className="w-6 shrink-0 font-mono text-xs font-semibold tabular-nums text-zinc-500">
        {rank}
      </p>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{player.nickname}</p>
        {player.teamName && (
          <p
            className="font-mono text-[9px] font-semibold uppercase tracking-widest"
            style={{ color }}
          >
            {player.teamName}
          </p>
        )}
      </div>
      <p className="w-12 shrink-0 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {player.tripHandicap ? `${player.tripHandicap} hcp` : 'no hcp'}
      </p>
      <div className="w-20 shrink-0 text-right">
        <div className="flex items-baseline justify-end gap-1.5">
          <p className={`font-mono text-lg font-bold tabular-nums ${scoreColor}`}>
            {scoreLabel}
          </p>
          {player.holesScored > 0 && (
            <p className="font-mono text-xs tabular-nums text-zinc-600">
              {player.gross}
            </p>
          )}
        </div>
        {player.holesScored > 0 && (
          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            thru {player.holesScored}
          </p>
        )}
      </div>
      <ChevronRight size={12} className="shrink-0 text-zinc-700" />
    </Link>
  );
}

function formatPoints(p: number): string {
  const whole = Math.floor(p);
  const half = Math.round((p - whole) * 2);
  if (half === 0) return String(whole);
  if (half === 1) return whole === 0 ? '½' : `${whole}½`;
  return String(p);
}

function formatScoreVsPar(p: PlayerTotal): string {
  if (p.holesScored === 0) return '—';
  if (p.scoreVsPar === 0) return 'E';
  if (p.scoreVsPar > 0) return `+${p.scoreVsPar}`;
  return String(p.scoreVsPar);
}
