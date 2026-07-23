'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Lock, Undo2 } from 'lucide-react';
import { uncommitThirtyBallHole } from '@/lib/actions/scores';
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
  committedAt: Date | string | null;
};

/**
 * "30 Ball" review scorecard. Selection happens in the score-entry
 * surface via the per-hole commit flow — this card shows the committed
 * state hole by hole. The one mutation here is the captain/admin
 * uncommit (mistake correction): it reopens a hole so the side can
 * re-enter and re-commit.
 */
export default function ThirtyBallScorecard({
  matchId,
  strokePlay,
  participants,
  holes,
  scores,
  uncommitTeamIds = [],
}: {
  matchId: string;
  strokePlay: ComputedThirtyBall;
  participants: Participant[];
  holes: { number: number; par: number }[];
  scores: ScoreRow[];
  /** Team ids the viewer may uncommit (captain of that team, or admin → both). */
  uncommitTeamIds?: string[];
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

  function uncommit(teamId: string, holeNumber: number) {
    const key = `${teamId}:${holeNumber}`;
    setPendingKey(key);
    startTransition(async () => {
      try {
        await uncommitThirtyBallHole(matchId, teamId, holeNumber);
        router.refresh();
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <section className="mt-6 overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="border-b border-zinc-200 dark:border-zinc-900 px-3 py-2.5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          30 Ball · committed scores count toward each side&rsquo;s {THIRTY_BALL_BUDGET}
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
                {[
                  { players: sideA, color: aColor },
                  { players: sideB, color: bColor },
                ].map(({ players, color }, i) => {
                  const teamId = players[0]?.team.id;
                  const committed = players.some((p) => {
                    const row = scoreByKey.get(`${p.participant.id}:${h.number}`);
                    return row?.committedAt != null;
                  });
                  const canUncommit =
                    committed && teamId != null && uncommitTeamIds.includes(teamId);
                  const key = `${teamId}:${h.number}`;
                  return (
                    <div key={i} className="space-y-1">
                      {players.map((p) => {
                        const row = scoreByKey.get(`${p.participant.id}:${h.number}`);
                        const gross = row?.gross ?? null;
                        const counted = row?.counted ?? false;
                        return (
                          <div
                            key={p.participant.id}
                            className={`flex items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-xs ${
                              counted
                                ? 'border-transparent'
                                : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black/30'
                            } ${committed ? '' : 'opacity-70'}`}
                            style={
                              counted
                                ? { background: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}` }
                                : undefined
                            }
                          >
                            <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200">
                              {p.participant.nickname}
                            </span>
                            <span className="flex items-center gap-1 font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                              {gross ?? '—'}
                              {counted && <Check size={11} strokeWidth={3} style={{ color }} />}
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between px-0.5">
                        <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                          {committed ? (
                            <>
                              <Lock size={9} /> Committed
                            </>
                          ) : (
                            'Not committed'
                          )}
                        </span>
                        {canUncommit && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => uncommit(teamId, h.number)}
                            className="inline-flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500 underline-offset-2 hover:text-yellow-700 dark:hover:text-yellow-400 hover:underline disabled:opacity-50"
                          >
                            <Undo2 size={9} />
                            {pendingKey === key ? '…' : 'Uncommit'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
