import { redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq, isNotNull } from 'drizzle-orm';
import { CalendarDays, ChevronRight, Plus, Sun, User as UserIcon, Users } from 'lucide-react';
import MemberAvatar from '@/components/avatar/MemberAvatar';
import { db } from '@/db/client';
import { trips, tripMembers } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { claimTripMember, listClaimableSlots } from '@/lib/actions/claim';
import SignOutLink from '@/components/SignOutLink';

export default async function GlobalMePage() {
  const ctx = await getGlobalAuthContext();
  if (!ctx) redirect('/sign-in');

  const { user, isPlatformAdmin } = ctx;

  // Trips the user is a member of (lazy-claim matches by userId once the
  // tripMember row has been stitched, which getGlobalAuthContext does on first load).
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

  // Split memberships into current (upcoming or in-flight) and past
  // (endDate strictly before today, trip-TZ). Trips without an endDate are
  // treated as current — they're not over yet.
  const today = getTripLocalToday();
  const currentMemberships = memberships.filter(
    (m) => !m.endDate || m.endDate >= today
  );
  const pastMemberships = memberships
    .filter((m) => m.endDate && m.endDate < today)
    // Most-recent past trip first.
    .sort((a, b) => (b.endDate!.getTime() - a.endDate!.getTime()));
  const PAST_TRIPS_VISIBLE = 5;
  const pastVisible = pastMemberships.slice(0, PAST_TRIPS_VISIBLE);
  const pastHidden = pastMemberships.length - pastVisible.length;

  // Any tripMember rows whose email matches the user but never got claimed.
  // Auto-claim usually handles this on sign-in; this catches anyone the
  // admin added AFTER first sign-in or any case-different stragglers.
  const claimableSlots = await listClaimableSlots();

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
        <MemberAvatar
          nickname={displayName}
          arcadePortraitUrl={user.arcadePortraitUrl ?? null}
          avatarUrl={user.avatarUrl ?? null}
          size={72}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
            Signed in
          </p>
          <h1 className="mt-1 truncate text-xl font-bold">{displayName}</h1>
          {user.username && (
            <p className="truncate font-mono text-[11px] text-zinc-500">
              @{user.username}
            </p>
          )}
          <p className="truncate text-xs text-zinc-600">{user.email}</p>
        </div>
        <Link
          href="/me"
          className="shrink-0 rounded-sm border border-zinc-700 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:border-yellow-500/50 hover:text-yellow-400"
        >
          Edit
        </Link>
      </header>

      {user.handicap && (
        <div className="mt-4 flex items-baseline gap-2 rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Default handicap
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-zinc-100">
            {user.handicap}
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            Used on new trips
          </span>
        </div>
      )}

      {(user.clubName || user.city || user.state) && (
        <div className="mt-3 rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-3 text-sm text-zinc-300">
          {user.clubName && (
            <p>
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                Club
              </span>{' '}
              <span className="text-zinc-200">{user.clubName}</span>
            </p>
          )}
          {(user.city || user.state) && (
            <p className="mt-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                Hometown
              </span>{' '}
              <span className="text-zinc-200">
                {[user.city, user.state].filter(Boolean).join(', ')}
              </span>
            </p>
          )}
        </div>
      )}

      {claimableSlots.length > 0 && (
        <section className="mt-8">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-400">
            Pending claims · {claimableSlots.length}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Trip admins added you to these but the slot hasn&apos;t been linked to your account yet. Claim it to make changes.
          </p>
          <div className="mt-3 space-y-2">
            {claimableSlots.map((s) => (
              <form
                key={s.tripMemberId}
                action={claimTripMember}
                className="flex items-center gap-3 rounded-sm border border-emerald-700/40 bg-emerald-950/20 p-3"
              >
                <input type="hidden" name="tripMemberId" value={s.tripMemberId} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-100">
                    {s.tripName}
                  </p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    as {s.nickname}
                  </p>
                </div>
                <button
                  type="submit"
                  className="shrink-0 rounded-sm border border-emerald-500/60 bg-emerald-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20"
                >
                  Claim
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
          Your trips
        </p>

        <div className="mt-3 space-y-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-600">
            Start something new
          </p>
          <div className="grid grid-cols-3 gap-2">
            <NewKindButton
              href="/trips/new?kind=trip"
              icon={<CalendarDays size={18} strokeWidth={2} />}
              label="Trip"
              hint="Multi-day"
            />
            <NewKindButton
              href="/trips/new?kind=outing"
              icon={<Sun size={18} strokeWidth={2} />}
              label="Outing"
              hint="1 day · groups"
            />
            <NewKindButton
              href="/trips/new?kind=match"
              icon={<Users size={18} strokeWidth={2} />}
              label="Match"
              hint="2–4 players"
            />
          </div>

          {currentMemberships.length === 0 ? (
            <div className="rounded-sm border border-zinc-800 bg-zinc-950/40 p-6 text-center">
              <p className="text-sm text-zinc-400">No upcoming trips yet.</p>
              <p className="mt-1 text-xs text-zinc-600">
                A trip admin needs to add you, or you need an invite link.
              </p>
            </div>
          ) : (
            currentMemberships.map((m) => (
              <TripCard
                key={m.tripId}
                href={`/trips/${m.tripSlug}/schedule`}
                name={m.tripName}
                imageUrl={m.tripImageUrl}
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
            ))
          )}
        </div>

        {pastMemberships.length > 0 && (
          <div className="mt-10">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
              Past trips
            </p>
            <div className="mt-3 space-y-2">
              {pastVisible.map((m) => (
                <TripCard
                  key={m.tripId}
                  href={`/trips/${m.tripSlug}/schedule`}
                  name={m.tripName}
                  imageUrl={m.tripImageUrl}
                  dates={formatDates(m.startDate, m.endDate)}
                  nickname={m.nickname}
                  role={
                    m.role === 'trip_admin'
                      ? 'Admin'
                      : m.isCaptain
                        ? 'Captain'
                        : 'Player'
                  }
                  muted
                />
              ))}
              {pastHidden > 0 && (
                <Link
                  href="/home/past-trips"
                  className="block rounded-sm border border-zinc-900 bg-zinc-950/40 px-4 py-3 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500 transition-colors hover:border-yellow-500/40 hover:text-yellow-400"
                >
                  View all {pastMemberships.length} past trips →
                </Link>
              )}
            </div>
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

function NewKindButton({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-yellow-500/40 bg-zinc-950/40 p-3 text-center transition-colors hover:border-yellow-500/70 hover:bg-yellow-500/5"
    >
      <span className="text-yellow-500">{icon}</span>
      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-yellow-400">
        {label}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {hint}
      </p>
    </Link>
  );
}

function TripCard({
  href,
  name,
  imageUrl,
  dates,
  nickname,
  role,
  muted,
}: {
  href: string;
  name: string;
  imageUrl?: string | null;
  dates: string | null;
  nickname: string | null;
  role: string;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        muted
          ? 'flex items-center gap-3 rounded-sm border border-zinc-900 bg-zinc-950/20 p-4 opacity-60 transition-colors hover:border-zinc-700 hover:bg-zinc-950/40 hover:opacity-90'
          : 'flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-950/40 p-4 hover:border-yellow-500/40 hover:bg-zinc-900/40'
      }
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-zinc-900 ${
          muted ? 'text-zinc-500' : 'text-yellow-500'
        }`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserIcon size={18} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={muted ? 'truncate font-semibold text-zinc-300' : 'truncate font-semibold'}>
          {name}
        </p>
        <p className="truncate font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {[dates, nickname, role].filter(Boolean).join(' · ')}
        </p>
      </div>
      <ChevronRight size={14} className="shrink-0 text-zinc-600" />
    </Link>
  );
}

function getTripLocalToday(): Date {
  // Today at 00:00 in America/New_York, returned as a UTC Date so it can be
  // compared with the timestamptz columns Drizzle returns.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = fmt.format(new Date()); // e.g. "2026-05-18"
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
