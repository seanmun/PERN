import { notFound, redirect } from 'next/navigation';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  rounds,
  courses,
  teeTimes,
  teeTimeParticipants,
  tripMembers,
  teams,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { canViewTrip, isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createRound } from '@/lib/actions/rounds';
import WizardShell from '@/components/admin/EventWizard/WizardShell';
import GroupsStepClient from '@/components/admin/EventWizard/GroupsStepClient';
import { FORMAT_META, type FormatId } from '@buddycup/scoring/formats';
import Link from 'next/link';

const inputCls =
  'mt-1.5 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';
const labelCls =
  'block font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500';

const TRIP_TZ = 'America/New_York';

function toDateInputValue(d: Date | null): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TRIP_TZ }).format(d);
}

/** Date → "YYYY-MM-DDTHH:MM" on the trip's wall clock, for datetime-local. */
function toDateTimeLocal(d: Date | null): string | null {
  if (!d) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TRIP_TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

export default async function SetupGroupsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');
  if (!canViewTrip(ctx)) notFound();
  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, trip.id)) {
    redirect(`/trips/${slug}/admin/players`);
  }

  const tripRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tripId, trip.id))
    .orderBy(asc(rounds.order));

  const allCourses = await db.select().from(courses).orderBy(asc(courses.name));

  return (
    <div className="pb-24">
      <WizardShell active="groups" tripSlug={slug} />
      <div className="mx-auto max-w-xl px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Tee groups.</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Add a round for each day/course you&apos;re playing, then build the
          foursomes inside it.
        </p>

        <div className="mt-6 space-y-6">
          {tripRounds.map((round) => (
            <RoundBlock key={round.id} tripId={trip.id} tripSlug={slug} round={round} courseName={allCourses.find((c) => c.id === round.courseId)?.name ?? 'Unknown course'} />
          ))}
        </div>

        <AddRoundForm
          tripId={trip.id}
          tripSlug={slug}
          allCourses={allCourses}
          nextOrder={tripRounds.length + 1}
          singleDayDate={trip.kind !== 'trip' ? toDateInputValue(trip.startDate) : null}
        />

        <div className="mt-8 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-900 pt-6">
          <Link
            href={`/trips/${slug}/setup/teams`}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
          >
            ← Teams
          </Link>
          <Link
            href={`/trips/${slug}/setup/matches`}
            className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400"
          >
            Matches →
          </Link>
        </div>
      </div>
    </div>
  );
}

async function RoundBlock({
  tripId,
  tripSlug,
  round,
  courseName,
}: {
  tripId: string;
  tripSlug: string;
  round: typeof rounds.$inferSelect;
  courseName: string;
}) {
  const roundTeeTimes = await db
    .select()
    .from(teeTimes)
    .where(eq(teeTimes.roundId, round.id))
    .orderBy(asc(teeTimes.groupNumber));

  const tripTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, tripId))
    .orderBy(asc(teams.name));
  const teamById = new Map(tripTeams.map((t) => [t.id, t]));

  const allMembers = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId))
    .orderBy(asc(tripMembers.nickname));

  const rosterRows = roundTeeTimes.length
    ? await db
        .select()
        .from(teeTimeParticipants)
        .where(
          inArray(
            teeTimeParticipants.teeTimeId,
            roundTeeTimes.map((t) => t.id),
          ),
        )
    : [];
  const assignByMember: Record<string, string | null> = {};
  for (const m of allMembers) assignByMember[m.id] = null;
  for (const r of rosterRows) assignByMember[r.tripMemberId] = r.teeTimeId;

  const clientGroups = roundTeeTimes.map((tt) => ({
    id: tt.id,
    groupNumber: tt.groupNumber,
    timeLocal: toDateTimeLocal(tt.time),
  }));
  const clientMembers = allMembers.map((m) => {
    const team = m.teamId ? teamById.get(m.teamId) ?? null : null;
    return {
      id: m.id,
      nickname: m.nickname,
      teamId: m.teamId,
      teamName: team?.name ?? null,
      teamColor: team?.color ?? null,
      tripHandicap: m.tripHandicap,
    };
  });

  return (
    <section className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 dark:border-zinc-900 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500">
            Round {round.order}{round.label ? ` · ${round.label}` : ''} ·{' '}
            {FORMAT_META[round.format as FormatId]?.label ?? round.format}
          </p>
          <p className="mt-0.5 text-sm font-semibold">{courseName}</p>
        </div>
        <Link
          href={`/trips/${tripSlug}/admin/rounds/${round.id}/edit`}
          className="shrink-0 rounded-sm border border-zinc-400 dark:border-zinc-700 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:border-yellow-500/40 hover:text-yellow-400"
        >
          Edit round
        </Link>
      </div>

      <div className="p-4">
        <GroupsStepClient
          roundId={round.id}
          roundFormat={round.format}
          groups={clientGroups}
          members={clientMembers}
          initialAssign={assignByMember}
        />
      </div>
    </section>
  );
}


function AddRoundForm({
  tripId,
  tripSlug,
  allCourses,
  nextOrder,
  singleDayDate,
}: {
  tripId: string;
  tripSlug: string;
  allCourses: (typeof courses.$inferSelect)[];
  nextOrder: number;
  // For outing/match kind there's only one day for the whole event — the
  // date already picked on the Details step. Don't ask again; just carry
  // it through as a hidden field. Trip kind keeps the visible picker
  // since its rounds legitimately span different days.
  singleDayDate: string | null;
}) {
  void tripSlug;
  void nextOrder;
  return (
    <details className="mt-6 rounded-sm border border-dashed border-zinc-300 dark:border-zinc-700">
      <summary className="cursor-pointer px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:text-yellow-800 dark:hover:text-yellow-400">
        + Add a round
      </summary>
      <form action={createRound} className="space-y-3 px-4 pb-4">
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="redirectTo" value="none" />
        {/* Outing/match kind: one course, one round, no need to name it.
            Trip kind keeps the label — useful once there's a "Wed AM"
            and a "Wed PM" round on the same day. */}
        {!singleDayDate && (
          <label className="block">
            <span className={labelCls}>Label</span>
            <input type="text" name="label" placeholder="Wed PM — Pine Needles" className={inputCls} />
          </label>
        )}
        {singleDayDate ? (
          <input type="hidden" name="date" value={singleDayDate} />
        ) : (
          <label className="block">
            <span className={labelCls}>Date</span>
            <input type="date" name="date" className={inputCls} />
          </label>
        )}
        <label className="block">
          <span className={labelCls}>Course *</span>
          <select name="courseId" required className={inputCls} defaultValue="">
            <option value="" disabled>— pick a course —</option>
            {allCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Default format *</span>
          <select name="format" required className={inputCls} defaultValue="best_ball">
            <option value="best_ball">Best Ball — 2v2</option>
            <option value="two_man_aggregate">Two-Man Aggregate — 2v2</option>
            <option value="singles">Singles — 1v1</option>
            <option value="scramble">Scramble</option>
            <option value="stroke">Stroke play</option>
            <option value="thirty_ball">30 Ball — 3v3</option>
            <option value="bingo_bango_bongo">Bingo Bango Bongo</option>
          </select>
        </label>
        <button
          type="submit"
          className="w-full rounded-sm bg-yellow-500 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
        >
          Create round
        </button>
      </form>
    </details>
  );
}
