import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teeTimes, rounds, courses } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateTeeTime } from '@/lib/actions/tee-times';

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

      <form action={updateTeeTime} className="mt-8 space-y-5">
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
            className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

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
        {required && <span className="ml-1 text-yellow-500">*</span>}
      </span>
      {children}
    </label>
  );
}
