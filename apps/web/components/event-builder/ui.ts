/**
 * Shared Tailwind tokens for the event builder.
 *
 * Here rather than copied into each component so the six pieces of the
 * builder cannot slowly stop looking like each other — the same reason
 * §10 organises components by concept instead of by screen.
 */

export const SECTION =
  'mt-5 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/40';

export const SECTION_HEAD = 'flex items-center justify-between px-4 py-3';

export const SECTION_BODY =
  'border-t border-zinc-200 px-4 py-3 dark:border-zinc-900';

export const LABEL =
  'font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400';

export const META =
  'font-mono text-[10px] uppercase tracking-widest text-zinc-500';

export const INPUT =
  'block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:cursor-not-allowed disabled:opacity-50';

export const CHIP_A =
  'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';

export const CHIP_B =
  'border-yellow-600/40 bg-yellow-500/10 text-yellow-800 dark:text-yellow-400';

/** A frozen surface: visible, readable, not editable. */
export const LOCKED_NOTE =
  'flex items-start gap-2 rounded-sm border border-zinc-300 bg-zinc-100/60 px-3 py-2 text-[12px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300';
