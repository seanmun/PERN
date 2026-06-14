import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  teeTimes,
  rounds,
  courses,
  tripMembers,
  teams,
  matches,
  matchParticipants,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import MatchBuilder from '@/components/admin/MatchBuilder';
import { type FormatId } from '@/lib/scoring/formats';

/**
 * New-match flow. Per docs/match-template-spec.md the entry point is now
 * the round — admin picks a round, then a format, then drags players
 * from foursomes into slot templates. The roundId query param drives
 * everything.
 *
 * Existing links that pass teeTimeId still work — we resolve that to a
 * roundId and pre-pick the format from the round.
 */
export default async function NewMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ teeTimeId?: string; roundId?: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const sp = await searchParams;

  // Resolve roundId: explicit param wins; else fall back to the tee
  // time's round; else error out.
  let roundId = sp.roundId ?? null;
  if (!roundId && sp.teeTimeId) {
    const [tt] = await db
      .select({ roundId: teeTimes.roundId })
      .from(teeTimes)
      .where(eq(teeTimes.id, sp.teeTimeId))
      .limit(1);
    roundId = tt?.roundId ?? null;
  }

  if (!roundId) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <p className="text-zinc-600 dark:text-zinc-400">
          Missing roundId or teeTimeId.
        </p>
      </div>
    );
  }

  const [round] = await db
    .select({ round: rounds, course: courses })
    .from(rounds)
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(rounds.id, roundId))
    .limit(1);

  if (!round) notFound();

  const canEdit =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, round.round.tripId);
  if (!canEdit) redirect(`/trips/${slug}/schedule`);

  const allTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, round.round.tripId))
    .orderBy(asc(teams.name));

  const allMembers = allTeams.length
    ? await db
        .select()
        .from(tripMembers)
        .where(inArray(tripMembers.teamId, allTeams.map((t) => t.id)))
        .orderBy(asc(tripMembers.nickname))
    : [];

  const allTeeTimes = await db
    .select()
    .from(teeTimes)
    .where(eq(teeTimes.roundId, roundId))
    .orderBy(asc(teeTimes.groupNumber));

  // Derive each member's tee time for this round. Today there's no
  // explicit tee_time_participants table — instead a member's tee time
  // is whichever round's tee time has at least one match they're a
  // participant in. Step 8+ of the spec promotes this to an explicit
  // join table. For now derive it on the fly so the builder can show
  // foursome groupings.
  const roundMatches = await db
    .select({ matchId: matches.id, teeTimeId: matches.teeTimeId })
    .from(matches)
    .where(eq(matches.roundId, roundId));

  const matchToTee = new Map(
    roundMatches.map((m) => [m.matchId, m.teeTimeId]),
  );
  const participants = roundMatches.length
    ? await db
        .select()
        .from(matchParticipants)
        .where(
          inArray(
            matchParticipants.matchId,
            roundMatches.map((m) => m.matchId),
          ),
        )
    : [];
  const memberTeeTimeById = new Map<string, string | null>();
  for (const p of participants) {
    if (memberTeeTimeById.get(p.tripMemberId)) continue;
    const tee = matchToTee.get(p.matchId);
    if (tee) memberTeeTimeById.set(p.tripMemberId, tee);
  }

  const builderMembers = allMembers
    .filter((m) => m.teamId)
    .map((m) => ({
      id: m.id,
      nickname: m.nickname,
      teamId: m.teamId!,
      teeTimeId: memberTeeTimeById.get(m.id) ?? null,
    }));
  const builderTeams = allTeams.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
  }));
  const builderTeeTimes = allTeeTimes.map((t) => ({
    id: t.id,
    groupNumber: t.groupNumber,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/schedule`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Schedule
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">New matchup</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Round {round.round.order} · {round.course.name}
      </p>

      <div className="mt-8">
        <MatchBuilder
          tripSlug={slug}
          roundId={roundId}
          teams={builderTeams}
          members={builderMembers}
          teeTimes={builderTeeTimes}
          defaultFormat={round.round.format as FormatId}
          defaultTeeTimeId={sp.teeTimeId ?? null}
        />
      </div>
    </div>
  );
}
