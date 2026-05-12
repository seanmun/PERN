import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trips } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { getLeaderboard, type PlayerTotal, type TeamTotal } from '@/lib/data/leaderboard';

export default async function ScoreboardPage() {
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

  const board = await getLeaderboard(trip.id);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
        Cup standings
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{trip.name}</h1>

      <TeamScoreRow teams={board.teamTotals} />

      <p className="mt-4 text-center font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {board.matchesContested} of {board.matchesTotal} matches in the books · {board.pointsAvailable} pts left
      </p>

      <section className="mt-10">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
          Individual leaderboard
        </p>
        <div className="mt-3 overflow-hidden rounded-sm border border-zinc-800">
          {board.playerTotals.map((p, i) => (
            <PlayerRow key={p.tripMemberId} player={p} rank={i + 1} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamScoreRow({ teams }: { teams: TeamTotal[] }) {
  if (teams.length !== 2) return null;
  const [a, b] = teams;
  return (
    <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
      <TeamSide team={a} align="left" />
      <div className="flex items-center justify-center">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-600">
          vs
        </span>
      </div>
      <TeamSide team={b} align="right" />
    </div>
  );
}

function TeamSide({ team, align }: { team: TeamTotal; align: 'left' | 'right' }) {
  const color = team.teamColor ?? '#71717a';
  return (
    <div
      className="rounded-sm border p-5"
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
    </div>
  );
}

function PlayerRow({ player, rank }: { player: PlayerTotal; rank: number }) {
  const color = player.teamColor ?? '#71717a';
  return (
    <div
      className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/40 px-3 py-2.5 last:border-b-0"
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
      <p className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-500">
        {player.tripHandicap ?? '—'}
      </p>
      <p className="w-12 shrink-0 text-right font-mono text-lg font-bold tabular-nums text-yellow-400">
        {formatPoints(player.points)}
      </p>
    </div>
  );
}

function formatPoints(p: number): string {
  const whole = Math.floor(p);
  const half = Math.round((p - whole) * 2);
  if (half === 0) return String(whole);
  if (half === 1) return whole === 0 ? '½' : `${whole}½`;
  return String(p);
}
