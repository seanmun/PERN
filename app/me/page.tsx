import { redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq, isNotNull } from 'drizzle-orm';
import { ChevronRight, User as UserIcon } from 'lucide-react';
import { db } from '@/db/client';
import { trips, tripMembers } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import SignOutLink from '@/components/SignOutLink';

export default async function GlobalMePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const { user, isPlatformAdmin } = ctx;

  // Trips the user is a member of (lazy-claim matches by userId once the
  // tripMember row has been stitched, which getAuthContext does on first load).
  const memberships = await db
    .select({
      tripId: tripMembers.tripId,
      role: tripMembers.role,
      isCaptain: tripMembers.isCaptain,
      nickname: tripMembers.nickname,
      tripName: trips.name,
      tripSlug: trips.slug,
      startDate: trips.startDate,
      endDate: trips.endDate,
    })
    .from(tripMembers)
    .innerJoin(trips, eq(tripMembers.tripId, trips.id))
    .where(eq(tripMembers.userId, user.id))
    .orderBy(asc(trips.startDate));

  // Platform admins also see trips they're NOT on (godmode).
  let otherTrips: Array<{ id: string; name: string; slug: string }> = [];
  if (isPlatformAdmin) {
    const memberTripIds = new Set(memberships.map((m) => m.tripId));
    const all = await db
      .select({ id: trips.id, name: trips.name, slug: trips.slug })
      .from(trips)
      .where(isNotNull(trips.id))
      .orderBy(asc(trips.startDate));
    otherTrips = all.filter((t) => !memberTripIds.has(t.id));
  }

  const displayName = user.displayName ?? user.fullName ?? user.email;
  const initial = (user.displayName ?? user.fullName ?? user.email)
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-zinc-900 ring-2 ring-zinc-700">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-mono text-2xl font-bold text-zinc-400">
              {initial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
            Signed in
          </p>
          <h1 className="mt-1 truncate text-xl font-bold">{displayName}</h1>
          <p className="truncate text-xs text-zinc-500">{user.email}</p>
        </div>
      </header>

      <section className="mt-10">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
          Your trips
        </p>

        {memberships.length === 0 ? (
          <div className="mt-3 rounded-sm border border-zinc-800 bg-zinc-950/40 p-6 text-center">
            <p className="text-sm text-zinc-400">You&apos;re not on any trips yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              A trip admin needs to add you, or you need an invite link.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {memberships.map((m) => (
              <TripCard
                key={m.tripId}
                href={`/trips/${m.tripSlug}/schedule`}
                name={m.tripName}
                dates={formatDates(m.startDate, m.endDate)}
                nickname={m.nickname}
                role={
                  m.role === 'trip_admin'
                    ? 'Admin'
                    : m.isCaptain
                      ? 'Captain'
                      : 'Player'
                }
              />
            ))}
          </div>
        )}

        {isPlatformAdmin && otherTrips.length > 0 && (
          <>
            <p className="mt-8 font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
              Platform admin · other trips
            </p>
            <div className="mt-3 space-y-2">
              {otherTrips.map((t) => (
                <TripCard
                  key={t.id}
                  href={`/trips/${t.slug}/schedule`}
                  name={t.name}
                  dates={null}
                  nickname={null}
                  role="Platform"
                />
              ))}
            </div>
          </>
        )}
      </section>

      <div className="mt-12 flex items-center justify-between border-t border-zinc-800 pt-6">
        <SignOutLink />
      </div>
    </div>
  );
}

function TripCard({
  href,
  name,
  dates,
  nickname,
  role,
}: {
  href: string;
  name: string;
  dates: string | null;
  nickname: string | null;
  role: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-950/40 p-4 hover:border-yellow-500/40 hover:bg-zinc-900/40"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-zinc-900 text-yellow-500">
        <UserIcon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {[dates, nickname, role].filter(Boolean).join(' · ')}
        </p>
      </div>
      <ChevronRight size={14} className="shrink-0 text-zinc-600" />
    </Link>
  );
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
