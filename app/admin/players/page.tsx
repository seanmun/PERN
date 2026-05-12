import { redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft, Pencil, User } from 'lucide-react';
import { db } from '@/db/client';
import { trips, tripMembers, teams } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';

export default async function AdminPlayersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.slug, 'pinehurst-cup-2026'))
    .limit(1);

  if (!trip) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <p className="text-zinc-400">Trip not found.</p>
      </div>
    );
  }

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);
  if (!canEdit) redirect('/admin');

  const teamsList = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, trip.id))
    .orderBy(asc(teams.name));
  const teamById = new Map(teamsList.map((t) => [t.id, t]));

  const players = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, trip.id))
    .orderBy(asc(tripMembers.nickname));

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Admin
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Players</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Upload photos, set handicaps, swap teams, mark captains, edit scouting reports.
      </p>

      <div className="mt-8 space-y-2">
        {players.map((p) => {
          const team = p.teamId ? teamById.get(p.teamId) ?? null : null;
          const color = team?.color ?? '#3f3f46';
          return (
            <Link
              key={p.id}
              href={`/admin/players/${p.id}/edit`}
              className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-950/40 p-3 hover:border-yellow-500/40 hover:bg-zinc-900/40"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-zinc-900">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
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
                  <p className="truncate font-semibold">{p.nickname}</p>
                  {p.isCaptain && (
                    <span
                      className="font-mono text-[9px] font-semibold uppercase tracking-widest"
                      style={{ color }}
                    >
                      Captain
                    </span>
                  )}
                  {p.role === 'trip_admin' && (
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-yellow-400">
                      Admin
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-zinc-500">
                  {team?.name ?? 'No team'} · {p.tripHandicap ?? '—'} hcp · {p.email}
                </p>
              </div>
              <Pencil size={14} className="shrink-0 text-zinc-500" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
