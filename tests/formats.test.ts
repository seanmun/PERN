/**
 * Format registry tests. These lock in the per-format flags that the
 * match builder, validation, and score-entry surface all read off.
 *
 * If one of these assertions fails, real UI behavior just changed —
 * make sure the spec at docs/match-template-spec.md was updated too.
 */

import { describe, it, expect } from 'vitest';
import {
  FORMAT_META,
  FORMAT_IDS,
  getFormatMeta,
  isTeamInput,
  isIndividualInput,
  requiresSameFoursomePerSide,
  isSideSizeAllowed,
  isOneSided,
  isTwoSided,
} from '@/lib/scoring/formats';

describe('FORMAT_META', () => {
  it('exposes every format declared by the spec', () => {
    expect(FORMAT_IDS.sort()).toEqual(
      [
        'singles',
        'best_ball',
        'two_man_aggregate',
        'scramble',
        'alternate_shot',
        'stroke',
      ].sort(),
    );
  });

  it('singles is 1v1, 2-sided, no foursome constraint, individual input', () => {
    const f = getFormatMeta('singles');
    expect(f.sides).toBe(2);
    expect(f.allowedSideSizes).toEqual([1]);
    expect(f.requiresSameFoursomePerSide).toBe(false);
    expect(f.inputMode).toBe('individual');
  });

  it('best ball is 2-sided, supports 2v2 / 3v3 / 4v4, no foursome constraint', () => {
    const f = getFormatMeta('best_ball');
    expect(f.sides).toBe(2);
    expect(f.allowedSideSizes).toEqual([2, 3, 4]);
    expect(f.requiresSameFoursomePerSide).toBe(false);
    expect(f.inputMode).toBe('individual');
  });

  it('two-man aggregate is 2v2, foursome-locked per side, individual input', () => {
    const f = getFormatMeta('two_man_aggregate');
    expect(f.sides).toBe(2);
    expect(f.allowedSideSizes).toEqual([2]);
    expect(f.requiresSameFoursomePerSide).toBe(true);
    expect(f.inputMode).toBe('individual');
  });

  it('scramble is 1-sided, 2/3/4-man teams, foursome-locked, team input', () => {
    // One team plays one ball — the opposing team plays their own
    // scramble in their own match. Leaderboard sorts team strokes.
    const f = getFormatMeta('scramble');
    expect(f.sides).toBe(1);
    expect(f.allowedSideSizes).toEqual([2, 3, 4]);
    expect(f.requiresSameFoursomePerSide).toBe(true);
    expect(f.inputMode).toBe('team');
  });

  it('alternate shot is 2v2 head-to-head, foursome-locked per side, team input', () => {
    const f = getFormatMeta('alternate_shot');
    expect(f.sides).toBe(2);
    expect(f.allowedSideSizes).toEqual([2]);
    expect(f.requiresSameFoursomePerSide).toBe(true);
    expect(f.inputMode).toBe('team');
  });

  it('stroke is 1-sided per match (one player, leaderboard sorts)', () => {
    const f = getFormatMeta('stroke');
    expect(f.sides).toBe(1);
    expect(f.allowedSideSizes).toEqual([1]);
    expect(f.requiresSameFoursomePerSide).toBe(false);
    expect(f.inputMode).toBe('individual');
  });
});

describe('FORMAT_META invariants', () => {
  it('every team-input format is foursome-locked per side', () => {
    // You can't physically play a single ball as a team unless the team
    // is in one tee time together. So team input ALWAYS implies the
    // same-foursome constraint. Stops anyone from declaring a
    // cross-foursome scramble by accident.
    for (const id of FORMAT_IDS) {
      const f = FORMAT_META[id];
      if (f.inputMode === 'team') {
        expect(
          f.requiresSameFoursomePerSide,
          `${id} is team-input but not foursome-locked`,
        ).toBe(true);
      }
    }
  });

  it('every allowed side size is a positive integer ≥ 1', () => {
    for (const id of FORMAT_IDS) {
      const f = FORMAT_META[id];
      expect(f.allowedSideSizes.length).toBeGreaterThan(0);
      for (const n of f.allowedSideSizes) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('format ids in the record match their .id field', () => {
    // Catches a copy-paste error where the key and the id property
    // drift apart.
    for (const id of FORMAT_IDS) {
      expect(FORMAT_META[id].id).toBe(id);
    }
  });
});

describe('side-count helpers', () => {
  it('isOneSided / isTwoSided agree with FORMAT_META.sides', () => {
    for (const id of FORMAT_IDS) {
      const sides = FORMAT_META[id].sides;
      expect(isOneSided(id)).toBe(sides === 1);
      expect(isTwoSided(id)).toBe(sides === 2);
    }
  });

  it('scramble and stroke are 1-sided; the rest are 2-sided', () => {
    expect(isOneSided('scramble')).toBe(true);
    expect(isOneSided('stroke')).toBe(true);
    expect(isTwoSided('singles')).toBe(true);
    expect(isTwoSided('best_ball')).toBe(true);
    expect(isTwoSided('two_man_aggregate')).toBe(true);
    expect(isTwoSided('alternate_shot')).toBe(true);
  });
});

describe('helper predicates', () => {
  it('isTeamInput / isIndividualInput agree with the meta', () => {
    for (const id of FORMAT_IDS) {
      const team = FORMAT_META[id].inputMode === 'team';
      expect(isTeamInput(id)).toBe(team);
      expect(isIndividualInput(id)).toBe(!team);
    }
  });

  it('requiresSameFoursomePerSide reflects the flag', () => {
    expect(requiresSameFoursomePerSide('scramble')).toBe(true);
    expect(requiresSameFoursomePerSide('singles')).toBe(false);
  });

  it('isSideSizeAllowed accepts declared sizes and rejects others', () => {
    expect(isSideSizeAllowed('best_ball', 2)).toBe(true);
    expect(isSideSizeAllowed('best_ball', 4)).toBe(true);
    expect(isSideSizeAllowed('best_ball', 5)).toBe(false);
    expect(isSideSizeAllowed('singles', 1)).toBe(true);
    expect(isSideSizeAllowed('singles', 2)).toBe(false);
    expect(isSideSizeAllowed('alternate_shot', 2)).toBe(true);
    expect(isSideSizeAllowed('alternate_shot', 3)).toBe(false);
  });
});
