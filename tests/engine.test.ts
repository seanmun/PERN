/**
 * Match-play scoring engine tests.
 *
 * These tests pin the behavior of lib/scoring/engine.ts so the math can't
 * silently drift. Every match-play rule the user actually cares about
 * (stroke allocation, hole closure, dormie, halved, best ball, aggregate,
 * scramble, alternate shot) has at least one concrete numeric assertion.
 *
 * Naming convention for handicaps: Eric=9, Lee=14, Peter=22, Munley=29.
 * These are the numbers the user has been testing with on prod.
 */

import { describe, it, expect } from 'vitest';
import {
  computeStrokes,
  computeMatch,
  computeTeamMatch,
  computeTeamHandicap,
  formatStatus,
  winnerSide,
  type EnginePlayer,
  type EngineHole,
  type EngineScore,
} from '@/lib/scoring/engine';

const HOLES_18: EngineHole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  handicapIndex: i + 1, // 1 = hardest, 18 = easiest
}));

const HOLE_SI1: EngineHole = { number: 1, par: 4, handicapIndex: 1 };

describe('computeStrokes — USGA stroke allocation', () => {
  it('the lowest-handicap player in the match plays scratch (0 strokes per hole)', () => {
    const players: EnginePlayer[] = [
      { id: 'Eric', handicap: 9, teamSide: 'A' },
      { id: 'Munley', handicap: 29, teamSide: 'A' },
    ];
    const strokes = computeStrokes(players, HOLES_18);
    for (let h = 1; h <= 18; h++) {
      expect(strokes.get('Eric')?.get(h)).toBe(0);
    }
  });

  it('a 20-diff player gets 1 stroke on every hole + an extra on the 2 hardest', () => {
    // Munley 29 vs Eric 9 = diff 20. base=floor(20/18)=1, extra on holes with SI <= 2.
    const players: EnginePlayer[] = [
      { id: 'Eric', handicap: 9, teamSide: 'A' },
      { id: 'Munley', handicap: 29, teamSide: 'B' },
    ];
    const s = computeStrokes(players, HOLES_18);
    expect(s.get('Munley')?.get(1)).toBe(2); // SI 1 → base + extra
    expect(s.get('Munley')?.get(2)).toBe(2); // SI 2 → base + extra
    expect(s.get('Munley')?.get(3)).toBe(1); // SI 3 → base only
    expect(s.get('Munley')?.get(18)).toBe(1); // SI 18 → base only
  });

  it('singles match-up: 22 vs 29 → 29 gets 1 stroke on SI 1, 0 on SI 8+', () => {
    // Peter 22 vs Munley 29: diff 7, base=0, extra on holes with SI <= 7.
    const players: EnginePlayer[] = [
      { id: 'Peter', handicap: 22, teamSide: 'A' },
      { id: 'Munley', handicap: 29, teamSide: 'B' },
    ];
    const s = computeStrokes(players, HOLES_18);
    expect(s.get('Peter')?.get(1)).toBe(0);
    expect(s.get('Munley')?.get(1)).toBe(1);
    expect(s.get('Munley')?.get(7)).toBe(1);
    expect(s.get('Munley')?.get(8)).toBe(0);
  });

  it('equal handicaps → both players get 0 strokes everywhere', () => {
    const players: EnginePlayer[] = [
      { id: 'A', handicap: 12, teamSide: 'A' },
      { id: 'B', handicap: 12, teamSide: 'B' },
    ];
    const s = computeStrokes(players, HOLES_18);
    for (let h = 1; h <= 18; h++) {
      expect(s.get('A')?.get(h)).toBe(0);
      expect(s.get('B')?.get(h)).toBe(0);
    }
  });

  it('handicap exactly 18 → 1 stroke on every hole, no extras', () => {
    const players: EnginePlayer[] = [
      { id: 'Scratch', handicap: 0, teamSide: 'A' },
      { id: 'Bogey', handicap: 18, teamSide: 'B' },
    ];
    const s = computeStrokes(players, HOLES_18);
    for (let h = 1; h <= 18; h++) {
      expect(s.get('Bogey')?.get(h)).toBe(1);
    }
  });

  it('negative handicap (scratch+) does not produce negative strokes', () => {
    const players: EnginePlayer[] = [
      { id: 'Tour', handicap: -2, teamSide: 'A' },
      { id: 'Club', handicap: 8, teamSide: 'B' },
    ];
    const s = computeStrokes(players, HOLES_18);
    expect(s.get('Tour')?.get(1)).toBe(0);
    expect(s.get('Club')?.get(1)).toBe(1); // 8 - (-2) = 10 → 1 stroke on SI <= 10
  });
});

