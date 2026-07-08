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
