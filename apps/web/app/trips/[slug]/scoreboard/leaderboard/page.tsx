import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { getLeaderboard } from '@/lib/data/leaderboard';
import LeaderboardSortTabs from '@/components/scoreboard/LeaderboardSortTabs';

/**
 * Full individual leaderboard. The /scoreboard view truncates to the top 12
 * once an outing or trip gets large; this is the unfiltered list.
 */
export default async function FullLeaderboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const board = await getLeaderboard(trip.id);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">
      <Link
        href={`/trips/${slug}/scoreboard`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Cup
      </Link>

      <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-800 dark:text-yellow-500">
        Individual leaderboard
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{trip.name}</h1>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {board.playerTotals.length} players
      </p>

      <LeaderboardSortTabs players={board.playerTotals} slug={slug} />
    </div>
  );
}
