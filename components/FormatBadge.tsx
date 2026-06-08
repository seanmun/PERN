/**
 * Small uppercase pill that names a match's scoring format. Used wherever
 * a match row is rendered — schedule, scoreboard, round-edit, match cards —
 * so the stacked-formats case (Best Ball + Singles side-bet in one group)
 * is visually scannable.
 */

export type MatchFormat =
  | 'best_ball'
  | 'singles'
  | 'scramble'
  | 'stroke'
  | 'two_man_aggregate';

const LABEL: Record<MatchFormat, string> = {
  best_ball: 'Best Ball',
  singles: 'Singles',
  scramble: 'Scramble',
  stroke: 'Stroke',
  two_man_aggregate: 'Aggregate',
};

export default function FormatBadge({
  format,
  size = 'sm',
}: {
  format: MatchFormat | string;
  size?: 'xs' | 'sm';
}) {
  const label =
    (LABEL as Record<string, string>)[format] ?? format.replace(/_/g, ' ');
  const cls =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[8px]'
      : 'px-2 py-0.5 text-[9px]';
  return (
    <span
      className={`inline-block rounded-sm border border-zinc-800 bg-zinc-950 font-mono font-bold uppercase tracking-[0.18em] text-zinc-400 ${cls}`}
    >
      {label}
    </span>
  );
}
