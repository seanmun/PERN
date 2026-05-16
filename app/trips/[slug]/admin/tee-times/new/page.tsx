import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { rounds, courses } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createTeeTime } from '@/lib/actions/tee-times';

export default async function NewTeeTimePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ roundId?: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const { roundId } = await searchParams;
  if (!roundId) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <p className="text-zinc-400">Missing roundId.</p>
      </div>
    );
  }

  const [row] = await db
    .select({ round: rounds, course: courses })
    .from(rounds)
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!row) notFound();

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, row.round.tripId)) {
    redirect(`/trips/${slug}/schedule`);
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin/rounds/${roundId}/edit`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Round {row.round.order}
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">New tee time</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Round {row.round.order} · {row.course.name}
      </p>

      <form action={createTeeTime} className="mt-8 space-y-5">
        <input type="hidden" name="roundId" value={roundId} />

        <Field label="Time" required>
          <input
            type="datetime-local"
            name="time"
            required
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
            placeholder="1"
            className={inputCls}
          />
        </Field>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Add tee time
          </button>
          <Link
            href={`/trips/${slug}/admin/rounds/${roundId}/edit`}
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
