/**
 * Bingo Bango Bongo engine tests.
 *
 * BBB is judgment-point scoring — three points per hole (first on green,
 * closest once all on, first to hole out) awarded by the group and
 * COMMITTED per hole, not derived from grosses. These tests pin: side
 * totals from per-player points, washed (null) points awarding nothing,
 * higher-points-wins finality only when all holes are committed, and the
 * defensive handling of a winner id that isn't in the match.
 */

import { describe, it, expect } from 'vitest';
import {
  computeBingoBangoBongo,
  formatBbbStatus,
  type BbbHolePoints,
  type EnginePlayer,
} from '@buddycup/scoring/engine';

// 2v2 foursome: Eric & Lee (A) vs Peter & Munley (B).
const PLAYERS: EnginePlayer[] = [
  { id: 'Eric', handicap: 9, teamSide: 'A' },
  { id: 'Lee', handicap: 14, teamSide: 'A' },
  { id: 'Peter', handicap: 22, teamSide: 'B' },
  { id: 'Munley', handicap: 29, teamSide: 'B' },
];

function hole(
  holeNumber: number,
  bingo: string | null,
  bango: string | null,
  bongo: string | null,
): BbbHolePoints {
  return { holeNumber, bingo, bango, bongo };
}

describe('computeBingoBangoBongo', () => {
  it('no committed holes → not started', () => {
    const r = computeBingoBangoBongo({ players: PLAYERS, totalHoles: 18, points: [] });
    expect(r.status.kind).toBe('not_started');
    expect(r.pointsA).toBe(0);
    expect(r.pointsB).toBe(0);
  });

  it('sums per-player points into side totals', () => {
    const r = computeBingoBangoBongo({
      players: PLAYERS,
      totalHoles: 18,
      points: [
        hole(1, 'Eric', 'Peter', 'Eric'), // A2 B1
        hole(2, 'Munley', 'Munley', 'Lee'), // A1 B2
      ],
    });
    expect(r.status.kind).toBe('in_progress');
    expect(r.pointsA).toBe(3);
    expect(r.pointsB).toBe(3);
    expect(r.pointsByPlayer.get('Eric')).toBe(2);
    expect(r.pointsByPlayer.get('Munley')).toBe(2);
    expect(r.pointsByPlayer.get('Lee')).toBe(1);
    expect(r.pointsByPlayer.get('Peter')).toBe(1);
    expect(r.holesCommitted).toBe(2);
  });

  it('washed (null) points award nothing but the hole still counts as committed', () => {
    const r = computeBingoBangoBongo({
      players: PLAYERS,
      totalHoles: 18,
      points: [hole(1, null, null, null)],
    });
    expect(r.holesCommitted).toBe(1);
    expect(r.pointsA).toBe(0);
    expect(r.pointsB).toBe(0);
    expect(r.holeResults[0]).toMatchObject({ aPoints: 0, bPoints: 0 });
  });

  it('a winner id not in the match earns nothing (defensive)', () => {
    const r = computeBingoBangoBongo({
      players: PLAYERS,
      totalHoles: 18,
      points: [hole(1, 'Stranger', 'Eric', null)],
    });
    expect(r.pointsA).toBe(1);
    expect(r.pointsB).toBe(0);
    expect(r.pointsByPlayer.has('Stranger')).toBe(false);
  });

  it('final only when every hole is committed; higher points wins', () => {
    const seventeen = Array.from({ length: 17 }, (_, i) =>
      hole(i + 1, 'Eric', null, null),
    );
    const partial = computeBingoBangoBongo({
      players: PLAYERS,
      totalHoles: 18,
      points: seventeen,
    });
    expect(partial.status.kind).toBe('in_progress');

    const done = computeBingoBangoBongo({
      players: PLAYERS,
      totalHoles: 18,
      points: [...seventeen, hole(18, 'Peter', 'Peter', 'Peter')],
    });
    expect(done.status.kind).toBe('final');
    if (done.status.kind === 'final') {
      expect(done.status.winner).toBe('A'); // 17 vs 3
    }
  });

  it('equal totals at the end → halved', () => {
    const points = Array.from({ length: 18 }, (_, i) =>
      hole(i + 1, 'Eric', 'Peter', null), // 1-1 every hole
    );
    const r = computeBingoBangoBongo({ players: PLAYERS, totalHoles: 18, points });
    expect(r.status.kind).toBe('final');
    if (r.status.kind === 'final') expect(r.status.winner).toBe('halved');
  });
});

describe('formatBbbStatus', () => {
  it('renders running, final, and halved forms', () => {
    expect(formatBbbStatus({ kind: 'not_started' })).toBe('—');
    expect(
      formatBbbStatus({ kind: 'in_progress', pointsA: 7, pointsB: 5, holesCommitted: 4 }),
    ).toBe('7-5 thru 4');
    expect(
      formatBbbStatus({ kind: 'final', pointsA: 16, pointsB: 11, winner: 'A' }),
    ).toBe('16-11');
    expect(
      formatBbbStatus({ kind: 'final', pointsA: 13, pointsB: 13, winner: 'halved' }),
    ).toBe('Halved 13-13');
  });
});
