import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Plane, PlaneTakeoff, PlaneLanding, User } from 'lucide-react';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, teams } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { formatTripDayLong, formatTripTime } from '@/lib/format';

export default async function FlightsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const teamsList = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, trip.id));
  const teamById = new Map(teamsList.map((t) => [t.id, t]));

  const members = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, trip.id))
    .orderBy(asc(tripMembers.nickname));

  // Sort: arrivals first (by arrival time), then players with no flight info at the end.
  const sorted = [...members].sort((a, b) => {
    const ah = a.flightArrivalAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bh = b.flightArrivalAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ah !== bh) return ah - bh;
    return a.nickname.localeCompare(b.nickname);
  });

  const withFlights = sorted.filter(
    (m) =>
      m.flightArrivalAt ||
      m.flightDepartureAt ||
      m.flightArrivalDetails ||
      m.flightDepartureDetails
  );
  const withoutFlights = sorted.filter(
    (m) =>
      !m.flightArrivalAt &&
      !m.flightDepartureAt &&
      !m.flightArrivalDetails &&
      !m.flightDepartureDetails
  );

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">
      <div className="flex items-center gap-2">
        <Plane size={16} className="text-yellow-500" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
          Flights
        </p>
      </div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Travel coordination</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Sorted by arrival time. Update yours under <Link href={`/trips/${slug}/me/edit`} className="text-yellow-400 hover:text-yellow-300">/me/edit</Link>.
      </p>

      <section className="mt-8">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
          Confirmed flights ({withFlights.length})
        </p>
        <div className="mt-3 space-y-2">
          {withFlights.length === 0 ? (
            <p className="text-sm text-zinc-500">No flights logged yet.</p>
          ) : (
            withFlights.map((m) => (
              <FlightCard key={m.id} member={m} teamById={teamById} slug={slug} />
            ))
          )}
        </div>
      </section>

      {withoutFlights.length > 0 && (
        <section className="mt-8">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
            Still TBD ({withoutFlights.length})
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {withoutFlights.map((m) => {
              const team = m.teamId ? teamById.get(m.teamId) ?? null : null;
              const color = team?.color ?? '#3f3f46';
              return (
                <Link
                  key={m.id}
                  href={`/trips/${slug}/profile/${m.id}`}
                  className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-2 hover:border-yellow-500/40"
                >
                  <div
                    className="h-8 w-8 shrink-0 overflow-hidden rounded-sm bg-zinc-900"
                    style={{ boxShadow: `0 0 0 2px ${color}` }}
                  >
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-600">
                        <User size={12} />
                      </div>
                    )}
                  </div>
                  <span className="text-sm">{m.nickname}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function FlightCard({
  member,
  teamById,
  slug,
}: {
  member: typeof tripMembers.$inferSelect;
  teamById: Map<string, typeof teams.$inferSelect>;
  slug: string;
}) {
  const team = member.teamId ? teamById.get(member.teamId) ?? null : null;
  const color = team?.color ?? '#3f3f46';

  return (
    <Link
      href={`/trips/${slug}/profile/${member.id}`}
      className="block rounded-sm border border-zinc-800 bg-zinc-950/40 p-3 hover:border-yellow-500/40 hover:bg-zinc-900/40"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-zinc-900"
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        >
          {member.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-600">
              <User size={16} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-lg font-semibold leading-tight">{member.nickname}</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FlightLeg
              icon={<PlaneLanding size={12} className="text-emerald-400" />}
              label="Arrive"
              at={member.flightArrivalAt}
              details={member.flightArrivalDetails}
            />
            <FlightLeg
              icon={<PlaneTakeoff size={12} className="text-zinc-400" />}
              label="Depart"
              at={member.flightDepartureAt}
              details={member.flightDepartureDetails}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function FlightLeg({
  icon,
  label,
  at,
  details,
}: {
  icon: React.ReactNode;
  label: string;
  at: Date | null;
  details: string | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
          {label}
        </p>
      </div>
      {at ? (
        <>
          <p className="mt-1 text-xs text-zinc-300">{formatTripDayLong(at)}</p>
          <p className="font-mono text-xs tabular-nums text-yellow-400">{formatTripTime(at)}</p>
        </>
      ) : (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          —
        </p>
      )}
      {details && <p className="mt-1 text-xs text-zinc-400">{details}</p>}
    </div>
  );
}