describe('computeMatch — Best Ball (2v2)', () => {
  it("Eric's net 3 beats Lee's net 4 on hole 1 — side A goes 1 UP", () => {
    // User's real scenario: Eric (9, gross 3) + Munley (29, gross 5) on side A;
    // Peter (22, gross 6) + Lee (14, gross 5) on side B. Hole 1 SI 1.
    const players: EnginePlayer[] = [
      { id: 'Eric', handicap: 9, teamSide: 'A' },
      { id: 'Munley', handicap: 29, teamSide: 'A' },
      { id: 'Peter', handicap: 22, teamSide: 'B' },
      { id: 'Lee', handicap: 14, teamSide: 'B' },
    ];
    const scores: EngineScore[] = [
      { playerId: 'Eric', holeNumber: 1, gross: 3 },
      { playerId: 'Munley', holeNumber: 1, gross: 5 },
      { playerId: 'Peter', holeNumber: 1, gross: 6 },
      { playerId: 'Lee', holeNumber: 1, gross: 5 },
    ];
    const computed = computeMatch({
      players,
      holes: HOLES_18, // full course so closure doesn't fire on the 1 played hole
      scores,
      format: 'best_ball',
    });
    // Eric's net: 3 - 0 = 3. Munley's net: 5 - 2 = 3. Side A best = 3.
    // Lee's net: 5 - 1 = 4. Peter's net: 6 - 1 = 5. Side B best = 4.
    expect(computed.upA).toBe(1);
    expect(computed.upB).toBe(0);
    expect(formatStatus(computed.status)).toBe('1 UP');
  });

  it('only one side has scored on a hole — hole does not count yet', () => {
    const players: EnginePlayer[] = [
      { id: 'A1', handicap: 10, teamSide: 'A' },
      { id: 'B1', handicap: 10, teamSide: 'B' },
    ];
    const scores: EngineScore[] = [
      { playerId: 'A1', holeNumber: 1, gross: 4 },
      // B1 hasn't scored yet
    ];
    const computed = computeMatch({
      players,
      holes: HOLES_18,
      scores,
      format: 'best_ball',
    });
    expect(computed.upA).toBe(0);
    expect(computed.upB).toBe(0);
    expect(computed.holesPlayed).toBe(0);
  });
});

describe('computeMatch — Singles (1v1)', () => {
  it("Munley (5 gross, 1 stroke) net 4 beats Peter's net 6 → Munley 1 UP", () => {
    // Singles in the user's stacked scenario: Munley vs Peter, hole 1 SI 1.
    const players: EnginePlayer[] = [
      { id: 'Munley', handicap: 29, teamSide: 'A' },
      { id: 'Peter', handicap: 22, teamSide: 'B' },
    ];
    const scores: EngineScore[] = [
      { playerId: 'Munley', holeNumber: 1, gross: 5 },
      { playerId: 'Peter', holeNumber: 1, gross: 6 },
    ];
    const computed = computeMatch({
      players,
      holes: HOLES_18,
      scores,
      format: 'singles',
    });
    // Peter is low handicap (22) → 0 strokes. Munley diff 7 → 1 stroke on SI 1.
    // Munley net 5-1=4. Peter net 6-0=6. Munley wins.
    expect(computed.upA).toBe(1);
    expect(computed.upB).toBe(0);
  });
});

describe('computeMatch — Two-Man Aggregate', () => {
  it('aggregate sums both nets per side — needs BOTH players scored to count', () => {
    const players: EnginePlayer[] = [
      { id: 'A1', handicap: 10, teamSide: 'A' },
      { id: 'A2', handicap: 10, teamSide: 'A' },
      { id: 'B1', handicap: 10, teamSide: 'B' },
      { id: 'B2', handicap: 10, teamSide: 'B' },
    ];
    // Only A1 has a score on hole 1 — aggregate sees A as null, hole skipped.
    const partial: EngineScore[] = [
      { playerId: 'A1', holeNumber: 1, gross: 4 },
      { playerId: 'B1', holeNumber: 1, gross: 5 },
      { playerId: 'B2', holeNumber: 1, gross: 5 },
    ];
    const partialComputed = computeMatch({
      players,
      holes: HOLES_18,
      scores: partial,
      format: 'two_man_aggregate',
    });
    expect(partialComputed.holesPlayed).toBe(0);

    // Both players score — A=4+4=8, B=5+5=10 → A wins.
    const full: EngineScore[] = [
      { playerId: 'A1', holeNumber: 1, gross: 4 },
      { playerId: 'A2', holeNumber: 1, gross: 4 },
      { playerId: 'B1', holeNumber: 1, gross: 5 },
      { playerId: 'B2', holeNumber: 1, gross: 5 },
    ];
    const fullComputed = computeMatch({
      players,
      holes: HOLES_18,
      scores: full,
      format: 'two_man_aggregate',
    });
    expect(fullComputed.upA).toBe(1);
    expect(fullComputed.upB).toBe(0);
  });
});

