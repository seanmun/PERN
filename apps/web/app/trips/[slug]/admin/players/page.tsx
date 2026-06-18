import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft, Pencil, Plus, User } from 'lucide-react';
import { db } from '@/db/client';
import { tripMembers, teams, users } from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import MemberAvatar from '@/components/avatar/MemberAvatar';
import PlayerInviteButton from '@/components/admin/PlayerInviteButton';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { getBuddies } from '@/lib/data/buddies';
import { addBuddyToTrip } from '@/lib/actions/players';

export default async function AdminPlayersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const canEdit = isPlatformAdmin(ctx) || isTripAdminOf(ctx, trip.id);
  if (!canEdit) redirect(`/trips/${slug}/admin`);

  const teamsList = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, trip.id))
    .orderBy(asc(teams.name));
  const teamById = new Map(teamsList.map((t) => [t.id, t]));

  const playerRows = await db
    .select({
      player: tripMembers,
      arcadePortraitUrl: users.arcadePortraitUrl,
    })
    .from(tripMembers)
    .leftJoin(users, eq(tripMembers.userId, users.id))
    .where(eq(tripMembers.tripId, trip.id))
    .orderBy(asc(tripMembers.nickname));
  const players = playerRows.map((r) => ({
    ...r.player,
    arcadePortraitUrl: r.arcadePortraitUrl,
  }));

  // Buddy list — anyone the current admin has played with before,
  // excluding the people already on this trip so the chip list only
  // shows fresh adds. Ranked by overlap count, top 12 shown.
  const existingUserIds = players
    .map((p) => p.userId)
    .filter((id): id is string => !!id);
  const buddies = (await getBuddies(ctx.user.id, existingUserIds)).slice(0, 12);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link
        href={`/trips/${slug}/admin`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Admin
      </Link>

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Players</h1>
        <Link
          href={`/trips/${slug}/admin/players/new`}
          className="inline-flex items-center gap-1.5 rounded-sm bg-yellow-500 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
        >
          <Plus size={12} strokeWidth={2.5} />
          Add player
        </Link>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Upload photos, set handicaps, swap teams, mark captains, edit scouting reports.
      </p>

      {buddies.length > 0 && (
        <section className="mt-6 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              Buddies
            </p>
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              tap to add
            </p>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            People you've played with before, ranked by how often. One tap pre-fills nickname + handicap.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {buddies.map((b) => (
              <form key={b.userId} action={addBuddyToTrip}>
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="userId" value={b.userId} />
                <input type="hidden" name="nickname" value={b.recentNickname} />
                {b.recentHandicap && (
                  <input type="hidden" name="handicap" value={b.recentHandicap} />
                )}
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors hover:border-yellow-500/40 hover:bg-yellow-500/10"
                >
                  <Plus size={11} strokeWidth={2.5} className="text-yellow-800 dark:text-yellow-400" />
                  <span>{b.recentNickname}</span>
                  <span className="font-mono text-[9px] font-normal text-zinc-500 tabular-nums">
                    ×{b.matchesPlayedTogether}
                  </span>
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      {players.length === 0 && (
        <div className="mt-8 rounded-sm border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-6 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No players yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Tap “Add player” above to start the roster.
          </p>
        </div>
      )}

      <div className="mt-8 space-y-2">
        {players.map((p) => {
          const team = p.teamId ? teamById.get(p.teamId) ?? null : null;
          const color = team?.color ?? '#3f3f46';
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3 hover:border-yellow-500/40"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <Link
                href={`/trips/${slug}/admin/players/${p.id}/edit`}
                className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90"
              >
                <MemberAvatar
                  nickname={p.nickname}
                  arcadePortraitUrl={p.arcadePortraitUrl}
                  avatarUrl={p.avatarUrl}
                  teamColor={color}
                  size={48}
                />
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
                      <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-400">
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-zinc-500">
                    {team?.name ?? 'No team'} · {p.tripHandicap ?? '—'} hcp · {p.email ?? 'no email'}
                  </p>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <PlayerInviteButton
                  tripMemberId={p.id}
                  hasEmail={Boolean(p.email)}
                />
                <Link
                  href={`/trips/${slug}/admin/players/${p.id}/edit`}
                  aria-label="Edit player"
                  className="rounded-sm border border-zinc-300 dark:border-zinc-800 p-1.5 text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/40 hover:text-yellow-400"
                >
                  <Pencil size={12} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
