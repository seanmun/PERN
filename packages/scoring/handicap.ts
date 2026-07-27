/**
 * Course-handicap conversion. Pure — no DB, no React.
 *
 * USGA formula: Course Handicap = Index × (Slope ÷ 113) + (Rating − Par),
 * rounded to the nearest whole number. When the tee is missing slope or
 * rating (or par is unknown), we fall back to the raw index rounded —
 * the admin gets a warning in the match builder, but scoring still works.
 */

export type TeeRating = {
  slope: number | null;
  rating: number | null;
  par: number | null;
};

export function toCourseHandicap(index: number, tee: TeeRating): number {
  if (
    tee.slope == null ||
    tee.rating == null ||
    tee.par == null ||
    !Number.isFinite(tee.slope) ||
    !Number.isFinite(tee.rating) ||
    !Number.isFinite(tee.par)
  ) {
    return Math.round(index);
  }
  return Math.round(index * (tee.slope / 113) + (tee.rating - tee.par));
}

/**
 * Per-hole stroke allocation off a player's FULL course handicap — the
 * basis every "how is this player doing overall" surface uses (the
 * individual leaderboard and the feed's net labels), as opposed to a
 * match's relative allocation, which is the engine's job.
 *
 *   strokes(hole) = floor(hcp / 18) + (hcp % 18 >= holeStrokeIndex ? 1 : 0)
 *
 * Shared deliberately: the leaderboard and the feed each had their own
 * copy and drifted — the feed allocated off the raw index while the
 * leaderboard converted to a course handicap first, so on a sloped
 * course the same hole read "Net birdie" in one and net par in the other.
 *
 * Plus handicaps clamp to 0 (they receive no strokes here).
 */
export function allocateCourseStrokes(
  index: number,
  tee: TeeRating,
  holes: { holeNumber: number; handicapIndex: number }[],
): Map<number, number> {
  const hcp = Math.max(0, toCourseHandicap(index, tee));
  const out = new Map<number, number>();
  for (const h of holes) {
    out.set(
      h.holeNumber,
      Math.floor(hcp / 18) + (hcp % 18 >= h.handicapIndex ? 1 : 0),
    );
  }
  return out;
}

/** True when the tee has everything toCourseHandicap needs for a real
 * conversion (vs. the raw-index fallback). Drives the builder warning. */
export function hasCourseRating(tee: TeeRating): boolean {
  return (
    tee.slope != null &&
    tee.rating != null &&
    tee.par != null &&
    Number.isFinite(tee.slope) &&
    Number.isFinite(tee.rating) &&
    Number.isFinite(tee.par)
  );
}
