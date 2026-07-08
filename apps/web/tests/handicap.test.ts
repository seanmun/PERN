import { describe, it, expect } from 'vitest';
import { toCourseHandicap, hasCourseRating } from '@buddycup/scoring/handicap';

describe('toCourseHandicap', () => {
  it('applies the USGA formula: Index × Slope/113 + (Rating − Par)', () => {
    // 20.0 index on a 130-slope, 72.5-rating, par-72 tee:
    // 20 × 130/113 + 0.5 = 23.0 + 0.5 = 23.5 → 24 (round half up)
    expect(toCourseHandicap(20, { slope: 130, rating: 72.5, par: 72 })).toBe(24);
  });

  it('a neutral tee (slope 113, rating = par) returns the rounded index', () => {
    expect(toCourseHandicap(14.9, { slope: 113, rating: 72, par: 72 })).toBe(15);
  });

  it('an easy tee cuts strokes; a hard tee adds them', () => {
    const easy = toCourseHandicap(18, { slope: 95, rating: 68.0, par: 72 });
    const hard = toCourseHandicap(18, { slope: 140, rating: 75.0, par: 72 });
    expect(easy).toBeLessThan(18);
    expect(hard).toBeGreaterThan(18);
  });

  it('falls back to the rounded raw index when slope/rating/par missing', () => {
    expect(toCourseHandicap(17.4, { slope: null, rating: 71.0, par: 72 })).toBe(17);
    expect(toCourseHandicap(17.4, { slope: 120, rating: null, par: 72 })).toBe(17);
    expect(toCourseHandicap(17.4, { slope: 120, rating: 71.0, par: null })).toBe(17);
  });

  it('plus-handicap (negative) indexes survive the conversion', () => {
    // -2 index, hard tee: -2 × 130/113 + 1.5 = -2.30 + 1.5 = -0.80 → -1
    expect(toCourseHandicap(-2, { slope: 130, rating: 73.5, par: 72 })).toBe(-1);
  });
});

describe('hasCourseRating', () => {
  it('true only when slope, rating, and par are all present', () => {
    expect(hasCourseRating({ slope: 130, rating: 72.5, par: 72 })).toBe(true);
    expect(hasCourseRating({ slope: null, rating: 72.5, par: 72 })).toBe(false);
    expect(hasCourseRating({ slope: 130, rating: null, par: 72 })).toBe(false);
    expect(hasCourseRating({ slope: 130, rating: 72.5, par: null })).toBe(false);
  });
});
