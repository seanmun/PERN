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
  matches,
  matchParticipants,
  tripMembers,
  teams,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateRound } from '@/lib/actions/rounds';
import {
  formatTripTime,
  formatTripDayLong,
  roundFormatLabel,
} from '@/lib/format';
import DeleteRoundButton from '@/components/admin/DeleteRoundButton';
import DeleteTeeTimeButton from '@/components/admin/DeleteTeeTimeButton';
import FormatBadge from '@/components/FormatBadge';

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

  const roundMatches = teeTimeIds.length
    ? await db
        .select()
        .from(matches)
        .where(inArray(matches.teeTimeId, teeTimeIds))
    : [];

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

      {/* Round basics */}
      <form action={updateRound} className="mt-8 space-y-5">
        <input type="hidden" name="id" value={round.id} />

        <Field label="Label">
          <input
            type="text"
            name="label"
            defaultValue={round.label ?? ''}
            placeholder="Wed PM — Pine Needles"
            className={inputCls}
          />
        </Field>

        <Field label="Date">
          <input
            type="date"
            name="date"
            defaultValue={dateInputValue}
            className={inputCls}
          />
        </Field>

        <Field label="Course" required>
          <select
            name="courseId"
            required
            defaultValue={round.courseId}
            className={inputCls}
          >
            {allCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.location ? ` · ${c.location}` : ''}
              </option>
            ))}
          </select>
          <Link
            href={`/trips/${slug}/admin/courses/${round.courseId}/edit`}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-400 hover:text-yellow-300"
          >
            Edit course holes →
          </Link>
        </Field>

        <Field
          label="Tee"
          hint={
            teesForCourse.length === 0
              ? 'This course has no tees defined yet. Add them under Admin → Courses.'
              : 'Which tee the round plays from. Leave blank to use the course default.'
          }
        >
          {teesForCourse.length === 0 ? (
            <p className={`${inputCls} cursor-not-allowed opacity-60`}>
              No tees on this course
            </p>
          ) : (
            <select
              name="courseTeeId"
              defaultValue={round.courseTeeId ?? ''}
              className={inputCls}
            >
              <option value="">
                Use course default
                {teesForCourse.find((t) => t.isDefault)
                  ? ` (${teesForCourse.find((t) => t.isDefault)!.name})`
                  : ''}
              </option>
              {teesForCourse.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.totalYardage != null ? ` · ${t.totalYardage} yds` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label="Default format for new matches"
          hint="Each match in this round can override its own format independently (Best Ball + Singles side-bet stacks etc.)."
          required
        >
          <select
            name="format"
            required
            defaultValue={round.format}
            className={inputCls}
          >
            <option value="best_ball">Best Ball — 2v2 (lowest net per side)</option>
            <option value="two_man_aggregate">Two-Man Aggregate — 2v2 (sum of nets)</option>
            <option value="singles">Singles — 1v1 match play</option>
            <option value="scramble">Scramble</option>
            <option value="stroke">Stroke play</option>
          </select>
        </Field>

        <label className="flex items-start gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-3 py-3">
          <input
            type="checkbox"
            name="friendly"
            defaultChecked={!round.countsTowardCup}
            className="mt-0.5 h-4 w-4 accent-yellow-500"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-800 dark:text-zinc-200">
              Friendly round
            </span>
            <span className="block text-[11px] text-zinc-500">
              Does not count toward the Cup.
            </span>
          </span>
        </label>

        <button
          type="submit"
          className="w-full rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
        >
          Save round
        </button>
      </form>

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

      <div className="mt-12 border-t border-zinc-300 dark:border-zinc-800 pt-6">
        <DeleteRoundButton roundId={round.id} />
      </div>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
        {required && <span className="ml-1 text-yellow-800 dark:text-yellow-500">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-zinc-500">{hint}</p>}
    </label>
  );
}
