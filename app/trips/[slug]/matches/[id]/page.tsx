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
  users,
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
            className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-yellow-400"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
          >
            Power
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
  // Each slot is an identical aspect-square box, equal width via grid
  // tracks. Portraits sit ON TOP of their box (object-bottom) so subjects
  // share a common baseline — uneven AI crops still read as "standing on
  // the same line" even if one subject is rendered taller in its frame.
  return (
    <div
      className="grid items-stretch gap-1 px-2 pt-3 pb-2"
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
  // One uniform slot — the OUTER container is always aspect-square w-full.
  // What's drawn INSIDE (arcade portrait / avatar photo / monogram) varies,
  // but the box dimensions never do, so the two slots per side render at
  // identical pixel sizes.
  return (
    <div className="relative aspect-square w-full min-w-0">
      {member.arcadePortraitUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.arcadePortraitUrl}
          alt={member.nickname}
          className="absolute inset-0 h-full w-full object-contain object-bottom"
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      ) : member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatarUrl}
          alt={member.nickname}
          className="absolute inset-0 h-full w-full rounded-sm object-cover"
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-sm bg-zinc-900 font-mono text-2xl font-bold text-white"
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
        className="truncate font-mono text-[11px] font-bold uppercase tracking-widest text-yellow-300"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
      >
        {member.nickname}
      </p>
      <div
        className="mt-1 h-2.5 overflow-hidden rounded-[1px] bg-black/60"
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
