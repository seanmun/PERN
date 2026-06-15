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
  teeTimeParticipants,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateTeeTime, updateTeeTimeRoster } from '@/lib/actions/tee-times';

const TRIP_TZ = 'America/New_York';

function toWallTimeInput(d: Date | null | undefined): string {
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TRIP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

export default async function EditTeeTimePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const [row] = await db
    .select({ teeTime: teeTimes, round: rounds, course: courses })
    .from(teeTimes)
    .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(teeTimes.id, id))
    .limit(1);
  if (!row) notFound();

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, row.round.tripId)) {
    redirect(`/trips/${slug}/schedule`);
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin/rounds/${row.round.id}/edit`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Round {row.round.order}
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Edit tee time</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Round {row.round.order} · {row.course.name}
      </p>

      <RosterEditor teeTimeId={row.teeTime.id} tripId={row.round.tripId} />

      <form action={updateTeeTime} className="mt-10 space-y-5">
        <input type="hidden" name="id" value={row.teeTime.id} />

        <Field label="Time" required>
          <input
            type="datetime-local"
            name="time"
            required
            defaultValue={toWallTimeInput(row.teeTime.time)}
            className={inputCls}
          />
        </Field>

        <Field label="Group number" required>
          <input
            type="number"
            name="groupNumber"
            required
            min={1}
            max={99}
            defaultValue={row.teeTime.groupNumber}
            className={inputCls}
          />
        </Field>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Save tee time
          </button>
          <Link
            href={`/trips/${slug}/admin/rounds/${row.round.id}/edit`}
            className="rounded-sm border border-zinc-400 dark:border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
        {required && <span className="ml-1 text-yellow-800 dark:text-yellow-500">*</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * Foursome roster checkbox group. Persists to tee_time_participants
 * via updateTeeTimeRoster. Renders all trip members grouped by team
 * with the current foursome members pre-checked.
 */
async function RosterEditor({
  teeTimeId,
  tripId,
}: {
  teeTimeId: string;
  tripId: string;
}) {
  const tripTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, tripId))
    .orderBy(asc(teams.name));

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
    .where(eq(teeTimeParticipants.teeTimeId, teeTimeId));
  const checked = new Set(existing.map((e) => e.tripMemberId));

  return (
    <section className="mt-8">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
        Foursome roster ({existing.length})
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">
        Who's physically in this group. Every checked player shows on
        the scorecard regardless of which matches they're in.
      </p>

      <form action={updateTeeTimeRoster} className="mt-4 space-y-3">
        <input type="hidden" name="teeTimeId" value={teeTimeId} />

        {tripTeams.map((team) => {
          const teamMembers = allMembers.filter((m) => m.teamId === team.id);
          const color = team.color ?? '#71717a';
          return (
            <section
              key={team.id}
              className="rounded-sm border p-3"
              style={{ borderColor: `${color}55`, background: `${color}0a` }}
            >
              <p
                className="font-mono text-[10px] font-semibold uppercase tracking-widest"
                style={{ color }}
              >
                {team.name}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {teamMembers.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-2.5 py-1.5 text-sm hover:border-zinc-600 has-checked:border-yellow-500/60 has-checked:bg-yellow-500/10"
                  >
                    <input
                      type="checkbox"
                      name="memberIds"
                      value={m.id}
                      defaultChecked={checked.has(m.id)}
                      className="h-4 w-4 accent-yellow-500"
                    />
                    <span className="truncate">{m.nickname}</span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}

        <button
          type="submit"
          className="w-full rounded-sm bg-yellow-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
        >
          Save roster
        </button>
      </form>
    </section>
  );
}
