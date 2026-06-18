import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds,
  courses,
  tripMembers,
  teams,
} from '@/db/schema';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { updateMatchParticipants } from '@/lib/actions/matches';
import DeleteMatchButton from '@/components/schedule/DeleteMatchButton';
import { roundFormatLabel } from '@/lib/format';

export default async function EditMatchPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const [match] = await db
    .select({ match: matches, round: rounds, course: courses })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(matches.id, id))
    .limit(1);

  if (!match) notFound();

  const canEdit =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, match.round.tripId);
  if (!canEdit) redirect(`/trips/${slug}/matches/${match.match.id}`);

  // Existing participants
  const existing = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, match.match.id));
  const selectedIds = new Set(existing.map((p) => p.tripMemberId));

  // All trip members grouped by team
  const allTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, match.round.tripId))
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
        href={`/trips/${slug}/matches/${match.match.id}`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Match
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Edit matchup</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Round {match.round.order} · {roundFormatLabel(match.round.format)} · {match.course.name}
      </p>

      <form action={updateMatchParticipants} className="mt-8 space-y-6">
        <input type="hidden" name="matchId" value={match.match.id} />

        <label className="block">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Format
          </span>
          <select
            name="format"
            defaultValue={match.match.format}
            className="mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
          >
            <option value="best_ball">Best Ball — 2v2 (lowest net per side)</option>
            <option value="two_man_aggregate">Two-Man Aggregate — 2v2 (sum of nets)</option>
            <option value="singles">Singles — 1v1 match play</option>
            <option value="scramble">Scramble</option>
            <option value="stroke">Stroke play</option>
          </select>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Changing the format resets this match&apos;s status — scores stay, but the result recomputes against the new rules on the next entry.
          </p>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Scoring
          </span>
          <select
            name="scoring"
            defaultValue={match.match.scoring}
            className="mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
          >
            <option value="match_play">Match Play — win holes vs opponent</option>
            <option value="stableford">Stableford — points per hole</option>
          </select>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            How the match is resolved. Stableford sums per-hole points; default scale is 4/3/2/1/0 (eagle / birdie / par / bogey / double+).
          </p>
        </label>

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
                {teamMembers.map((m) => {
                  const checked = selectedIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-3 py-2 text-sm hover:border-zinc-600 has-checked:border-yellow-500/60 has-checked:bg-yellow-500/10"
                    >
                      <input
                        type="checkbox"
                        name="participants"
                        value={m.id}
                        defaultChecked={checked}
                        className="h-4 w-4 accent-yellow-500"
                      />
                      <span className="truncate">{m.nickname}</span>
                    </label>
                  );
                })}
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
            Save matchup
          </button>
          <Link
            href={`/trips/${slug}/matches/${match.match.id}`}
            className="rounded-sm border border-zinc-400 dark:border-zinc-700 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>

      <div className="mt-6 border-t border-zinc-300 dark:border-zinc-800 pt-6">
        <DeleteMatchButton matchId={match.match.id} />
      </div>
    </div>
  );
}
