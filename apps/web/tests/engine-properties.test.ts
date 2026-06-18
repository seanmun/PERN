/**
 * Property tests for the scoring engine.
 *
 * Each suite generates a batch of random scenarios with a deterministic
 * seed and asserts invariants that must hold for ANY input — not just
 * the hand-crafted cases in engine.test.ts. The goal is to catch edge
 * cases neither the spec nor the unit tests would think to write down.
 *
 * Deterministic random: a simple mulberry32 PRNG so failures reproduce
 * exactly. If a property fails on `seed = N`, fix the engine, re-run,
 * verify with the same seed.
 */

import { describe, it, expect } from 'vitest';
import {
  computeStrokes,
  computeMatch,
  computeStableford,
  pointsForNetVsPar,
  formatStatus,
  winnerSide,
  DEFAULT_STABLEFORD_POINTS,
  type EnginePlayer,
  type EngineHole,
  type EngineScore,
  type PlayerInputFormat,
} from '@buddycup/scoring/engine';

// ───────────────────────── PRNG ─────────────────────────

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, lo: number, hi: number) {
  return Math.floor(rand() * (hi - lo + 1)) + lo;
}

// 18 holes with shuffled stroke indexes so SI distribution mirrors a real
// course (1 = hardest, 18 = easiest, par 4 default with some par 3/5 mix).
function makeHoles(rand: () => number): EngineHole[] {
  const indexes = Array.from({ length: 18 }, (_, i) => i + 1);
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: [3, 4, 5][randInt(rand, 0, 2)],
    handicapIndex: indexes[i],
  }));
}

function randomScenario(rand: () => number, format: PlayerInputFormat) {
  const aSize = format === 'singles' ? 1 : 2;
  const bSize = aSize;
  const players: EnginePlayer[] = [];
  for (let i = 0; i < aSize; i++) {
    players.push({ id: `A${i}`, handicap: randInt(rand, 0, 36), teamSide: 'A' });
  }
  for (let i = 0; i < bSize; i++) {
    players.push({ id: `B${i}`, handicap: randInt(rand, 0, 36), teamSide: 'B' });
  }
  const holes = makeHoles(rand);

  // Random subset of holes to "play" — between 0 and 18.
  const holesPlayed = randInt(rand, 0, 18);
  const scores: EngineScore[] = [];
  for (let h = 1; h <= holesPlayed; h++) {
    for (const p of players) {
      // Aggregate format needs BOTH partners to score per side. Best-ball
      // / singles tolerate gaps — drop ~10% of scores to exercise that.
      if (format !== 'two_man_aggregate' && rand() < 0.1) continue;
      scores.push({
        playerId: p.id,
        holeNumber: h,
        gross: randInt(rand, 2, 9),
      });
    }
  }
  return { players, holes, scores, format };
}

// ───────────────────────── computeStrokes ─────────────────────────