describe('formatStatus — match-play status text', () => {
  function statusOf(upA: number, upB: number, holesPlayed: number) {
    // Always use a full 18-hole course so the closure logic only fires when
    // we deliberately set lead > (18 - holesPlayed). The number of scores
    // written controls how many holes have actually been played; unplayed
    // holes just don't contribute.
    const players: EnginePlayer[] = [
      { id: 'A', handicap: 0, teamSide: 'A' },
      { id: 'B', handicap: 0, teamSide: 'B' },
    ];
    const scores: EngineScore[] = [];
    let aWins = upA;
    let bWins = upB;
    let ties = holesPlayed - upA - upB;
    // Interleave: ties first, then losses, then wins last — keeps the running
    // lead small mid-round so closure doesn't fire before the final tally.
    const order: ('tie' | 'b' | 'a')[] = [];
    while (ties > 0) {
      order.push('tie');
      ties--;
    }
    while (bWins > 0) {
      order.push('b');
      bWins--;
    }
    while (aWins > 0) {
      order.push('a');
      aWins--;
    }
    order.forEach((kind, idx) => {
      const h = idx + 1;
      if (kind === 'a') {
        scores.push({ playerId: 'A', holeNumber: h, gross: 3 });
        scores.push({ playerId: 'B', holeNumber: h, gross: 4 });
      } else if (kind === 'b') {
        scores.push({ playerId: 'A', holeNumber: h, gross: 4 });
        scores.push({ playerId: 'B', holeNumber: h, gross: 3 });
      } else {
        scores.push({ playerId: 'A', holeNumber: h, gross: 4 });
        scores.push({ playerId: 'B', holeNumber: h, gross: 4 });
      }
    });
    return formatStatus(
      computeMatch({ players, holes: HOLES_18, scores, format: 'singles' }).status,
    );
  }

  it('AS when even after at least one hole', () => {
    expect(statusOf(0, 0, 0)).toBe('—');
    expect(statusOf(1, 1, 2)).toBe('AS');
  });

  it('X UP when leader has X more than the other side', () => {
    expect(statusOf(2, 0, 2)).toBe('2 UP');
    expect(statusOf(3, 1, 4)).toBe('2 UP');
  });

  it('DORMIE when lead equals remaining holes', () => {
    // 17 holes played, side A up 1 → 1 remaining = dormie.
    expect(statusOf(2, 1, 17)).toBe('DORMIE');
  });

  it('closed when lead > remaining (X & Y notation)', () => {
    // After 10 holes, side A is up 9 → 8 remaining, closed 9 & 8.
    expect(statusOf(9, 0, 10)).toBe('9 & 8');
  });

  it('halved when 18 holes played and tied', () => {
    expect(statusOf(9, 9, 18)).toBe('AS');
  });
});

describe('winnerSide', () => {
  it('returns null while the match is in progress', () => {
    const players: EnginePlayer[] = [
      { id: 'A', handicap: 0, teamSide: 'A' },
      { id: 'B', handicap: 0, teamSide: 'B' },
    ];
    const status = computeMatch({
      players,
      holes: HOLES_18.slice(0, 5),
      scores: [
        { playerId: 'A', holeNumber: 1, gross: 3 },
        { playerId: 'B', holeNumber: 1, gross: 4 },
      ],
      format: 'singles',
    }).status;
    expect(winnerSide(status)).toBeNull();
  });
});

describe('computeTeamHandicap — USGA team formulas', () => {
  it('2-person scramble: 35% low + 15% high', () => {
    // Eric 9, Munley 29 → 0.35*9 + 0.15*29 = 3.15 + 4.35 = 7.5
    expect(computeTeamHandicap([9, 29], 'scramble')).toBe(7.5);
    // Order-independent: sort happens inside.
    expect(computeTeamHandicap([29, 9], 'scramble')).toBe(7.5);
  });

  it('4-person scramble: 25/20/15/10% sorted low→high', () => {
    // Eric 9, Lee 14, Peter 22, Munley 29 → 0.25*9 + 0.20*14 + 0.15*22 + 0.10*29
    //   = 2.25 + 2.8 + 3.3 + 2.9 = 11.25 → rounds to 11.3
    expect(computeTeamHandicap([9, 14, 22, 29], 'scramble')).toBe(11.3);
  });

  it('2-person alternate shot: 50% of combined', () => {
    expect(computeTeamHandicap([10, 20], 'alternate_shot')).toBe(15);
  });

  it('scramble with 1, 3, or 5 players → throws', () => {
    expect(() => computeTeamHandicap([10], 'scramble')).toThrow();
    expect(() => computeTeamHandicap([10, 12, 14], 'scramble')).toThrow();
    expect(() => computeTeamHandicap([10, 12, 14, 16, 18], 'scramble')).toThrow();
  });

  it('alternate_shot with anything ≠ 2 → throws', () => {
    expect(() => computeTeamHandicap([10], 'alternate_shot')).toThrow();
    expect(() => computeTeamHandicap([10, 12, 14, 16], 'alternate_shot')).toThrow();
  });
});

