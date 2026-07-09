import { notFound, redirect } from 'next/navigation';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  rounds,
  courses,
  teeTimes,
  tripMembers,
  teams,
  matches,
  matchParticipants,
  users,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { type FormatId, FORMAT_META } from '@buddycup/scoring/formats';
import WizardShell from '@/components/admin/EventWizard/WizardShell';
import MatchBuilder from '@/components/admin/MatchBuilder';
import { roundTeeHasSlopeRating } from '@/lib/scoring/handicap-method';

export default async function SetupMatchesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');
  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, trip.id)) {
    redirect(`/trips/${slug}/admin/players`);
  }

  const tripRounds = await db
    .select({ round: rounds, course: courses })
    .from(rounds)
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(rounds.tripId, trip.id))
    .orderBy(asc(rounds.order));

  const allTeams = await db.select().from(teams).where(eq(teams.tripId, trip.id)).orderBy(asc(teams.name));

  return (
    <div className="pb-24">
      <WizardShell active="matches" tripSlug={slug} />
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Matches.</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Build a matchup per round. Anyone can be in several matches at once,
          even across foursomes.
        </p>

        {tripRounds.length === 0 ? (
          <p className="mt-6 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 text-sm text-zinc-500">
            No rounds yet — go back to Groups and add one first.
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {tripRounds.map(({ round, course }) => (
              <RoundMatchesBlock
                key={round.id}
                tripSlug={slug}
                round={round}
                courseName={course.name}
                allTeams={allTeams}
                defaultHandicapMethod={trip.defaultHandicapMethod}
              />
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-900 pt-6">
          <a
            href={`/trips/${slug}/setup/groups`}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
          >
            ← Groups
          </a>
          <a
            href={`/trips/${slug}/setup/review`}
            className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400"
          >
            Review →
          </a>
        </div>
      </div>
    </div>
  );
}

async function RoundMatchesBlock({
  tripSlug,
  round,
  courseName,
  allTeams,
  defaultHandicapMethod,
}: {
  tripSlug: string;
  round: typeof rounds.$inferSelect;
  courseName: string;
  allTeams: (typeof teams.$inferSelect)[];
  defaultHandicapMethod: 'group_low' | 'match_low' | 'course';
}) {
  const allTeeTimes = await db
    .select()
    .from(teeTimes)
    .where(eq(teeTimes.roundId, round.id))
    .orderBy(asc(teeTimes.groupNumber));

  const allMembers = allTeams.length
    ? await db
        .select({
          id: tripMembers.id,
          teamId: tripMembers.teamId,
          nickname: tripMembers.nickname,
          memberAvatarUrl: tripMembers.avatarUrl,
          userAvatarUrl: users.avatarUrl,
          arcadePortraitUrl: users.arcadePortraitUrl,
        })
        .from(tripMembers)
        .leftJoin(users, eq(tripMembers.userId, users.id))
        .where(inArray(tripMembers.teamId, allTeams.map((t) => t.id)))
        .orderBy(asc(tripMembers.nickname))
    : [];

  const roundMatches = await db
    .select({ matchId: matches.id, teeTimeId: matches.teeTimeId, format: matches.format })
    .from(matches)
    .where(eq(matches.roundId, round.id));

  const matchToTee = new Map(roundMatches.map((m) => [m.matchId, m.teeTimeId]));
  const participantRows = roundMatches.length
    ? await db
        .select()
        .from(matchParticipants)
        .where(inArray(matchParticipants.matchId, roundMatches.map((m) => m.matchId)))
    : [];
  const memberTeeTimeById = new Map<string, string | null>();
  for (const p of participantRows) {
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
      arcadePortraitUrl: m.arcadePortraitUrl,
      avatarUrl: m.memberAvatarUrl ?? m.userAvatarUrl,
    }));
  const builderTeams = allTeams.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  const builderTeeTimes = allTeeTimes.map((t) => ({ id: t.id, groupNumber: t.groupNumber }));

  const teeHasSlopeRating = await roundTeeHasSlopeRating(round.id);

  // Existing matches, grouped by participant for a compact summary row.
  const partsByMatch = new Map<string, typeof participantRows>();
  for (const p of participantRows) {
    const list = partsByMatch.get(p.matchId) ?? [];
    list.push(p);
    partsByMatch.set(p.matchId, list);
  }
  const memberById = new Map(allMembers.map((m) => [m.id, m]));

  return (
    <section className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="border-b border-zinc-200 dark:border-zinc-900 px-4 py-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500">
          Round {round.order}{round.label ? ` · ${round.label}` : ''}
        </p>
        <p className="mt-0.5 text-sm font-semibold">{courseName}</p>
      </div>

      <div className="space-y-2 p-4">
        {roundMatches.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No matches yet.</p>
        ) : (
          roundMatches.map((m) => {
            const parts = partsByMatch.get(m.matchId) ?? [];
            const names = parts.map((p) => memberById.get(p.tripMemberId)?.nickname ?? '?').join(', ');
            return (
              <div key={m.matchId} className="flex items-center gap-2 rounded-sm border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-black/30 px-3 py-2 text-[13px]">
                <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-400">
                  {FORMAT_META[m.format as FormatId]?.label ?? m.format}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{names}</span>
              </div>
            );
          })
        )}
      </div>

      <details className="border-t border-zinc-200 dark:border-zinc-900">
        <summary className="cursor-pointer px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:text-yellow-800 dark:hover:text-yellow-400">
          + Add match
        </summary>
        <div className="px-4 pb-4">
          <MatchBuilder
            tripSlug={tripSlug}
            roundId={round.id}
            teams={builderTeams}
            members={builderMembers}
            teeTimes={builderTeeTimes}
            defaultFormat={round.format as FormatId}
            redirectTo="none"
            teeHasSlopeRating={teeHasSlopeRating}
            defaultHandicapMethod={defaultHandicapMethod}
          />
        </div>
      </details>
    </section>
  );
}
