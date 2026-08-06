/**
 * The INDIVIDUAL leaderboard's stroke basis, in one place.
 *
 * `trips.leaderboard_method` decides how the ongoing individual race
 * allocates strokes (§ Trip Scoring). That decision is read by two
 * surfaces — the leaderboard itself, and the per-player stroke breakdown
 * on the profile page — and this module exists so it is implemented once.
 * A profile that disagreed with the board it links back to would be worse
 * than no profile at all.
 *
 * Deliberately NOT the same thing as `resolveMatchHandicaps`: that answers
 * "how does this match between two sides resolve", which floats its
 * baseline to a foursome or a matchup. This answers "how is the whole
 * field ranked against each other", which is one basis for everyone.
 *
 * Pure — no DB. Callers supply the tee and holes they already loaded.
 */

import {
  allocateCourseStrokes,
  hasCourseRating,
  toCourseHandicap,
  type TeeRating,
} from '@buddycup/scoring/handicap';
import type { LeaderboardMethod } from '@/components/event-builder/state';

export type LeaderboardBasis = {
  /** holeNumber -> strokes. Empty under `gross`. */
  strokes: Map<number, number>;
  /** Sum across the supplied holes. */
  total: number;
  /**
   * The handicap actually allocated off: 0 under gross, the rounded index
   * under trip mode, the converted course handicap under course mode.
   * This is the number to hold next to a GHIN card.
   */
  playingHandicap: number;
  /** True when slope/rating were genuinely applied. */
  usedCourseHandicap: boolean;
  /**
   * Course mode was asked for but the tee could not support it, so this
   * fell back to the raw index. Never silent — the leaderboard names the
   * rounds where it happened and the profile says so per round.
   */
  fellBack: boolean;
};

export function leaderboardBasis(input: {
  method: LeaderboardMethod;
  /** The player's trip handicap, as an index. */
  index: number;
  tee: TeeRating;
  holes: { holeNumber: number; handicapIndex: number }[];
}): LeaderboardBasis {
  const { method, index, tee, holes } = input;

  if (method === 'gross') {
    return {
      strokes: new Map(),
      total: 0,
      playingHandicap: 0,
      usedCourseHandicap: false,
      fellBack: false,
    };
  }

  const canConvert = hasCourseRating(tee);
  const usedCourseHandicap = method === 'net_course_handicap' && canConvert;
  const fellBack = method === 'net_course_handicap' && !canConvert;

  // Trip mode passes a bare tee on purpose: `allocateCourseStrokes` falls
  // back to Math.round(index), which IS "the trip handicap, as-is". One
  // allocation function, two bases — not two implementations.
  const effectiveTee: TeeRating = usedCourseHandicap
    ? tee
    : { slope: null, rating: null, par: null };

  const strokes = allocateCourseStrokes(index, effectiveTee, holes);
  let total = 0;
  for (const n of strokes.values()) total += n;

  return {
    strokes,
    total,
    playingHandicap: Math.max(0, toCourseHandicap(index, effectiveTee)),
    usedCourseHandicap,
    fellBack,
  };
}
