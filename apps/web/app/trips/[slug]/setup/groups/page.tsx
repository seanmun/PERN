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
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createRound } from '@/lib/actions/rounds';
import { createTeeTime, updateTeeTimeRoster } from '@/lib/actions/tee-times';
import WizardShell from '@/components/admin/EventWizard/WizardShell';

const inputCls =
  'mt-1.5 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';
const labelCls =
  'block font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500';

const TRIP_TZ = 'America/New_York';

function toDateInputValue(d: Date | null): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TRIP_TZ }).format(d);
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
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
          Step 5
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Tee groups.</h1>
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
          <a
            href={`/trips/${slug}/setup/teams`}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 hover:text-zinc-300"
          >
            ← Teams
          </a>
          <a
            href={`/trips/${slug}/setup/matches`}
            className="rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.4)] hover:bg-yellow-400"
          >
            Continue →
          </a>
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

  return (
    <section className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="border-b border-zinc-200 dark:border-zinc-900 px-4 py-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-yellow-800 dark:text-yellow-500">
          Round {round.order}{round.label ? ` · ${round.label}` : ''}
        </p>
        <p className="mt-0.5 text-sm font-semibold">{courseName}</p>
      </div>

      <div className="space-y-4 p-4">
        {roundTeeTimes.length === 0 && (
          <p className="text-[13px] text-zinc-500">No groups yet — add one below.</p>
        )}
        {roundTeeTimes.map((tt) => (
          <GroupRosterEditor key={tt.id} tripId={tripId} tripSlug={tripSlug} roundId={round.id} teeTime={tt} />
        ))}

        <form action={createTeeTime} className="flex items-end gap-2 border-t border-zinc-200 dark:border-zinc-900 pt-4">
          <input type="hidden" name="roundId" value={round.id} />
          <input type="hidden" name="redirectTo" value="none" />
          <label className="flex-1">
            <span className={labelCls}>Group #</span>
            <input type="number" name="groupNumber" min={1} max={99} defaultValue={roundTeeTimes.length + 1} required className={inputCls} />
          </label>
          <label className="flex-1">
            <span className={labelCls}>Tee time</span>
            <input type="datetime-local" name="time" className={inputCls} />
          </label>
          <button
            type="submit"
            className="rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
          >
            + Group
          </button>
        </form>
      </div>
    </section>
  );
}

async function GroupRosterEditor({
  tripId,
  tripSlug,
  roundId,
  teeTime,
}: {
  tripId: string;
  tripSlug: string;
  roundId: string;
  teeTime: typeof teeTimes.$inferSelect;
}) {
  void tripSlug;
  const tripTeams = await db.select().from(teams).where(eq(teams.tripId, tripId)).orderBy(asc(teams.name));
  const allMembers = tripTeams.length
    ? await db
        .select()
        .from(tripMembers)
        .where(inArray(tripMembers.teamId, tripTeams.map((t) => t.id)))
        .orderBy(asc(tripMembers.nickname))
    : [];

  const existing = await db
    .select({ tripMemberId: teeTimeParticipants.tripMemberId })
    .from(teeTimeParticipants)
    .where(eq(teeTimeParticipants.teeTimeId, teeTime.id));
  const checked = new Set(existing.map((e) => e.tripMemberId));

  // Players already rostered to a DIFFERENT tee time in the same round —
  // greyed out + disabled so a group can't double-book someone (same
  // rule as the classic per-tee-time roster editor).
  const sisterTeeTimes = await db.select({ id: teeTimes.id }).from(teeTimes).where(eq(teeTimes.roundId, roundId));
  const sisterIds = sisterTeeTimes.map((t) => t.id).filter((id) => id !== teeTime.id);
  const elsewhereRows = sisterIds.length
    ? await db
        .select({ tripMemberId: teeTimeParticipants.tripMemberId })
        .from(teeTimeParticipants)
        .where(inArray(teeTimeParticipants.teeTimeId, sisterIds))
    : [];
  const elsewhere = new Set(elsewhereRows.map((r) => r.tripMemberId));

  return (
    <form action={updateTeeTimeRoster} className="rounded-sm border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-black/30 p-3">
      <input type="hidden" name="teeTimeId" value={teeTime.id} />
      <input type="hidden" name="redirectTo" value="none" />
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Group {teeTime.groupNumber} · {checked.size}/4
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {allMembers.map((m) => {
          const inOther = elsewhere.has(m.id);
          return (
            <label
              key={m.id}
              className={
                inOther
                  ? 'flex items-center gap-2 rounded-sm border border-zinc-200 dark:border-zinc-900 bg-zinc-100/60 dark:bg-zinc-950/20 px-2.5 py-1.5 text-sm opacity-40 cursor-not-allowed'
                  : 'flex cursor-pointer items-center gap-2 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-2.5 py-1.5 text-sm hover:border-zinc-600 has-checked:border-yellow-500/60 has-checked:bg-yellow-500/10'
              }
              title={inOther ? 'Already in another group this round' : undefined}
            >
              <input
                type="checkbox"
                name="memberIds"
                value={m.id}
                defaultChecked={checked.has(m.id)}
                disabled={inOther}
                className="h-4 w-4 accent-yellow-500"
              />
              <span className="truncate">{m.nickname}</span>
            </label>
          );
        })}
      </div>
      <button
        type="submit"
        className="mt-2 w-full rounded-sm bg-yellow-500 px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
      >
        Save roster
      </button>
    </form>
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
