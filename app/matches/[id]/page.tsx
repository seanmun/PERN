import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { eq, asc } from 'drizzle-orm';
import { ArrowLeft, MapPin, Pencil, Trophy } from 'lucide-react';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  tripMembers,
  teams,
  rounds,
  courses,
  teeTimes,
} from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import {
  formatTripTime,
  formatTripDayLong,
  mapsUrl,
  roundFormatLabel,
} from '@/lib/format';

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const { id } = await params;

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
            href="/schedule"
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
                href={`/matches/${match.match.id}/edit`}
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
          <div className="flex items-stretch gap-2">
            <Side side={sides[0]} />
            <div className="flex items-center font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              vs
            </div>
            <Side side={sides[1]} align="right" />
          </div>
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
        <p className="mt-1 text-base font-semibold capitalize">
          {match.match.status.replace('_', ' ')}
        </p>
        {match.match.resultText && (
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-yellow-400">
            {match.match.resultText}
          </p>
        )}
      </div>

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

function Side({
  side,
  align = 'left',
}: {
  side: {
    team: typeof teams.$inferSelect;
    members: (typeof tripMembers.$inferSelect)[];
  };
  align?: 'left' | 'right';
}) {
  const color = side.team.color ?? '#71717a';
  return (
    <div
      className="min-w-0 flex-1 rounded-sm border p-3"
      style={{
        borderColor: `${color}55`,
        background: `${color}11`,
        textAlign: align,
      }}
    >
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-widest"
        style={{ color }}
      >
        {side.team.name}
      </p>
      <div className="mt-2 space-y-1">
        {side.members.map((m) => (
          <div
            key={m.id}
            className={`flex items-baseline gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}
          >
            <p className="truncate text-base font-semibold">{m.nickname}</p>
            {m.tripHandicap && (
              <p className="font-mono text-xs tabular-nums text-zinc-500">
                {m.tripHandicap}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
