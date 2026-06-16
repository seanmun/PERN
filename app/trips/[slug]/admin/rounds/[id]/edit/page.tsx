import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  rounds,
  courses,
  courseTees,
  teeTimes,
  teeTimeParticipants,
  matches,
  matchParticipants,
  tripMembers,
  teams,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import {
  formatTripTime,
  formatTripDayLong,
  roundFormatLabel,
} from '@/lib/format';
import DeleteRoundButton from '@/components/admin/DeleteRoundButton';
import DeleteTeeTimeButton from '@/components/admin/DeleteTeeTimeButton';
import FormatBadge from '@/components/FormatBadge';
import {
  InlineText,
  InlineDate,
  InlineChips,
  InlineCheckbox,
} from '@/components/admin/InlineRoundCard';
import { RoundProgress, type RoundStep } from '@/components/admin/RoundProgress';
import { updateRoundField } from '@/lib/actions/rounds';

export default async function EditRoundPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, id))
    .limit(1);
  if (!round) notFound();

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, round.tripId)) {
    redirect(`/trips/${slug}/schedule`);
  }

  const allCourses = await db
    .select()
    .from(courses)
    .orderBy(asc(courses.name));

  // Tees for the round's CURRENT course. If the admin swaps the course
  // (rare), they can save first then re-pick the tee.
  const teesForCourse = await db
    .select()
    .from(courseTees)
    .where(eq(courseTees.courseId, round.courseId))
    .orderBy(asc(courseTees.displayOrder));

  const teeTimesList = await db
    .select()
    .from(teeTimes)
    .where(eq(teeTimes.roundId, round.id))
    .orderBy(asc(teeTimes.groupNumber));

  const teeTimeIds = teeTimesList.map((tt) => tt.id);

  // Load EVERY match attached to this round, including cross-foursome
  // matches (tee_time_id = NULL) that the schedule's "Round-wide match"
  // button creates. Filtering by teeTimeIds alone hid those rows from
  // admin even though they exist and score correctly.
  const roundMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.roundId, id));

  const matchIds = roundMatches.map((m) => m.id);
  const participantsRows = matchIds.length
    ? await db
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
        .where(inArray(matchParticipants.matchId, matchIds))
    : [];

  const participantsByMatch = new Map<string, typeof participantsRows>();
  for (const p of participantsRows) {
    const list = participantsByMatch.get(p.participant.matchId) ?? [];
    list.push(p);
    participantsByMatch.set(p.participant.matchId, list);
  }

  // Tee time rosters — for the progress bar's "foursomes have rosters" step.
  const rosterRows = teeTimeIds.length
    ? await db
        .select({
          teeTimeId: teeTimeParticipants.teeTimeId,
          tripMemberId: teeTimeParticipants.tripMemberId,
        })
        .from(teeTimeParticipants)
        .where(inArray(teeTimeParticipants.teeTimeId, teeTimeIds))
    : [];
  const rosterCountByTeeTime = new Map<string, number>();
  for (const r of rosterRows) {
    rosterCountByTeeTime.set(r.teeTimeId, (rosterCountByTeeTime.get(r.teeTimeId) ?? 0) + 1);
  }

  // Per-round setup progress. Each step represents a piece of admin
  // work that has to be done for the round to be playable. Drives the
  // progress bar at the top of the page.
  const allFoursomesRostered =
    teeTimesList.length > 0 &&
    teeTimesList.every((tt) => (rosterCountByTeeTime.get(tt.id) ?? 0) >= 2);
  const progressSteps: RoundStep[] = [
    {
      id: 'date',
      label: 'Date set',
      done: round.date != null,
    },
    {
      id: 'course',
      label: 'Course assigned',
      done: round.courseId != null,
    },
    {
      id: 'tee-times',
      label: 'Tee times added',
      done: teeTimesList.length > 0,
      hint: teeTimesList.length === 0 ? 'add at least one group' : undefined,
    },
    {
      id: 'rosters',
      label: 'Foursomes have rosters',
      done: allFoursomesRostered,
      hint: allFoursomesRostered ? undefined : 'tap a group to assign',
    },
    {
      id: 'matches',
      label: 'Matches built',
      done: roundMatches.length > 0,
      hint: roundMatches.length === 0 ? 'add at least one matchup' : undefined,
    },
  ];

  const dateInputValue = round.date
    ? new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'America/New_York',
      }).format(round.date)
    : '';

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/schedule`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Schedule
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        Round {round.order}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        {round.label ?? roundFormatLabel(round.format)}
      </p>

      {/* Setup progress */}
      <div className="mt-6">
        <RoundProgress steps={progressSteps} />
      </div>

      {/* Round basics — inline-editable card. Tap any value to edit;
          auto-saves on blur / Enter. No submit button. */}
      <section className="mt-8 space-y-4 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
        <Row label="Label">
          <InlineText
            action={updateRoundField} hidden={{ id: round.id }}
            field="label"
            value={round.label}
            placeholder="Wed PM — Pine Needles"
          />
        </Row>

        <Row label="Date">
          <InlineDate action={updateRoundField} hidden={{ id: round.id }} field="date" value={dateInputValue} />
        </Row>

        <Row label="Course">
          <InlineChips
            action={updateRoundField} hidden={{ id: round.id }}
            field="courseId"
            value={round.courseId}
            options={allCourses.map((c) => ({
              value: c.id,
              label: c.name,
              sublabel: c.location ?? undefined,
            }))}
          />
          <Link
            href={`/trips/${slug}/admin/courses/${round.courseId}/edit`}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-400 hover:text-yellow-300"
          >
            Edit course holes →
          </Link>
        </Row>

        <Row
          label="Tee"
          hint={
            teesForCourse.length === 0
              ? 'This course has no tees defined yet. Add them under Admin → Courses.'
              : undefined
          }
        >
          {teesForCourse.length === 0 ? (
            <p className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-3 py-2 text-sm text-zinc-500">
              No tees on this course
            </p>
          ) : (
            <InlineChips
              action={updateRoundField} hidden={{ id: round.id }}
              field="courseTeeId"
              value={round.courseTeeId}
              allowEmpty
              emptyLabel={`Default${
                teesForCourse.find((t) => t.isDefault)
                  ? ` (${teesForCourse.find((t) => t.isDefault)!.name})`
                  : ''
              }`}
              options={teesForCourse.map((t) => ({
                value: t.id,
                label: t.name,
                sublabel: t.totalYardage != null ? `${t.totalYardage} yds` : undefined,
              }))}
            />
          )}
        </Row>

        <Row label="Default format" hint="Each match can override.">
          <InlineChips
            action={updateRoundField} hidden={{ id: round.id }}
            field="format"
            value={round.format}
            options={[
              { value: 'best_ball', label: 'Best Ball' },
              { value: 'two_man_aggregate', label: '2-Man Aggregate' },
              { value: 'singles', label: 'Singles' },
              { value: 'scramble', label: 'Scramble' },
              { value: 'stroke', label: 'Stroke' },
            ]}
          />
        </Row>

        <InlineCheckbox
          action={updateRoundField} hidden={{ id: round.id }}
          field="friendly"
          checked={!round.countsTowardCup}
          label="Friendly round"
          hint="Does not count toward the Cup."
        />
      </section>

      {/* Groups (tee times) */}
      <section className="mt-10">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
          Groups ({teeTimesList.length})
        </p>

        <div className="mt-3 space-y-3">
          {teeTimesList.length === 0 ? (
            <Link
              href={`/trips/${slug}/admin/tee-times/new?roundId=${round.id}`}
              className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-yellow-500/40 bg-yellow-500/5 px-4 py-6 font-mono text-xs font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:border-yellow-500/70 hover:bg-yellow-500/10"
            >
              <Plus size={14} strokeWidth={2.5} /> Add the first group
            </Link>
          ) : (
            teeTimesList.map((tt) => {
              const tteMatches = roundMatches.filter(
                (m) => m.teeTimeId === tt.id
              );
              return (
                <div
                  key={tt.id}
                  className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold tabular-nums text-yellow-800 dark:text-yellow-400">
                        {tt.time ? formatTripTime(tt.time) : '—:—'}
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                          Group {tt.groupNumber}
                        </span>
                      </p>
                      {tt.time && (
                        <p className="font-mono text-[10px] text-zinc-600">
                          {formatTripDayLong(tt.time)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        href={`/trips/${slug}/admin/tee-times/${tt.id}/edit`}
                        aria-label="Edit tee time"
                        className="rounded-sm border border-zinc-300 dark:border-zinc-800 p-1.5 text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/50 hover:text-yellow-400"
                      >
                        <Pencil size={12} />
                      </Link>
                      <DeleteTeeTimeButton teeTimeId={tt.id} />
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {tteMatches.length === 0 ? (
                      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                        No matchups
                      </p>
                    ) : (
                      tteMatches.map((m) => {
                        const parts = participantsByMatch.get(m.id) ?? [];
                        const byTeam = new Map<
                          string,
                          { color: string | null; nicknames: string[] }
                        >();
                        for (const p of parts) {
                          const entry =
                            byTeam.get(p.team.id) ??
                            { color: p.team.color, nicknames: [] };
                          entry.nicknames.push(p.member.nickname);
                          byTeam.set(p.team.id, entry);
                        }
                        const sides = Array.from(byTeam.values());
                        return (
                          <Link
                            key={m.id}
                            href={`/trips/${slug}/matches/${m.id}/edit`}
                            className="flex items-center justify-between gap-2 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-black/40 px-2 py-1.5 hover:border-yellow-500/40"
                          >
                            <FormatBadge format={m.format} size="xs" />
                            <p className="min-w-0 flex-1 truncate text-xs">
                              {sides.length === 2 ? (
                                <>
                                  <span style={{ color: sides[0].color ?? undefined }}>
                                    {sides[0].nicknames.join(' & ')}
                                  </span>
                                  <span className="mx-1.5 text-zinc-600">vs</span>
                                  <span style={{ color: sides[1].color ?? undefined }}>
                                    {sides[1].nicknames.join(' & ')}
                                  </span>
                                </>
                              ) : (
                                <span className="text-zinc-500">No participants</span>
                              )}
                            </p>
                            <Pencil size={10} className="shrink-0 text-zinc-600" />
                          </Link>
                        );
                      })
                    )}
                    <Link
                      href={`/trips/${slug}/matches/new?teeTimeId=${tt.id}`}
                      className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-yellow-500/40 bg-yellow-500/5 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:border-yellow-500/70 hover:bg-yellow-500/10"
                    >
                      <Plus size={12} strokeWidth={2.5} />
                      {tteMatches.length === 0
                        ? 'Add first matchup'
                        : `Add another matchup (Match ${tteMatches.length + 1})`}
                    </Link>
                  </div>
                </div>
              );
            })
          )}

          {teeTimesList.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href={`/trips/${slug}/admin/tee-times/new?roundId=${round.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-yellow-500/40 bg-yellow-500/5 px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:border-yellow-500/70 hover:bg-yellow-500/10"
              >
                <Plus size={14} strokeWidth={2.5} /> Add another group (Group {teeTimesList.length + 1})
              </Link>
              {/* Round-wide match = the cross-foursome case (e.g. 4v4
                  best ball drawing from every foursome). Same builder
                  as the per-tee-time link above, just scoped to the
                  round so the roster shows every player on the trip. */}
              <Link
                href={`/trips/${slug}/matches/new?roundId=${round.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
              >
                <Plus size={14} strokeWidth={2.5} /> Round-wide match (cross-foursome)
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Cross-foursome (round-wide) matches — tee_time_id = NULL. Listed
          separately because they don't belong under any single
          foursome. Common case: 4v4 best ball across two foursomes. */}
      {(() => {
        const crossFoursomeMatches = roundMatches.filter((m) => m.teeTimeId == null);
        if (crossFoursomeMatches.length === 0) return null;
        return (
          <section className="mt-10">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
              Round-wide matches ({crossFoursomeMatches.length})
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Matches that span multiple foursomes (e.g. 4v4 best ball
              drawing from every foursome). Scores propagate from the
              per-foursome scorecards via fan-out.
            </p>
            <div className="mt-3 space-y-2">
              {crossFoursomeMatches.map((m) => {
                const parts = participantsRows.filter((p) => p.participant.matchId === m.id);
                // Group participants by team so we can render the two
                // sides distinctly — same visual convention the
                // schedule + match-detail cards use.
                const byTeam = new Map<
                  string,
                  { team: typeof teams.$inferSelect; nicknames: string[] }
                >();
                for (const p of parts) {
                  const entry = byTeam.get(p.team.id) ?? { team: p.team, nicknames: [] };
                  entry.nicknames.push(p.member.nickname);
                  byTeam.set(p.team.id, entry);
                }
                const teamGroups = Array.from(byTeam.values());
                return (
                  <Link
                    key={m.id}
                    href={`/trips/${slug}/matches/${m.id}/edit`}
                    className="flex items-center justify-between gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3 hover:border-yellow-500/40 hover:bg-yellow-500/5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FormatBadge format={m.format} size="xs" />
                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                          {m.scoring === 'stableford' ? 'Stableford' : 'Match Play'}
                          {' · '}
                          {m.templateSizeA}v{m.templateSizeB}
                        </span>
                      </div>
                      {teamGroups.length === 0 ? (
                        <p className="mt-1.5 text-xs text-zinc-500">No participants</p>
                      ) : (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          {teamGroups.map((g, i) => {
                            const color = g.team.color ?? '#71717a';
                            return (
                              <span key={g.team.id} className="flex items-center gap-1.5">
                                {i > 0 && (
                                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                                    vs
                                  </span>
                                )}
                                <span
                                  className="font-semibold"
                                  style={{ color }}
                                >
                                  {g.nicknames.join(' · ')}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <Pencil size={10} className="shrink-0 text-zinc-600" />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })()}

      <div className="mt-12 border-t border-zinc-300 dark:border-zinc-800 pt-6">
        <DeleteRoundButton roundId={round.id} />
      </div>
    </div>
  );
}

/**
 * Inline-edit row. Compact label-above-value pattern shared by every
 * field on the round basics card. No form wrapper — each field's
 * onSave fires updateRoundField directly.
 */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}
