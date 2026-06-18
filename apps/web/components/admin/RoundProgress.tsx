'use client';

import { Check } from 'lucide-react';

export type RoundStep = {
  id: string;
  label: string;
  done: boolean;
  hint?: string;
};

/**
 * Per-round setup progress bar. Renders a horizontal sequence of
 * pill segments, one per setup step. Completed steps fill in yellow,
 * remaining steps stay outlined. Top of bar shows "X of Y" count.
 *
 * Steps are computed server-side from the round's data (course set,
 * tee times exist, foursome rosters populated, matches built). UI is
 * purely presentational.
 */
export function RoundProgress({ steps }: { steps: RoundStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = total === 0 ? 0 : (done / total) * 100;

  return (
    <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Setup
        </p>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
          {done} of {total}
        </p>
      </div>

      {/* Fill bar */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-yellow-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Per-step list */}
      <ul className="mt-3 space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                s.done
                  ? 'bg-yellow-500 text-black'
                  : 'border border-zinc-400 dark:border-zinc-700 text-transparent'
              }`}
            >
              <Check size={10} strokeWidth={3} />
            </span>
            <span
              className={s.done ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-500'}
            >
              {s.label}
            </span>
            {s.hint && !s.done && (
              <span className="ml-auto text-[9px] text-zinc-500 normal-case tracking-normal">
                {s.hint}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
