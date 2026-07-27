import { describe, it, expect } from 'vitest';
import {
  allocateCourseStrokes,
  hasCourseRating,
  toCourseHandicap,
} from '@buddycup/scoring/handicap';

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

describe('allocateCourseStrokes', () => {
  const HOLES = Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    handicapIndex: i + 1,
  }));
  const NEUTRAL = { slope: 113, rating: 72, par: 72 };

  it('allocates off the COURSE handicap, not the raw index', () => {
    // Index 10 on a slope-135 course converts to 12, so holes with
    // stroke index 11 and 12 get a stroke that the raw index would miss.
    const hard = { slope: 135, rating: 72, par: 72 };
    expect(toCourseHandicap(10, hard)).toBe(12);
    const strokes = allocateCourseStrokes(10, hard, HOLES);
    expect(strokes.get(12)).toBe(1);
    expect(strokes.get(13)).toBe(0);
    // Same index off a neutral tee stops at SI 10 — the drift this fixes.
    const neutral = allocateCourseStrokes(10, NEUTRAL, HOLES);
    expect(neutral.get(12)).toBe(0);
  });

  it('gives a stroke on every hole at 18, and a second on SI 1 at 19', () => {
    const at18 = allocateCourseStrokes(18, NEUTRAL, HOLES);
    expect([...at18.values()].every((v) => v === 1)).toBe(true);
    const at19 = allocateCourseStrokes(19, NEUTRAL, HOLES);
    expect(at19.get(1)).toBe(2);
    expect(at19.get(2)).toBe(1);
  });

  it('clamps plus handicaps to zero strokes', () => {
    const strokes = allocateCourseStrokes(-2, NEUTRAL, HOLES);
    expect([...strokes.values()].every((v) => v === 0)).toBe(true);
  });
});
