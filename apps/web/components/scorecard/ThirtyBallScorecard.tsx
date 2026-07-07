'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { toggleHoleScoreCounted } from '@/lib/actions/scores';
import { THIRTY_BALL_BUDGET, type ComputedThirtyBall } from '@buddycup/scoring/engine';

type Participant = {
  participant: { id: string; nickname: string };
  team: { id: string; name: string; color: string | null };
  side: 'A' | 'B';
};

type ScoreRow = {
  tripMemberId: string;
  holeNumber: number;
  gross: number | null;
  counted: boolean;
};

/**
 * "30 Ball" interactive scorecard. Unlike every other format's scorecard
 * (read-only, derived purely from grosses), this format needs a human
 * decision per player per hole — "does this score count toward our
 * budget of 30?" — so this is the one exception to the match-detail
 * page being read-only. Grosses themselves still only come from the
 * normal foursome scorecard; this just toggles which ones count here.
 */
export default function ThirtyBallScorecard({
  matchId,
  strokePlay,
  participants,
  holes,
  scores,
  canEdit,
}: {
  matchId: string;
  strokePlay: ComputedThirtyBall;
  participants: Participant[];
  holes: { number: number; par: number }[];
  scores: ScoreRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const sideA = participants.filter((p) => p.side === 'A');
  const sideB = participants.filter((p) => p.side === 'B');
  const aColor = sideA[0]?.team.color ?? '#71717a';
  const bColor = sideB[0]?.team.color ?? '#71717a';

  const scoreByKey = new Map<string, ScoreRow>();
  for (const s of scores) {
    scoreByKey.set(`${s.tripMemberId}:${s.holeNumber}`, s);
  }
  const holeResultByNumber = new Map(
    strokePlay.holeResults.map((r) => [r.holeNumber, r]),
  );

  function toggle(tripMemberId: string, holeNumber: number, next: boolean) {
    const key = `${tripMemberId}:${holeNumber}`;
    setPendingKey(key);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('matchId', matchId);
      fd.set('tripMemberId', tripMemberId);
      fd.set('holeNumber', String(holeNumber));
      fd.set('counted', String(next));
      await toggleHoleScoreCounted(fd);
      router.refresh();
      setPendingKey(null);
    });
  }

  return (
    <section className="mt-6 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="border-b border-zinc-200 dark:border-zinc-900 px-3 py-2.5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          30 Ball · tap a score to select it toward the budget
        </p>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-900">
        {holes.map((h) => {
          const result = holeResultByNumber.get(h.number);
          return (
            <div key={h.number} className="px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
                  Hole {h.number} <span className="text-zinc-500">· Par {h.par}</span>
                </span>
                {result && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {result.aTotal} · {result.bTotal}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SidePlayers
                  players={sideA}
                  color={aColor}
                  holeNumber={h.number}
                  scoreByKey={scoreByKey}
                  canEdit={canEdit}
                  pending={pending}
                  pendingKey={pendingKey}
                  onToggle={toggle}
                />
                <SidePlayers
                  players={sideB}
                  color={bColor}
                  holeNumber={h.number}
                  scoreByKey={scoreByKey}
                  canEdit={canEdit}
                  pending={pending}
                  pendingKey={pendingKey}
                  onToggle={toggle}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 items-center gap-2 border-t-2 border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/30 px-3 py-3 font-mono text-sm font-bold tabular-nums">
        <span className="text-center" style={{ color: aColor }}>
          {strokePlay.totalA}
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            {strokePlay.selectedCountA}/{THIRTY_BALL_BUDGET}
          </span>
        </span>
        <span className="text-center" style={{ color: bColor }}>
          {strokePlay.totalB}
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            {strokePlay.selectedCountB}/{THIRTY_BALL_BUDGET}
          </span>
        </span>
      </div>
    </section>
  );
}

function SidePlayers({
  players,
  color,
  holeNumber,
  scoreByKey,
  canEdit,
  pending,
  pendingKey,
  onToggle,
}: {
  players: Participant[];
  color: string;
  holeNumber: number;
  scoreByKey: Map<string, ScoreRow>;
  canEdit: boolean;
  pending: boolean;
  pendingKey: string | null;
  onToggle: (tripMemberId: string, holeNumber: number, next: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      {players.map((p) => {
        const key = `${p.participant.id}:${holeNumber}`;
        const row = scoreByKey.get(key);
        const gross = row?.gross ?? null;
        const counted = row?.counted ?? false;
        const disabled = !canEdit || gross == null || pending;
        return (
          <button
            key={p.participant.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(p.participant.id, holeNumber, !counted)}
            className={`flex w-full items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-left text-xs transition-colors ${
              counted
                ? 'border-transparent'
                : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black/30'
            } disabled:cursor-not-allowed disabled:opacity-40`}
            style={counted ? { background: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
          >
            <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200">
              {p.participant.nickname}
            </span>
            <span className="flex items-center gap-1 font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
              {gross ?? '—'}
              {counted && <Check size={11} strokeWidth={3} style={{ color }} />}
            </span>
            {pendingKey === key && (
              <span className="font-mono text-[9px] text-zinc-500">…</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
