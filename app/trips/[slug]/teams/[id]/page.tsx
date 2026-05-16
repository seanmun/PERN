import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, User } from 'lucide-react';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams, tripMembers } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, id))
    .limit(1);

  if (!team) notFound();

  const roster = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.teamId, team.id))
    .orderBy(asc(tripMembers.nickname));

  const color = team.color ?? '#3f3f46';

  return (
    <div className="pb-24">
      <section
        className="-mt-px overflow-hidden border-b"
        style={{
          background: `linear-gradient(180deg, ${color}33 0%, transparent 100%)`,
          borderBottomColor: `${color}99`,
        }}
      >
        <div className="mx-auto max-w-md px-4 pb-10 pt-6">
          <Link
            href={`/trips/${slug}/scoreboard`}
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400 hover:text-yellow-400"
          >
            <ArrowLeft size={12} /> Scoreboard
          </Link>

          <p
            className="mt-6 font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color }}
          >
            Team
          </p>
          <h1
            className="mt-2 text-4xl font-bold tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
            style={{ color }}
          >
            {team.name}
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-zinc-400">
            {roster.length} players
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="space-y-2">
          {roster.map((m) => (
            <Link
              key={m.id}
              href={`/trips/${slug}/profile/${m.id}`}
              className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-950/40 p-3 hover:border-yellow-500/40 hover:bg-zinc-900/40"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-zinc-900">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-600">
                    <User size={18} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-lg font-semibold">{m.nickname}</p>
                  {m.isCaptain && (
                    <span
                      className="font-mono text-[9px] font-semibold uppercase tracking-widest"
                      style={{ color }}
                    >
                      Captain
                    </span>
                  )}
                </div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {m.tripHandicap ? `${m.tripHandicap} hcp` : 'Handicap TBD'}
                </p>
              </div>
              <ChevronRight size={14} className="shrink-0 text-zinc-700" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
