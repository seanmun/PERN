import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { getLeaderboard, type PlayerTotal } from '@/lib/data/leaderboard';

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

      <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        Individual leaderboard
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{trip.name}</h1>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {board.playerTotals.length} players
      </p>

      <div className="mt-6 overflow-hidden rounded-sm border border-zinc-800">
        {board.playerTotals.map((p, i) => (
          <PlayerRow key={p.tripMemberId} player={p} rank={i + 1} slug={slug} />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ player, rank, slug }: { player: PlayerTotal; rank: number; slug: string }) {
  const color = player.teamColor ?? '#71717a';
  const scoreLabel = formatScoreVsPar(player);
  const scoreColor =
    player.holesScored === 0
      ? 'text-zinc-600'
      : player.scoreVsPar < 0
        ? 'text-red-400'
        : player.scoreVsPar === 0
          ? 'text-zinc-100'
          : 'text-zinc-400';
  return (
    <Link
      href={`/trips/${slug}/profile/${player.tripMemberId}`}
      className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/40 px-3 py-2.5 last:border-b-0 hover:bg-zinc-900/40"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <p className="w-6 shrink-0 font-mono text-xs font-semibold tabular-nums text-zinc-500">
        {rank}
      </p>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{player.nickname}</p>
        {player.teamName && (
          <p
            className="font-mono text-[9px] font-semibold uppercase tracking-widest"
            style={{ color }}
          >
            {player.teamName}
          </p>
        )}
      </div>
      <p className="w-12 shrink-0 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {player.tripHandicap ? `${player.tripHandicap} hcp` : 'no hcp'}
      </p>
      <div className="w-20 shrink-0 text-right">
        <div className="flex items-baseline justify-end gap-1.5">
          <p className={`font-mono text-lg font-bold tabular-nums ${scoreColor}`}>
            {scoreLabel}
          </p>
          {player.holesScored > 0 && (
            <p className="font-mono text-xs tabular-nums text-zinc-600">
              {player.gross}
            </p>
          )}
        </div>
        {player.holesScored > 0 && (
          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            thru {player.holesScored}
          </p>
        )}
      </div>
      <ChevronRight size={12} className="shrink-0 text-zinc-700" />
    </Link>
  );
}

function formatScoreVsPar(p: PlayerTotal): string {
  if (p.holesScored === 0) return '—';
  if (p.scoreVsPar === 0) return 'E';
  if (p.scoreVsPar > 0) return `+${p.scoreVsPar}`;
  return String(p.scoreVsPar);
}
