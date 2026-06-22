'use client';

import { useState } from 'react';
import { quickResultMatch } from '@/lib/actions/quick-result';

type Participant = {
  tripMemberId: string;
  nickname: string;
  teamName: string | null;
  teamColor: string | null;
  side: 'A' | 'B';
  tripHandicap: string | null;
};

export default function QuickResultForm({
  matchId,
  participants,
  sideALabel,
  sideBLabel,
  cancelHref,
}: {
  matchId: string;
  participants: Participant[];
  sideALabel: string;
  sideBLabel: string;
  cancelHref: string;
}) {
  const [winner, setWinner] = useState<'A' | 'B' | 'halved' | ''>('');
  const sideA = participants.filter((p) => p.side === 'A');
  const sideB = participants.filter((p) => p.side === 'B');

  return (
    <form action={quickResultMatch} className="mt-6 space-y-6">
      <input type="hidden" name="matchId" value={matchId} />

      <Section label={sideALabel} color={sideA[0]?.teamColor ?? null} players={sideA} />
      <Section label={sideBLabel} color={sideB[0]?.teamColor ?? null} players={sideB} />

      <fieldset className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
        <legend className="px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
          Winner
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <WinnerOption
            value="A"
            label={sideALabel}
            color={sideA[0]?.teamColor ?? null}
            active={winner === 'A'}
            onChange={() => setWinner('A')}
          />
          <WinnerOption
            value="halved"
            label="Halved"
            color={null}
            active={winner === 'halved'}
            onChange={() => setWinner('halved')}
          />
          <WinnerOption
            value="B"
            label={sideBLabel}
            color={sideB[0]?.teamColor ?? null}
            active={winner === 'B'}
            onChange={() => setWinner('B')}
          />
        </div>
        <input type="hidden" name="winner" value={winner} />
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <a
          href={cancelHref}
          className="flex items-center justify-center rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={!winner}
          className="rounded-sm bg-yellow-500 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400 disabled:opacity-40"
        >
          Save result
        </button>
      </div>
    </form>
  );
}

function Section({
  label,
  color,
  players,
}: {
  label: string;
  color: string | null;
  players: Participant[];
}) {
  const c = color ?? '#71717a';
  return (
    <section
      className="rounded-sm border p-4"
      style={{ borderColor: `${c}55`, background: `${c}0a` }}
    >
      <p className="font-mono text-[10px] font-semibold uppercase tracking-widest" style={{ color: c }}>
        {label}
      </p>
      <div className="mt-2 space-y-2">
        {players.map((p) => (
          <label key={p.tripMemberId} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate font-semibold">
              {p.nickname}
              {p.tripHandicap && (
                <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {p.tripHandicap} hcp
                </span>
              )}
            </span>
            <input
              type="number"
              name={`total:${p.tripMemberId}`}
              inputMode="numeric"
              min={18}
              max={200}
              placeholder="Total"
              className="w-24 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-right font-mono text-base tabular-nums focus:border-yellow-500 focus:outline-none"
              required
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function WinnerOption({
  value,
  label,
  color,
  active,
  onChange,
}: {
  value: 'A' | 'B' | 'halved';
  label: string;
  color: string | null;
  active: boolean;
  onChange: () => void;
}) {
  const c = color ?? '#a16207';
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={active}
      className={`rounded-sm border px-3 py-3 font-mono text-[11px] font-bold uppercase tracking-widest ${
        active
          ? 'border-transparent text-black'
          : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-500'
      }`}
      style={
        active
          ? { background: c, boxShadow: `0 0 0 2px ${c}55` }
          : undefined
      }
      data-value={value}
    >
      {label}
    </button>
  );
}
