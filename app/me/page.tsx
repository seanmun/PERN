import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams, trips } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import SignOutLink from '@/components/SignOutLink';

export default async function MePage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect('/sign-in');
  }

  const { user, tripMember, isPlatformAdmin } = ctx;

  let team: typeof teams.$inferSelect | null = null;
  let trip: typeof trips.$inferSelect | null = null;
  if (tripMember?.teamId) {
    [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, tripMember.teamId))
      .limit(1);
  }
  if (tripMember?.tripId) {
    [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripMember.tripId))
      .limit(1);
  }

  if (!tripMember) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-yellow-400">
            Not on the roster
          </p>
          <p className="mt-3 text-zinc-300">
            You&apos;re signed in, but <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm">{user.email}</code>{' '}
            isn&apos;t on the Pinehurst Cup roster.
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            Ask the trip admin to add you, or sign in with the email already on your slot.
          </p>
        </div>
      </div>
    );
  }

  const teamColor = team?.color ?? '#3f3f46';
  const role = tripMember.role === 'trip_admin' ? 'Trip Admin' : 'Player';

  return (
    <div className="mx-auto max-w-md px-4 pb-16">
      <div
        className="-mx-4 relative px-4 pt-10 pb-8"
        style={{
          background: `linear-gradient(180deg, ${teamColor}22 0%, transparent 100%)`,
          borderBottom: `2px solid ${teamColor}`,
        }}
      >
        <Link
          href="/me/edit"
          aria-label="Edit profile"
          className="absolute right-4 top-4 rounded-sm border border-zinc-800 bg-black/50 p-2 text-zinc-400 hover:border-yellow-500/50 hover:text-yellow-400"
        >
          <Pencil size={14} />
        </Link>

        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={tripMember.nickname}
            className="mb-4 h-24 w-24 rounded-sm object-cover"
            style={{ boxShadow: `0 0 0 3px ${teamColor}` }}
          />
        ) : (
          <div
            className="mb-4 flex h-24 w-24 items-center justify-center rounded-sm bg-zinc-900 font-mono text-2xl font-bold text-zinc-500"
            style={{ boxShadow: `0 0 0 3px ${teamColor}` }}
          >
            {tripMember.nickname.slice(0, 1).toUpperCase()}
          </div>
        )}

        <p
          className="font-mono text-xs font-semibold uppercase tracking-[0.3em]"
          style={{ color: teamColor }}
        >
          {team?.name}
        </p>
        <h1 className="mt-2 text-5xl font-bold tracking-tight">
          {tripMember.nickname}
        </h1>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Stat label="Trip handicap" value={tripMember.tripHandicap ?? '—'} accent={teamColor} />
        <Stat label="Status" value={tripMember.isCaptain ? 'Captain' : role} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pill label={role.toUpperCase()} />
        {tripMember.isCaptain && <Pill label="CAPTAIN" accent={teamColor} />}
        {isPlatformAdmin && <Pill label="PLATFORM ADMIN" accent="#f59e0b" />}
      </div>

      <div className="mt-10 border-t border-zinc-800 pt-6 text-sm text-zinc-500">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-600">
          Trip
        </p>
        <p className="mt-1 text-zinc-300">{trip?.name}</p>
        {trip?.startDate && trip?.endDate && (
          <p className="text-xs text-zinc-500">
            {formatTripDates(trip.startDate, trip.endDate)}
          </p>
        )}
      </div>

      <p className="mt-10 text-xs text-zinc-600">Signed in as {user.email}</p>

      <div className="mt-4">
        <SignOutLink />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p
        className="mt-1 text-3xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function Pill({ label, accent }: { label: string; accent?: string }) {
  if (accent) {
    return (
      <span
        className="rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest"
        style={{ backgroundColor: `${accent}33`, color: accent, border: `1px solid ${accent}66` }}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300">
      {label}
    </span>
  );
}

function formatTripDates(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  const yearFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/New_York' });
  return `${fmt.format(start)} – ${fmt.format(end)}, ${yearFmt.format(end)}`;
}
