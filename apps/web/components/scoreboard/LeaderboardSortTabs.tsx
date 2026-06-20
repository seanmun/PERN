'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlayerTotal } from '@/lib/data/leaderboard';

type SortMode = 'net' | 'stroke' | 'stableford';

const STORAGE_KEY = 'leaderboard-sort-mode';

export default function LeaderboardSortTabs({
  players,
  slug,
  maxRows,
}: {
  players: PlayerTotal[];
  slug: string;
  /** Optional cap — sort first, THEN slice (so the top-N reflects the
   * current sort, not a fixed default-sort top-N). */
  maxRows?: number;
}) {
  const [mode, setMode] = useState<SortMode>('net');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored === 'net' || stored === 'stroke' || stored === 'stableford') {
      setMode(stored);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, hydrated]);

  const sortedFull = [...players].sort((a, b) => {
    const aNoScore = a.holesScored === 0;
    const bNoScore = b.holesScored === 0;
    if (aNoScore && bNoScore) return a.nickname.localeCompare(b.nickname);
    if (aNoScore) return 1;
    if (bNoScore) return -1;
    if (mode === 'stroke') {
      if (a.gross !== b.gross) return a.gross - b.gross;
    } else if (mode === 'stableford') {
      if (a.stablefordPoints !== b.stablefordPoints)
        return b.stablefordPoints - a.stablefordPoints;
    } else {
      if (a.scoreVsPar !== b.scoreVsPar) return a.scoreVsPar - b.scoreVsPar;
    }
    return a.nickname.localeCompare(b.nickname);
  });
  const sorted = maxRows ? sortedFull.slice(0, maxRows) : sortedFull;

  return (
    <>
      <div className="mt-3 inline-flex rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black p-0.5">
        <SortBtn label="Net" active={mode === 'net'} onClick={() => setMode('net')} />
        <SortBtn label="Stroke" active={mode === 'stroke'} onClick={() => setMode('stroke')} />
        <SortBtn label="Stableford" active={mode === 'stableford'} onClick={() => setMode('stableford')} />
      </div>

      <div className="mt-3 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800">
        {sorted.map((p, i) => (
          <PlayerRow key={p.tripMemberId} player={p} rank={i + 1} slug={slug} mode={mode} />
        ))}
      </div>
    </>
  );
}

function SortBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest ${
        active ? 'bg-yellow-500 text-black' : 'text-zinc-500'
      }`}
    >
      {label}
    </button>
  );
}

function PlayerRow({
  player,
  rank,
  slug,
  mode,
}: {
  player: PlayerTotal;
  rank: number;
  slug: string;
  mode: SortMode;
}) {
  const color = player.teamColor ?? '#71717a';
  const pct = Math.min(100, Math.round((player.holesScored / 18) * 100));
  return (
    <Link
      href={`/trips/${slug}/profile/${player.tripMemberId}`}
      className="relative block border-b border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 last:border-b-0 hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <p className="w-6 shrink-0 font-mono text-xs font-semibold tabular-nums text-zinc-500">
          {rank}
        </p>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{player.nickname}</p>
          {player.teamName && (
            <p className="font-mono text-[9px] font-semibold uppercase tracking-widest" style={{ color }}>
              {player.teamName}
            </p>
          )}
        </div>
        <p className="w-14 shrink-0 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {player.holesScored > 0
            ? `+${player.strokesGiven}`
            : player.tripHandicap
              ? `${player.tripHandicap} hcp`
              : '—'}
        </p>
        <ScoreTriplet player={player} mode={mode} />
        <ChevronRight size={12} className="shrink-0 text-zinc-700" />
      </div>
      {/* Thin progress bar across the bottom of the row — fills as the
          player completes holes. Replaces the "thru N" text that pushed
          the row taller. */}
      <div className="h-0.5 w-full bg-zinc-200 dark:bg-zinc-900">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </Link>
  );
}

/** All three scores in one block: Net / Stroke / Stableford. Active sort
 * mode is bolded yellow; others are dim. Holes-played label sits below. */
function ScoreTriplet({ player, mode }: { player: PlayerTotal; mode: SortMode }) {
  const noScore = player.holesScored === 0;
  const netLabel = noScore
    ? '—'
    : player.scoreVsPar === 0
      ? 'E'
      : player.scoreVsPar > 0
        ? `+${player.scoreVsPar}`
        : String(player.scoreVsPar);
  return (
    <div className="shrink-0 text-right">
      <div className="grid grid-cols-3 items-baseline gap-2 font-mono tabular-nums">
        <Cell label="Net" value={netLabel} active={mode === 'net'} sub={noScore ? null : String(player.gross)} />
        <Cell label="Strk" value={noScore ? '—' : String(player.gross)} active={mode === 'stroke'} sub={null} />
        <Cell
          label="Stbl"
          value={noScore ? '—' : String(player.stablefordPoints)}
          active={mode === 'stableford'}
          sub={null}
        />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  active,
  sub,
}: {
  label: string;
  value: string;
  active: boolean;
  sub: string | null;
}) {
  return (
    <div className="flex flex-col items-end">
      <p
        className={`text-[8px] font-semibold uppercase tracking-widest ${
          active ? 'text-yellow-700 dark:text-yellow-400' : 'text-zinc-500'
        }`}
      >
        {label}
      </p>
      <p
        className={`text-base font-bold leading-none ${
          active ? 'text-yellow-700 dark:text-yellow-400' : 'text-zinc-700 dark:text-zinc-300'
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[9px] tabular-nums text-zinc-600">
          {sub}
        </p>
      )}
    </div>
  );
}