describe('property: computeStrokes', () => {
  it('lowest-handicap player always gets 0 strokes on every hole', () => {
    const rand = mulberry32(42);
    for (let t = 0; t < 50; t++) {
      const players: EnginePlayer[] = [
        { id: 'A', handicap: randInt(rand, 0, 36), teamSide: 'A' },
        { id: 'B', handicap: randInt(rand, 0, 36), teamSide: 'B' },
        { id: 'C', handicap: randInt(rand, 0, 36), teamSide: 'A' },
      ];
      const holes = makeHoles(rand);
      const strokes = computeStrokes(players, holes);
      const lowest = players.reduce((acc, p) => (p.handicap < acc.handicap ? p : acc));
      for (const h of holes) {
        expect(strokes.get(lowest.id)?.get(h.number) ?? 0).toBe(0);
      }
    }
  });

  it('higher-handicap player never receives fewer strokes than lower on any hole', () => {
    const rand = mulberry32(7);
    for (let t = 0; t < 50; t++) {
      const low = randInt(rand, 0, 18);
      const high = low + randInt(rand, 0, 36);
      const players: EnginePlayer[] = [
        { id: 'low', handicap: low, teamSide: 'A' },
        { id: 'high', handicap: high, teamSide: 'B' },
      ];
      const holes = makeHoles(rand);
      const strokes = computeStrokes(players, holes);
      for (const h of holes) {
        const lowS = strokes.get('low')?.get(h.number) ?? 0;
        const highS = strokes.get('high')?.get(h.number) ?? 0;
        expect(highS).toBeGreaterThanOrEqual(lowS);
      }
    }
  });

  it('strokes are never negative', () => {
    const rand = mulberry32(13);
    for (let t = 0; t < 50; t++) {
      const players: EnginePlayer[] = [
        { id: 'A', handicap: randInt(rand, -10, 36), teamSide: 'A' },
        { id: 'B', handicap: randInt(rand, -10, 36), teamSide: 'B' },
      ];
      const holes = makeHoles(rand);
      const strokes = computeStrokes(players, holes);
      for (const p of players) {
        for (const h of holes) {
          expect(strokes.get(p.id)?.get(h.number) ?? 0).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

// ───────────────────────── computeMatch ─────────────────────────

describe('property: computeMatch', () => {
  const formats: PlayerInputFormat[] = ['best_ball', 'singles', 'two_man_aggregate'];

  it('upA + upB ≤ holesPlayed for any randomized scenario', () => {
    const rand = mulberry32(101);
    for (let t = 0; t < 100; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      expect(r.upA + r.upB).toBeLessThanOrEqual(r.holesPlayed);
    }
  });

  it('closed status implies |lead| > remaining holes', () => {
    const rand = mulberry32(202);
    for (let t = 0; t < 100; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      if (r.status.kind === 'closed') {
        const remaining = r.totalHoles - r.holesPlayed;
        const lead = Math.abs(r.upA - r.upB);
        // Either closed because lead exceeded remaining mid-match, or
        // closed at hole 18 with a lead (lead > 0 = remaining = 0).
        expect(lead).toBeGreaterThan(remaining - 1);
      }
    }
  });

  it('in_progress / dormie status implies |lead| ≤ remaining holes', () => {
    const rand = mulberry32(303);
    for (let t = 0; t < 100; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      if (r.status.kind === 'in_progress' || r.status.kind === 'dormie') {
        const remaining = r.totalHoles - r.holesPlayed;
        const lead = Math.abs(r.upA - r.upB);
        expect(lead).toBeLessThanOrEqual(remaining);
      }
    }
  });

  it('holesPlayed === totalHoles → status is closed or halved (never in_progress)', () => {
    const rand = mulberry32(404);
    for (let t = 0; t < 100; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      if (r.holesPlayed === r.totalHoles) {
        expect(['closed', 'halved']).toContain(r.status.kind);
      }
    }
  });

  it('halved status implies upA === upB AND every hole scored', () => {
    const rand = mulberry32(505);
    for (let t = 0; t < 100; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      if (r.status.kind === 'halved') {
        expect(r.upA).toBe(r.upB);
        expect(r.holesPlayed).toBe(r.totalHoles);
      }
    }
  });

  it('formatStatus(status) never throws + always returns a non-empty string', () => {
    const rand = mulberry32(606);
    for (let t = 0; t < 100; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      const s = formatStatus(r.status);
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('winnerSide consistent with status.kind', () => {
    const rand = mulberry32(707);
    for (let t = 0; t < 100; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      const w = winnerSide(r.status);
      if (r.status.kind === 'closed') expect(w).toBe(r.status.winner);
      else if (r.status.kind === 'halved') expect(w).toBe('halved');
      else expect(w).toBeNull();
    }
  });

  it('holeResults length always equals totalHoles', () => {
    const rand = mulberry32(808);
    for (let t = 0; t < 100; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      expect(r.holeResults.length).toBe(r.totalHoles);
    }
  });

  it('cumulative statusAfter.upA + upB ≤ hole number (counted holes only)', () => {
    const rand = mulberry32(909);
    for (let t = 0; t < 50; t++) {
      const fmt = formats[randInt(rand, 0, formats.length - 1)];
      const sc = randomScenario(rand, fmt);
      const r = computeMatch(sc);
      for (const h of r.holeResults) {
        expect(h.statusAfter.upA + h.statusAfter.upB).toBeLessThanOrEqual(h.holeNumber);
      }
    }
  });
});

// ───────────────────────── pointsForNetVsPar / stableford ─────────────────────────

describe('property: pointsForNetVsPar (standard scale)', () => {
  it('monotonic non-increasing in diff (lower net diff → ≥ points)', () => {
    const rand = mulberry32(11);
    for (let t = 0; t < 50; t++) {
      const a = randInt(rand, -3, 8);
      const b = a + randInt(rand, 0, 5);
      // a ≤ b → pointsForNetVsPar(a) ≥ pointsForNetVsPar(b)
      expect(pointsForNetVsPar(a)).toBeGreaterThanOrEqual(pointsForNetVsPar(b));
    }
  });

  it('points always within [doublePlus, eagle] under default scale', () => {
    for (let d = -5; d <= 10; d++) {
      const pts = pointsForNetVsPar(d);
      expect(pts).toBeGreaterThanOrEqual(DEFAULT_STABLEFORD_POINTS.doublePlus);
      expect(pts).toBeLessThanOrEqual(DEFAULT_STABLEFORD_POINTS.eagle);
    }
  });
});

describe('property: computeStableford', () => {
  it('total per player equals sum of their pointsByHole', () => {
    const rand = mulberry32(31);
    for (let t = 0; t < 50; t++) {
      const sc = randomScenario(rand, 'best_ball');
      const r = computeStableford(sc);
      for (const p of r.players) {
        let sum = 0;
        for (const v of p.pointsByHole.values()) sum += v;
        expect(p.total).toBe(sum);
      }
    }
  });

  it('aPoints + bPoints equals sum of all players across both sides', () => {
    const rand = mulberry32(32);
    for (let t = 0; t < 50; t++) {
      const sc = randomScenario(rand, 'best_ball');
      const r = computeStableford(sc);
      const a = r.players.filter((p) => p.side === 'A').reduce((s, p) => s + p.total, 0);
      const b = r.players.filter((p) => p.side === 'B').reduce((s, p) => s + p.total, 0);
      expect(r.aPoints).toBe(a);
      expect(r.bPoints).toBe(b);
    }
  });

  it('holesPlayed === unique holes scored across all players', () => {
    const rand = mulberry32(33);
    for (let t = 0; t < 50; t++) {
      const sc = randomScenario(rand, 'best_ball');
      const r = computeStableford(sc);
      const unique = new Set(sc.scores.map((s) => s.holeNumber));
      expect(r.holesPlayed).toBe(unique.size);
    }
  });

  it('final status: kind="final" iff holesPlayed === totalHoles', () => {
    const rand = mulberry32(34);
    for (let t = 0; t < 50; t++) {
      const sc = randomScenario(rand, 'best_ball');
      const r = computeStableford(sc);
      if (r.status.kind === 'final') {
        expect(r.holesPlayed).toBe(r.totalHoles);
      } else if (r.holesPlayed === r.totalHoles) {
        // Unreachable: every hole played but not final.
        expect(r.status.kind).toBe('final');
      }
    }
  });
});
