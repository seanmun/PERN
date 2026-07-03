/**
 * Format registry — the single source of truth for what each match format
 * is, what side sizes it supports, whether it needs the participants to
 * share a foursome, and whether scores come in per-player or per-team.
 *
 * Lives next to the scoring engine because everything downstream (match
 * builder, validation, score-entry surface, leaderboard) keys off these
 * flags. Hardcoded by design — formats change rarely, and the engine is
 * already pure functions in engine.ts. If we ever ship "build your own
 * format" this promotes to a DB table.
 *
 * See docs/match-template-spec.md for the design.
 */

export type FormatId =
  | 'singles'
  | 'best_ball'
  | 'two_man_aggregate'
  | 'scramble'
  | 'alternate_shot'
  | 'stroke'
  | 'best_two_of_three';

export type InputMode = 'individual' | 'team';

export type FormatMeta = {
  id: FormatId;
  label: string;
  // Allowed side sizes (per side, not total). Admin picks one at match
  // create time. Same size applies to both sides — no 2v4 asymmetries.
  allowedSideSizes: readonly number[];
  // Per-SIDE same-foursome constraint. True = every slot on a side must
  // be drawn from one tee time. The two sides do NOT need to share a
  // tee time. This is what lets a 4-man scramble be Foursome 1 vs
  // Foursome 2, while a 1v1 singles can pull from anywhere.
  requiresSameFoursomePerSide: boolean;
  // How scores are recorded for this format:
  //   'individual' — each player records their own gross per hole.
  //                  Result is computed by the engine (best of N, sum, etc).
  //   'team'       — the side records ONE gross per hole. There is no
  //                  per-player gross for this match.
  inputMode: InputMode;
  // Sum of the N lowest nets on a side, for formats where more than one
  // player's net counts but not ALL of them (e.g. "best 2 of 3" — 3-player
  // side, sum the two lowest). Omitted for every other format; the engine
  // falls back to its built-in best-ball (single lowest) / aggregate (sum
  // all) rules when this is absent, so existing formats are unaffected.
  countBest?: number;
};

export const FORMAT_META: Record<FormatId, FormatMeta> = {
  singles: {
    id: 'singles',
    label: 'Singles',
    allowedSideSizes: [1],
    requiresSameFoursomePerSide: false,
    inputMode: 'individual',
  },
  best_ball: {
    id: 'best_ball',
    label: 'Best Ball',
    allowedSideSizes: [2, 3, 4],
    requiresSameFoursomePerSide: false,
    inputMode: 'individual',
  },
  two_man_aggregate: {
    id: 'two_man_aggregate',
    label: 'Two-Man Aggregate',
    allowedSideSizes: [2],
    requiresSameFoursomePerSide: true,
    inputMode: 'individual',
  },
  scramble: {
    id: 'scramble',
    label: 'Scramble',
    allowedSideSizes: [2, 3, 4],
    requiresSameFoursomePerSide: true,
    inputMode: 'team',
  },
  alternate_shot: {
    id: 'alternate_shot',
    label: 'Alternate Shot',
    allowedSideSizes: [2],
    requiresSameFoursomePerSide: true,
    inputMode: 'team',
  },
  stroke: {
    id: 'stroke',
    label: 'Stroke Play',
    allowedSideSizes: [1, 2, 3, 4],
    requiresSameFoursomePerSide: false,
    inputMode: 'individual',
  },
  best_two_of_three: {
    id: 'best_two_of_three',
    label: 'Best 2 of 3',
    // 3v3, sum of each side's two lowest nets per hole, decided by low
    // cumulative total across 18 (stroke play — pair with scoring:
    // 'stroke' when building the match). See packages/scoring/engine.ts
    // computeStrokePlayMatch.
    allowedSideSizes: [3],
    requiresSameFoursomePerSide: true,
    inputMode: 'individual',
    countBest: 2,
  },
};

export const FORMAT_IDS = Object.keys(FORMAT_META) as readonly FormatId[];

export function getFormatMeta(id: FormatId): FormatMeta {
  return FORMAT_META[id];
}

export function isTeamInput(id: FormatId): boolean {
  return FORMAT_META[id].inputMode === 'team';
}

export function isIndividualInput(id: FormatId): boolean {
  return FORMAT_META[id].inputMode === 'individual';
}

export function requiresSameFoursomePerSide(id: FormatId): boolean {
  return FORMAT_META[id].requiresSameFoursomePerSide;
}

export function isSideSizeAllowed(id: FormatId, size: number): boolean {
  return FORMAT_META[id].allowedSideSizes.includes(size);
}
