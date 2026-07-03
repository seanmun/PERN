import { describe, it, expect } from 'vitest';
import { autoSplitByHandicap } from '@buddycup/scoring/team-split';

function player(id: string, handicap: number) {
  return { id, handicap };
}

describe('autoSplitByHandicap', () => {
  it('splits an even roster into two equal-size sides', () => {
    const players = Array.from({ length: 16 }, (_, i) => player(`p${i}`, i));
    const { sideA, sideB } = autoSplitByHandicap(players);
    expect(sideA.length + sideB.length).toBe(16);
    expect(Math.abs(sideA.length - sideB.length)).toBeLessThanOrEqual(1);
  });

  it('every player appears exactly once, across both sides', () => {
    const players = Array.from({ length: 13 }, (_, i) => player(`p${i}`, 20 - i));
    const { sideA, sideB } = autoSplitByHandicap(players);
    const all = [...sideA, ...sideB];
    expect(new Set(all).size).toBe(players.length);
    expect(all.length).toBe(players.length);
  });

  it('keeps average handicap close between sides (snake draft in groups of 4)', () => {
    // 20 players, handicaps 1..20 — every group of 4 contributes its
    // best+worst to A and its two middle players to B, so both sides'
    // average should land near the same value.
    const players = Array.from({ length: 20 }, (_, i) => player(`p${i}`, i + 1));
    const byId = new Map(players.map((p) => [p.id, p.handicap]));
    const { sideA, sideB } = autoSplitByHandicap(players);
    const avg = (ids: string[]) =>
      ids.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0) / ids.length;
    expect(Math.abs(avg(sideA) - avg(sideB))).toBeLessThan(1);
  });

  it('is deterministic for the same input', () => {
    const players = [player('a', 12), player('b', 4), player('c', 18), player('d', 7)];
    const first = autoSplitByHandicap(players);
    const second = autoSplitByHandicap(players);
    expect(first).toEqual(second);
  });

  it('handles an empty roster', () => {
    expect(autoSplitByHandicap([])).toEqual({ sideA: [], sideB: [] });
  });
});