describe('computeTeamMatch — scramble + alternate shot', () => {
  it('higher-handicap team gets the strokes; lower team plays scratch', () => {
    const computed = computeTeamMatch({
      teams: [
        { id: 'high-team', side: 'A', handicap: 18 },
        { id: 'low-team', side: 'B', handicap: 8 },
      ],
      holes: HOLES_18,
      scores: [
        { teamId: 'high-team', holeNumber: 1, gross: 5 },
        { teamId: 'low-team', holeNumber: 1, gross: 5 },
      ],
    });
    // diff = 10 → high team gets 1 stroke on holes with SI <= 10.
    // High net 5-1=4 vs low net 5-0=5. High team wins hole 1.
    expect(computed.upA).toBe(1);
    expect(computed.upB).toBe(0);
  });

  it('equal team handicaps → no strokes; gross wins straight up', () => {
    const computed = computeTeamMatch({
      teams: [
        { id: 'A', side: 'A', handicap: 10 },
        { id: 'B', side: 'B', handicap: 10 },
      ],
      holes: HOLES_18,
      scores: [
        { teamId: 'A', holeNumber: 1, gross: 4 },
        { teamId: 'B', holeNumber: 1, gross: 5 },
      ],
    });
    expect(computed.upA).toBe(1);
  });
});

describe('Match closure logic', () => {
  it('"dormie" when up by exactly the holes remaining', () => {
    // After 9 holes side A is up 9 — 9 remaining = dormie.
    const players: EnginePlayer[] = [
      { id: 'A', handicap: 0, teamSide: 'A' },
      { id: 'B', handicap: 0, teamSide: 'B' },
    ];
    const scores: EngineScore[] = [];
    for (let h = 1; h <= 9; h++) {
      scores.push({ playerId: 'A', holeNumber: h, gross: 3 });
      scores.push({ playerId: 'B', holeNumber: h, gross: 4 });
    }
    const computed = computeMatch({
      players,
      holes: HOLES_18,
      scores,
      format: 'singles',
    });
    expect(formatStatus(computed.status)).toBe('DORMIE');
  });

  it('match closes when lead > remaining (10 & 8 after 10 holes)', () => {
    const players: EnginePlayer[] = [
      { id: 'A', handicap: 0, teamSide: 'A' },
      { id: 'B', handicap: 0, teamSide: 'B' },
    ];
    const scores: EngineScore[] = [];
    // Side A wins every hole 1..10 → 10 UP, 8 remaining → closed.
    for (let h = 1; h <= 10; h++) {
      scores.push({ playerId: 'A', holeNumber: h, gross: 3 });
      scores.push({ playerId: 'B', holeNumber: h, gross: 4 });
    }
    const computed = computeMatch({
      players,
      holes: HOLES_18,
      scores,
      format: 'singles',
    });
    expect(formatStatus(computed.status)).toBe('10 & 8');
    expect(winnerSide(computed.status)).toBe('A');
  });

  it('post-closure scores do not change the result', () => {
    const players: EnginePlayer[] = [
      { id: 'A', handicap: 0, teamSide: 'A' },
      { id: 'B', handicap: 0, teamSide: 'B' },
    ];
    const scores: EngineScore[] = [];
    // Close it out by hole 10
    for (let h = 1; h <= 10; h++) {
      scores.push({ playerId: 'A', holeNumber: h, gross: 3 });
      scores.push({ playerId: 'B', holeNumber: h, gross: 4 });
    }
    // Side B wins every remaining hole — should not flip the result.
    for (let h = 11; h <= 18; h++) {
      scores.push({ playerId: 'A', holeNumber: h, gross: 5 });
      scores.push({ playerId: 'B', holeNumber: h, gross: 3 });
    }
    const computed = computeMatch({
      players,
      holes: HOLES_18,
      scores,
      format: 'singles',
    });
    expect(winnerSide(computed.status)).toBe('A');
    expect(formatStatus(computed.status)).toBe('10 & 8');
  });
});
