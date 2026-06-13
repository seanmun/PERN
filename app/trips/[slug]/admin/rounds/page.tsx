import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft, ChevronRight, Plus, Trophy } from 'lucide-react';
import { db } from '@/db/client';
import { rounds, courses } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { formatTripDayLong, roundFormatLabel } from '@/lib/format';

export default async function AdminRoundsPage({
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
    redirect(`/trips/${slug}/admin`);
  }

  const list = await db
    .select({ round: rounds, course: courses })
    .from(rounds)
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(rounds.tripId, trip.id))
    .orderBy(asc(rounds.order));

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Admin
      </Link>

      <div className="mt-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rounds</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Each round holds tee times + matchups. Delete cascades both.
          </p>
        </div>
        <Link
          href={`/trips/${slug}/admin/rounds/new`}
          className="shrink-0 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
        >
          <Plus className="inline" size={11} /> New
        </Link>
      </div>

      <div className="mt-8 space-y-2">
        {list.map(({ round, course }) => (
          <Link
            key={round.id}
            href={`/trips/${slug}/admin/rounds/${round.id}/edit`}
            className="flex items-center gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3 hover:border-yellow-500/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-zinc-100 dark:bg-zinc-900 font-mono text-lg font-bold text-yellow-800 dark:text-yellow-400">
              {round.order}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Trophy size={12} className="text-yellow-800 dark:text-yellow-500" />
                <p className="truncate font-semibold">
                  {round.label ?? `Round ${round.order}`}
                </p>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {course.name} · {roundFormatLabel(round.format)}
                {!round.countsTowardCup && ' · fun'}
              </p>
              {round.date && (
                <p className="text-xs text-zinc-500">
                  {formatTripDayLong(round.date)}
                </p>
              )}
            </div>
            <ChevronRight size={14} className="shrink-0 text-zinc-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}
