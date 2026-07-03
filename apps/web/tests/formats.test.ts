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
} from '@buddycup/scoring/formats';

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
        'best_two_of_three',
      ].sort(),
    );
  });

  it('singles is 1v1, no foursome constraint, individual input', () => {
    const f = getFormatMeta('singles');
    expect(f.allowedSideSizes).toEqual([1]);
    expect(f.requiresSameFoursomePerSide).toBe(false);
    expect(f.inputMode).toBe('individual');
  });

  it('best ball supports 2v2 / 3v3 / 4v4, no foursome constraint, individual input', () => {
    const f = getFormatMeta('best_ball');
    expect(f.allowedSideSizes).toEqual([2, 3, 4]);
    expect(f.requiresSameFoursomePerSide).toBe(false);
    expect(f.inputMode).toBe('individual');
  });

  it('two-man aggregate is 2v2, foursome-locked per side, individual input', () => {
    const f = getFormatMeta('two_man_aggregate');
    expect(f.allowedSideSizes).toEqual([2]);
    expect(f.requiresSameFoursomePerSide).toBe(true);
    expect(f.inputMode).toBe('individual');
  });

  it('scramble supports 2/3/4-man, foursome-locked per side, team input', () => {
    const f = getFormatMeta('scramble');
    expect(f.allowedSideSizes).toEqual([2, 3, 4]);
    expect(f.requiresSameFoursomePerSide).toBe(true);
    expect(f.inputMode).toBe('team');
  });

  it('alternate shot is 2v2, foursome-locked per side, team input', () => {
    const f = getFormatMeta('alternate_shot');
    expect(f.allowedSideSizes).toEqual([2]);
    expect(f.requiresSameFoursomePerSide).toBe(true);
    expect(f.inputMode).toBe('team');
  });

  it('stroke supports 1..4 side, no foursome constraint, individual input', () => {
    const f = getFormatMeta('stroke');
    expect(f.allowedSideSizes).toEqual([1, 2, 3, 4]);
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
