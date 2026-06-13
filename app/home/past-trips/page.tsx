import { redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft, ChevronRight, User as UserIcon } from 'lucide-react';
import { db } from '@/db/client';
import { trips, tripMembers } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';

export default async function PastTripsPage() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in');

  const { user } = ctx;

  const memberships = await db
    .select({
      tripId: tripMembers.tripId,
      role: tripMembers.role,
      isCaptain: tripMembers.isCaptain,
      nickname: tripMembers.nickname,
      tripName: trips.name,
      tripSlug: trips.slug,
      tripImageUrl: trips.imageUrl,
      startDate: trips.startDate,
      endDate: trips.endDate,
    })
    .from(tripMembers)
    .innerJoin(trips, eq(tripMembers.tripId, trips.id))
    .where(eq(tripMembers.userId, user.id))
    .orderBy(asc(trips.startDate));

  const today = getTripLocalToday();
  const past = memberships
    .filter((m) => m.endDate && m.endDate < today)
    .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime());

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Home
      </Link>

      <header className="mt-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
          Past trips
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {past.length} trip{past.length === 1 ? '' : 's'} in the books
        </h1>
      </header>

      <div className="mt-8 space-y-2">
        {past.length === 0 ? (
          <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-6 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No past trips yet.</p>
          </div>
        ) : (
          past.map((m) => (
            <Link
              key={m.tripId}
              href={`/trips/${m.tripSlug}/schedule`}
              className="flex items-center gap-3 rounded-sm border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/20 p-4 opacity-60 transition-colors hover:border-zinc-700 hover:bg-zinc-950/40 hover:opacity-90"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-900 text-zinc-500">
                {m.tripImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.tripImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserIcon size={18} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-700 dark:text-zinc-300">{m.tripName}</p>
                <p className="truncate font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  {[
                    formatDates(m.startDate, m.endDate),
                    m.nickname,
                    m.role === 'trip_admin'
                      ? 'Admin'
                      : m.isCaptain
                        ? 'Captain'
                        : 'Player',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <ChevronRight size={14} className="shrink-0 text-zinc-600" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function getTripLocalToday(): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = fmt.format(new Date());
  return new Date(`${today}T00:00:00-04:00`);
}

function formatDates(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  const s = new Intl.DateTimeFormat('en-US', opts).format(start);
  if (!end) return s;
  const e = new Intl.DateTimeFormat('en-US', opts).format(end);
  return `${s} – ${e}`;
}
