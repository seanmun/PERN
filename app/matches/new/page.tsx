import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  teeTimes,
  rounds,
  courses,
  tripMembers,
  teams,
} from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { createMatch } from '@/lib/actions/matches';
import {
  formatTripTime,
  formatTripDayLong,
  roundFormatLabel,
} from '@/lib/format';

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ teeTimeId?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const { teeTimeId } = await searchParams;
  if (!teeTimeId) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <p className="text-zinc-400">Missing teeTimeId.</p>
      </div>
    );
  }

  const [teeTime] = await db
    .select({ teeTime: teeTimes, round: rounds, course: courses })
    .from(teeTimes)
    .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(teeTimes.id, teeTimeId))
    .limit(1);

  if (!teeTime) notFound();

  const canEdit =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, teeTime.round.tripId);
  if (!canEdit) redirect('/schedule');

  const allTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, teeTime.round.tripId))
    .orderBy(asc(teams.name));

  const allMembers = allTeams.length
    ? await db
        .select()
        .from(tripMembers)
        .where(inArray(tripMembers.teamId, allTeams.map((t) => t.id)))
        .orderBy(asc(tripMembers.nickname))
    : [];

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-6">
      <Link
        href="/schedule"
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Schedule
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">New matchup</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Round {teeTime.round.order} · {roundFormatLabel(teeTime.round.format)} · {teeTime.course.name}
      </p>
      {teeTime.teeTime.time && (
        <p className="mt-0.5 font-mono text-xs text-zinc-500">
          {formatTripDayLong(teeTime.teeTime.time)} · {formatTripTime(teeTime.teeTime.time)} · Group {teeTime.teeTime.groupNumber}
        </p>
      )}

      <form action={createMatch} className="mt-8 space-y-6">
        <input type="hidden" name="teeTimeId" value={teeTime.teeTime.id} />

        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Players
        </p>

        {allTeams.map((team) => {
          const teamMembers = allMembers.filter((m) => m.teamId === team.id);
          const color = team.color ?? '#71717a';
          return (
            <section
              key={team.id}
              className="rounded-sm border p-4"
              style={{ borderColor: `${color}55`, background: `${color}0a` }}
            >
              <p
                className="font-mono text-[10px] font-semibold uppercase tracking-widest"
                style={{ color }}
              >
                {team.name}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {teamMembers.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm hover:border-zinc-600 has-checked:border-yellow-500/60 has-checked:bg-yellow-500/10"
                  >
                    <input
                      type="checkbox"
                      name="participants"
                      value={m.id}
                      className="h-4 w-4 accent-yellow-500"
                    />
                    <span className="truncate">{m.nickname}</span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}

        <p className="text-[11px] text-zinc-500">
          Tip: pick 1 from each team for singles, 2 from each for 2v2.
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400"
          >
            Create matchup
          </button>
          <Link
            href="/schedule"
            className="rounded-sm border border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
