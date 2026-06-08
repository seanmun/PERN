import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import { getLeaderboard, type PlayerTotal, type TeamTotal } from '@/lib/data/leaderboard';

export default async function ScoreboardPage({
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
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        Cup standings
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{trip.name}</h1>

      <TeamScoreRow teams={board.teamTotals} slug={slug} />

      <p className="mt-4 text-center font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {board.matchesContested} of {board.matchesTotal} matches in the books · {board.pointsAvailable} pts left
      </p>

      <section className="mt-10">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
          Individual leaderboard
        </p>
        <div className="mt-3 overflow-hidden rounded-sm border border-zinc-800">
          {board.playerTotals.map((p, i) => (
            <PlayerRow key={p.tripMemberId} player={p} rank={i + 1} slug={slug} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamScoreRow({ teams, slug }: { teams: TeamTotal[]; slug: string }) {
  if (teams.length !== 2) return null;
  const [a, b] = teams;
  return (
    <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
      <TeamSide team={a} align="left" slug={slug} />
      <div className="flex items-center justify-center">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600">
          vs
        </span>
      </div>
      <TeamSide team={b} align="right" slug={slug} />
    </div>
  );
}

function TeamSide({ team, align, slug }: { team: TeamTotal; align: 'left' | 'right'; slug: string }) {
  const color = team.teamColor ?? '#71717a';
  return (
    <div
      className="flex flex-col rounded-sm border p-5"
      style={{
        borderColor: `${color}66`,
        background: `linear-gradient(180deg, ${color}22 0%, transparent 100%)`,
        textAlign: align,
      }}
    >
      <p
        className="font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
        style={{ color }}
      >
        {team.teamName}
      </p>
      <p
        className="mt-2 font-bold tabular-nums leading-none"
        style={{
          color,
          fontSize: '4rem',
          textShadow: `0 0 24px ${color}55`,
        }}
      >
        {formatPoints(team.points)}
      </p>
      <Link
        href={`/trips/${slug}/teams/${team.teamId}`}
        className={`mt-4 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:text-yellow-400 ${
          align === 'right' ? 'ml-auto' : ''
        }`}
      >
        View team →
      </Link>
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

function formatPoints(p: number): string {
  const whole = Math.floor(p);
  const half = Math.round((p - whole) * 2);
  if (half === 0) return String(whole);
  if (half === 1) return whole === 0 ? '½' : `${whole}½`;
  return String(p);
}

function formatScoreVsPar(p: PlayerTotal): string {
  if (p.holesScored === 0) return '—';
  if (p.scoreVsPar === 0) return 'E';
  if (p.scoreVsPar > 0) return `+${p.scoreVsPar}`;
  return String(p.scoreVsPar);
}
