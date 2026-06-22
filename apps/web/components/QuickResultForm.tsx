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
  /** Strokes received over the full round (foursome-scratch derived). */
  strokesGiven: number;
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
  const sideA = participants.filter((p) => p.side === 'A');
  const sideB = participants.filter((p) => p.side === 'B');

  return (
    <form action={quickResultMatch} className="mt-6 space-y-6">
      <input type="hidden" name="matchId" value={matchId} />

      <SideSection
        label={sideALabel}
        color={sideA[0]?.teamColor ?? null}
        players={sideA}
        sideKey="A"
      />
      <SideSection
        label={sideBLabel}
        color={sideB[0]?.teamColor ?? null}
        players={sideB}
        sideKey="B"
      />

      <div className="grid grid-cols-2 gap-2">
        <a
          href={cancelHref}
          className="flex items-center justify-center rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Cancel
        </a>
        <button
          type="submit"
          className="rounded-sm bg-yellow-500 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400 disabled:opacity-40"
        >
          Save result
        </button>
      </div>
    </form>
  );
}

function SideSection({
  label,
  color,
  players,
  sideKey,
}: {
  label: string;
  color: string | null;
  players: Participant[];
  sideKey: 'A' | 'B';
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

      <div className="mt-3 space-y-4">
        {players.map((p) => (
          <PlayerRow key={p.tripMemberId} player={p} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
        <HolesWonInput
          label="F9 holes won"
          name={`f9won:${sideKey}`}
        />
        <HolesWonInput
          label="B9 holes won"
          name={`b9won:${sideKey}`}
        />
      </div>
    </section>
  );
}

function PlayerRow({ player }: { player: Participant }) {
  const [f9, setF9] = useState<string>('');
  const [b9, setB9] = useState<string>('');
  const f9n = Number(f9);
  const b9n = Number(b9);
  const total =
    Number.isFinite(f9n) && Number.isFinite(b9n) && f9 && b9 ? f9n + b9n : null;
  const net = total != null ? total - player.strokesGiven : null;

  return (
    <div className="rounded-sm bg-white/40 dark:bg-black/20 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-semibold">
          {player.nickname}
          {player.tripHandicap && (
            <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {player.tripHandicap} hcp · +{player.strokesGiven}
            </span>
          )}
        </p>
        <p className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {total != null ? (
            <>
              Gross <span className="text-zinc-900 dark:text-zinc-100">{total}</span>
              {' · '}
              Net <span className="text-yellow-700 dark:text-yellow-400">{net}</span>
            </>
          ) : (
            <span className="text-zinc-600">Enter both 9s</span>
          )}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NineInput
          label="Front 9"
          name={`f9gross:${player.tripMemberId}`}
          value={f9}
          onChange={setF9}
        />
        <NineInput
          label="Back 9"
          name={`b9gross:${player.tripMemberId}`}
          value={b9}
          onChange={setB9}
        />
      </div>
    </div>
  );
}

function NineInput({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        min={9}
        max={100}
        placeholder="—"
        className="w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-right font-mono text-base tabular-nums focus:border-yellow-500 focus:outline-none"
        required
      />
    </label>
  );
}

function HolesWonInput({ label, name }: { label: string; name: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        name={name}
        inputMode="numeric"
        min={0}
        max={9}
        defaultValue={0}
        className="w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-right font-mono text-base tabular-nums focus:border-yellow-500 focus:outline-none"
        required
      />
    </label>
  );
}
