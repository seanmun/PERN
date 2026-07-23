'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Undo2 } from 'lucide-react';
import { uncommitBbbHole } from '@/lib/actions/bbb';
import type { ComputedBbb } from '@buddycup/scoring/engine';

type Participant = {
  participant: { id: string; nickname: string };
  team: { id: string; name: string; color: string | null };
  side: 'A' | 'B';
};

const POINT_LABELS = [
  { key: 'bingo' as const, label: 'Bingo' },
  { key: 'bango' as const, label: 'Bango' },
  { key: 'bongo' as const, label: 'Bongo' },
];

/**
 * Bingo Bango Bongo review scorecard: hole-by-hole committed points,
 * per-player tallies, side totals. Points are committed from the
 * score-entry surface; the only mutation here is captain/admin uncommit.
 */
export default function BbbScorecard({
  matchId,
  computed,
  participants,
  canUncommit,
}: {
  matchId: string;
  computed: ComputedBbb;
  participants: Participant[];
  canUncommit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingHole, setPendingHole] = useState<number | null>(null);

  const byId = new Map(participants.map((p) => [p.participant.id, p]));
  const aColor = participants.find((p) => p.side === 'A')?.team.color ?? '#71717a';
  const bColor = participants.find((p) => p.side === 'B')?.team.color ?? '#71717a';

  function uncommit(holeNumber: number) {
    setPendingHole(holeNumber);
    startTransition(async () => {
      try {
        await uncommitBbbHole(matchId, holeNumber);
        router.refresh();
      } finally {
        setPendingHole(null);
      }
    });
  }

  const chip = (winnerId: string | null) => {
    if (winnerId == null) {
      return <span className="text-zinc-500">Washed</span>;
    }
    const p = byId.get(winnerId);
    if (!p) return <span className="text-zinc-500">—</span>;
    return (
      <span
        className="rounded-sm px-1.5 py-0.5 font-semibold"
        style={{
          background: `${p.team.color ?? '#71717a'}26`,
          color: p.team.color ?? undefined,
        }}
      >
        {p.participant.nickname}
      </span>
    );
  };

  return (
    <section className="mt-6 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="border-b border-zinc-200 dark:border-zinc-900 px-3 py-2.5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Bingo Bango Bongo · {computed.holesCommitted} of {computed.totalHoles} holes committed
        </p>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-900">
        {computed.holeResults.map((h) => (
          <div key={h.holeNumber} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-6 shrink-0 font-mono text-sm font-bold tabular-nums text-yellow-800 dark:text-yellow-400">
              {h.holeNumber}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {POINT_LABELS.map(({ key, label }) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                    {label}
                  </span>
                  {chip(h[key])}
                </span>
              ))}
            </div>
            {canUncommit ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => uncommit(h.holeNumber)}
                className="inline-flex shrink-0 items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500 underline-offset-2 hover:text-yellow-700 dark:hover:text-yellow-400 hover:underline disabled:opacity-50"
              >
                <Undo2 size={9} />
                {pendingHole === h.holeNumber ? '…' : 'Uncommit'}
              </button>
            ) : (
              <Lock size={10} className="shrink-0 text-zinc-500" />
            )}
          </div>
        ))}
        {computed.holeResults.length === 0 && (
          <p className="px-3 py-4 text-sm text-zinc-500">
            No holes committed yet — points are committed hole-by-hole from the scorecard.
          </p>
        )}
      </div>

      {/* Per-player tallies */}
      <div className="border-t border-zinc-200 dark:border-zinc-900 px-3 py-2.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {participants.map((p) => (
            <span key={p.participant.id} className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {p.participant.nickname}
              </span>
              <span
                className="font-mono font-bold tabular-nums"
                style={{ color: p.team.color ?? undefined }}
              >
                {computed.pointsByPlayer.get(p.participant.id) ?? 0}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 items-center gap-2 border-t-2 border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/30 px-3 py-3 font-mono text-sm font-bold tabular-nums">
        <span className="text-center" style={{ color: aColor }}>
          {computed.pointsA}
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            pts
          </span>
        </span>
        <span className="text-center" style={{ color: bColor }}>
          {computed.pointsB}
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            pts
          </span>
        </span>
      </div>
    </section>
  );
}
