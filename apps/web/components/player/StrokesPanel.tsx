/**
 * The stroke breakdown on a player's profile — the surface that lets an
 * admin hold this page next to a GHIN card and check every number.
 *
 * It shows the ARITHMETIC, not just the answer, because "14" is not
 * checkable and "10.1 × 130/113 + 2.5 → 14" is.
 *
 * Two columns, deliberately side by side (see lib/data/player-strokes.ts):
 *   MATCH  what this match resolved on — baseline floats per the round's
 *          handicap rule, so it legitimately differs between a player's
 *          own matches.
 *   BOARD  what the individual leaderboard ranks on — one basis for the
 *          whole field, per Trip Scoring.
 *
 * Server component. The per-hole strip is a native <details>, so it opens
 * without shipping a byte of JavaScript.
 */

import { ChevronRight } from 'lucide-react';
import type {
  MatchStrokeBreakdown,
  PlayerStrokes,
} from '@/lib/data/player-strokes';
import type { LeaderboardMethod } from '@/components/event-builder/state';

const BOARD_LABEL: Record<LeaderboardMethod, string> = {
  gross: 'Gross — no strokes',
  net_trip_handicap: 'Net vs trip handicap',
  net_course_handicap: 'Net vs course handicap',
};

const METHOD_LABEL: Record<MatchStrokeBreakdown['handicapMethod'], string> = {
  group_low: 'Foursome low plays scratch',
  match_low: 'Matchup low plays scratch',
  course: 'Full course handicap',
};

const CELL = 'font-mono text-[10px] tabular-nums';

export default function StrokesPanel({ strokes }: { strokes: PlayerStrokes }) {
  if (!strokes.matches.length) return null;

  return (
    <section className="mt-8">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
        Strokes
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">
        What each match resolved on, next to what the leaderboard ranks on.
        Board basis for this trip:{' '}
        <span className="text-zinc-700 dark:text-zinc-300">
          {BOARD_LABEL[strokes.boardMethod]}
        </span>
        .
      </p>

      <div className="mt-3 space-y-2">
        {strokes.matches.map((m) => (
          <RoundStrokes key={m.matchId} m={m} />
        ))}
      </div>
    </section>
  );
}

function RoundStrokes({ m }: { m: MatchStrokeBreakdown }) {
  const conversion =
    m.index == null
      ? 'no handicap set'
      : m.slope != null && m.rating != null && m.coursePar != null
        ? `${m.index} × ${m.slope}/113 + (${m.rating} − ${m.coursePar}) → ${m.boardPlayingHandicap}`
        : `${m.index} → ${m.boardPlayingHandicap} (tee has no slope/rating)`;

  return (
    <div className="rounded-sm border border-zinc-300 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold">
            <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-800 dark:text-yellow-400">
              R{m.roundOrder}
            </span>{' '}
            {m.roundLabel ?? m.courseName}
          </p>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
            {m.formatLabel}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
          {m.courseName}
          {m.teeName ? ` · ${m.teeName} tee` : ''}
          {m.slope != null ? ` · slope ${m.slope}` : ''}
          {m.rating != null ? ` · rating ${m.rating}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-zinc-200 bg-zinc-200 dark:border-zinc-900 dark:bg-zinc-900">
        {/* ---- Match basis ---- */}
        <div className="bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
            This match
          </p>
          {m.teamFormat ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-400">
                —
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {m.formatLabel} is played gross in v1 — one ball per side, no
                per-player strokes.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {m.matchTotal}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {METHOD_LABEL[m.handicapMethod]}
              </p>
              {m.scratch != null && m.index != null && (
                <p className={`mt-1 ${CELL} text-zinc-600 dark:text-zinc-400`}>
                  {m.index} − {m.scratch}
                  {m.scratchHolder ? ` (${m.scratchHolder})` : ''} ={' '}
                  {Math.max(0, Math.round(m.index - m.scratch))}
                </p>
              )}
            </>
          )}
        </div>

        {/* ---- Leaderboard basis ---- */}
        <div className="bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
            Leaderboard
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {m.boardTotal}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {BOARD_LABEL[m.boardMethod]}
          </p>
          {m.boardMethod !== 'gross' && (
            <p className={`mt-1 ${CELL} text-zinc-600 dark:text-zinc-400`}>
              {conversion}
            </p>
          )}
          {m.boardFellBack && (
            <p className="mt-1 rounded-sm border border-yellow-600/30 bg-yellow-500/5 px-1.5 py-1 text-[10px] text-yellow-900 dark:text-yellow-300">
              No slope/rating on this tee — fell back to the trip handicap.
            </p>
          )}
        </div>
      </div>

      {/* ---- Per-hole, closed by default ---- */}
      {m.holes.length > 0 && (
        <details className="group border-t border-zinc-200 dark:border-zinc-900">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-700 dark:hover:text-yellow-400">
            <ChevronRight
              size={11}
              className="transition-transform group-open:rotate-90"
            />
            Hole by hole
          </summary>
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full min-w-[520px] border-collapse">
              <tbody>
                <Row
                  label="Hole"
                  values={m.holes.map((h) => String(h.holeNumber))}
                  head
                />
                <Row label="Par" values={m.holes.map((h) => String(h.par))} />
                <Row
                  label="SI"
                  values={m.holes.map((h) => String(h.handicapIndex))}
                />
                {!m.teamFormat && (
                  <Row
                    label="Match"
                    values={m.holes.map((h) => (h.match ? String(h.match) : '·'))}
                    accent
                  />
                )}
                <Row
                  label="Board"
                  values={m.holes.map((h) => (h.board ? String(h.board) : '·'))}
                  accent
                />
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Row({
  label,
  values,
  head,
  accent,
}: {
  label: string;
  values: string[];
  head?: boolean;
  accent?: boolean;
}) {
  return (
    <tr className={head ? 'border-b border-zinc-200 dark:border-zinc-900' : ''}>
      <th
        scope="row"
        className="sticky left-0 bg-zinc-50 py-1 pr-2 text-left font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500 dark:bg-zinc-950"
      >
        {label}
      </th>
      {values.map((v, i) => (
        <td
          key={i}
          className={`${CELL} py-1 text-center ${
            head
              ? 'font-semibold text-zinc-700 dark:text-zinc-300'
              : accent
                ? 'text-yellow-800 dark:text-yellow-400'
                : 'text-zinc-500'
          }`}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}
