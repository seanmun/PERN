import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { eq, asc, and } from 'drizzle-orm';
import { ArrowLeft, MapPin, Pencil, PenLine, Trophy } from 'lucide-react';
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
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import {
  formatTripTime,
  formatTripDayLong,
  mapsUrl,
  roundFormatLabel,
} from '@/lib/format';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import { computeMatch, formatStatus } from '@/lib/scoring/engine';

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
    })
    .from(matchParticipants)
    .innerJoin(
      tripMembers,
      eq(matchParticipants.tripMemberId, tripMembers.id)
    )
    .innerJoin(teams, eq(matchParticipants.teamId, teams.id))
    .where(eq(matchParticipants.matchId, id))
    .orderBy(asc(teams.name));

  // Group participants by team
  const byTeam = new Map<
    string,
    { team: typeof teams.$inferSelect; members: (typeof tripMembers.$inferSelect)[] }
  >();
  for (const p of participants) {
    const entry = byTeam.get(p.team.id) ?? { team: p.team, members: [] };
    entry.members.push(p.member);
    byTeam.set(p.team.id, entry);
  }
  const sides = Array.from(byTeam.values());

  const canEdit =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, match.round.tripId);

  // Live status from the scoring engine
  const scoringData = await getMatchScoringData(id);
  const liveMatch = scoringData
    ? computeMatch({
        players: scoringData.enginePlayers,
        holes: scoringData.engineHoles,
        scores: scoringData.engineScores,
      })
    : null;
  const liveStatusText = liveMatch ? formatStatus(liveMatch.status) : null;

  const selfTripMemberId = ctx.tripMember?.id ?? null;
  const selfIsParticipant = participants.some(
    (p) => p.member.id === selfTripMemberId
  );
  const canEnterScores = canEdit || selfIsParticipant;

  const mapQuery = [match.course.name, match.course.location]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="pb-24">
      <section
        className="relative -mt-px overflow-hidden border-b border-zinc-800"
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
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:text-yellow-400"
          >
            <ArrowLeft size={12} /> Schedule
          </Link>

          <div className="mt-8 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-yellow-400" />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-400">
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
                <p className="mt-1 text-sm text-zinc-300">{match.course.location}</p>
              )}
            </div>
            {canEdit && (
              <Link
                href={`/trips/${slug}/matches/${match.match.id}/edit`}
                aria-label="Edit matchup"
                className="shrink-0 rounded-sm border border-zinc-700/60 bg-black/50 p-2 text-zinc-200 hover:border-yellow-500/50 hover:text-yellow-400"
              >
                <Pencil size={14} />
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-md px-4 pt-6">

      {match.teeTime?.time && (
        <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Tee time
          </p>
          <p className="mt-1 text-lg font-semibold">
            {formatTripDayLong(match.teeTime.time)}
          </p>
          <p className="font-mono text-base font-bold tabular-nums text-yellow-400">
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
          <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-500">
            Matchup not set yet.
          </div>
        )}
      </div>

      <div className="mt-6 rounded-sm border border-zinc-800 bg-zinc-950/40 p-4">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Status
        </p>
        {liveMatch && liveMatch.holesPlayed > 0 ? (
          <>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-yellow-400">
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

      {canEnterScores && (
        <Link
          href={`/trips/${slug}/matches/${match.match.id}/score`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
        >
          <PenLine size={14} /> Enter scores
        </Link>
      )}

      {mapQuery && (
        <a
          href={mapsUrl(mapQuery)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
        >
          <MapPin size={14} /> Open in Maps
        </a>
      )}
      </div>
    </div>
  );
}

type MatchSide = {
  team: typeof teams.$inferSelect;
  members: (typeof tripMembers.$inferSelect)[];
};

function MatchupShowdown({ left, right }: { left: MatchSide; right: MatchSide }) {
  return (
    <div className="overflow-hidden rounded-sm border border-zinc-800">
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
        <ShowdownSide side={left} align="left" />
        <div className="flex items-center justify-center bg-black px-2">
          <span
            className="font-mono text-base font-bold tabular-nums text-yellow-500"
            style={{ textShadow: '0 0 14px rgba(202,138,4,0.5)' }}
          >
            VS
          </span>
        </div>
        <ShowdownSide side={right} align="right" />
      </div>
    </div>
  );
}

function ShowdownSide({ side, align }: { side: MatchSide; align: 'left' | 'right' }) {
  const color = side.team.color ?? '#71717a';
  return (
    <div
      className="p-3"
      style={{
        background: `linear-gradient(${align === 'left' ? '90deg' : '270deg'}, ${color}33 0%, ${color}0a 100%)`,
      }}
    >
      <p
        className="text-center font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
        style={{ color }}
      >
        {side.team.name}
      </p>
      <div className="mt-3 flex items-start justify-center gap-2">
        {side.members.map((m) => (
          <Portrait key={m.id} member={m} color={color} />
        ))}
      </div>
    </div>
  );
}

function Portrait({
  member,
  color,
}: {
  member: typeof tripMembers.$inferSelect;
  color: string;
}) {
  return (
    <div className="flex w-full max-w-[88px] flex-col items-center text-center">
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatarUrl}
          alt={member.nickname}
          className="aspect-square w-full rounded-sm object-cover"
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        />
      ) : (
        <div
          className="flex aspect-square w-full items-center justify-center rounded-sm bg-zinc-900 font-mono text-xl font-bold text-zinc-500"
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        >
          {member.nickname.slice(0, 1).toUpperCase()}
        </div>
      )}
      <p className="mt-2 max-w-full truncate text-xs font-semibold">
        {member.nickname}
      </p>
      {member.tripHandicap && (
        <p className="font-mono text-[10px] tabular-nums text-zinc-500">
          {member.tripHandicap}
        </p>
      )}
    </div>
  );
}
