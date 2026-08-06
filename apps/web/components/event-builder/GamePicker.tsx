'use client';

/**
 * "What" — the round-builder atom's third question (§6.1).
 *
 * Multi-select, because formats stack: one foursome can carry Best Ball
 * and a Singles side bet, and the lineup derivation seats both. Picking
 * nothing is legal and means a SHELL round (§6.2) — course and groups
 * now, matchups later — not an error.
 */

import { Check, Lock } from 'lucide-react';
import { FORMAT_META, type FormatId } from '@buddycup/scoring/formats';
import { FORMAT_BLURB, OFFERED_FORMATS } from './state';

export default function GamePicker({
  selected,
  disabled,
  onToggle,
}: {
  selected: readonly FormatId[];
  disabled?: boolean;
  onToggle: (format: FormatId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OFFERED_FORMATS.map((f) => {
        const on = selected.includes(f);
        // A locked round still shows what it is playing — it just cannot
        // be changed. Hiding the unselected games instead would make the
        // screen look like the format list had shrunk.
        if (disabled && !on) return null;
        return (
          <button
            key={f}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(f)}
            className={`rounded-sm border px-3 py-2 text-left text-[12px] font-semibold disabled:cursor-not-allowed ${
              on
                ? 'border-yellow-600/60 bg-yellow-500/10 text-yellow-800 dark:text-yellow-400'
                : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {disabled ? <Lock size={11} /> : on && <Check size={12} />}
              {FORMAT_META[f].label}
            </span>
            {FORMAT_BLURB[f] && !disabled && (
              <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                {FORMAT_BLURB[f]}
              </span>
            )}
          </button>
        );
      })}
      {selected.length === 0 && !disabled && (
        <p className="mt-1 w-full text-[11px] text-zinc-500">
          No game picked — this round is saved as a shell: course and tee
          times now, matchups later.
        </p>
      )}
    </div>
  );
}
