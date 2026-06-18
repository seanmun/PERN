/**
 * Match-builder validation tests. Locks in the rules the UI relies on
 * for greying drop targets AND the server action relies on for refusing
 * to write broken matchups.
 */

import { describe, it, expect } from 'vitest';
import {
  validateBuilderState,
  getMatchTeeTimeId,
  canDropOnSide,
  type BuilderState,
  type BuilderContext,
} from '@buddycup/scoring/validation/match-builder';

// Two teams, four players each, two tee times split 2/2.
const TEAM_A = 'team-aaa';
const TEAM_B = 'team-bbb';
const TEE_1 = 'tee-time-1';
const TEE_2 = 'tee-time-2';

const PLAYERS = {
  // Tee time 1: A1, A2, B1, B2
  A1: { id: 'p-a1', teamId: TEAM_A, teeTimeId: TEE_1 },
  A2: { id: 'p-a2', teamId: TEAM_A, teeTimeId: TEE_1 },
  B1: { id: 'p-b1', teamId: TEAM_B, teeTimeId: TEE_1 },
  B2: { id: 'p-b2', teamId: TEAM_B, teeTimeId: TEE_1 },
  // Tee time 2: A3, A4, B3, B4
  A3: { id: 'p-a3', teamId: TEAM_A, teeTimeId: TEE_2 },
  A4: { id: 'p-a4', teamId: TEAM_A, teeTimeId: TEE_2 },
  B3: { id: 'p-b3', teamId: TEAM_B, teeTimeId: TEE_2 },
  B4: { id: 'p-b4', teamId: TEAM_B, teeTimeId: TEE_2 },
};

function makeCtx(overrides?: Partial<BuilderContext>): BuilderContext {
  const memberTeamById = new Map<string, string>();
  const memberTeeTimeById = new Map<string, string | null>();
  for (const p of Object.values(PLAYERS)) {
    memberTeamById.set(p.id, p.teamId);
    memberTeeTimeById.set(p.id, p.teeTimeId);
  }
  return { memberTeamById, memberTeeTimeById, ...overrides };
}

describe('validateBuilderState — happy paths', () => {
  it('1v1 singles, opposing teams, anywhere — ok', () => {
    const state: BuilderState = {
      format: 'singles',
      sideSize: 1,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id],
      sideBPlayerIds: [PLAYERS.B3.id], // different foursome — fine for singles
    };
    expect(validateBuilderState(state, makeCtx())).toEqual({ ok: true, errors: [] });
  });

  it('2v2 best ball, cross-foursome — ok (no same-foursome rule)', () => {
    const state: BuilderState = {
      format: 'best_ball',
      sideSize: 2,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A3.id],
      sideBPlayerIds: [PLAYERS.B2.id, PLAYERS.B4.id],
    };
    expect(validateBuilderState(state, makeCtx()).ok).toBe(true);
  });

  it('4v4 best ball across both foursomes — ok', () => {
    const state: BuilderState = {
      format: 'best_ball',
      sideSize: 4,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A2.id, PLAYERS.A3.id, PLAYERS.A4.id],
      sideBPlayerIds: [PLAYERS.B1.id, PLAYERS.B2.id, PLAYERS.B3.id, PLAYERS.B4.id],
    };
    expect(validateBuilderState(state, makeCtx()).ok).toBe(true);
  });

  it('2-man scramble, each side intra-foursome — ok', () => {
    const state: BuilderState = {
      format: 'scramble',
      sideSize: 2,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A2.id], // both tee 1
      sideBPlayerIds: [PLAYERS.B1.id, PLAYERS.B2.id], // both tee 1
    };
    expect(validateBuilderState(state, makeCtx()).ok).toBe(true);
  });

  it('4-man scramble — A team in foursome 1, B team in foursome 2 — ok', () => {
    // Each SIDE shares a foursome; the two sides don't.
    const state: BuilderState = {
      format: 'scramble',
      sideSize: 4,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A2.id, PLAYERS.A3.id, PLAYERS.A4.id],
      sideBPlayerIds: [PLAYERS.B1.id, PLAYERS.B2.id, PLAYERS.B3.id, PLAYERS.B4.id],
    };
    // A1+A2 are in tee 1, A3+A4 are in tee 2 — Side A has TWO tee times
    // → rejected. Adjust to keep each side in one tee time.
    expect(validateBuilderState(state, makeCtx()).ok).toBe(false);
  });
});

describe('validateBuilderState — error cases', () => {
  it('rejects empty slots', () => {
    const state: BuilderState = {
      format: 'singles',
      sideSize: 1,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [null],
      sideBPlayerIds: [PLAYERS.B1.id],
    };
    const res = validateBuilderState(state, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.toLowerCase().includes('empty slot'))).toBe(true);
  });

  it('rejects same team on both sides', () => {
    const state: BuilderState = {
      format: 'singles',
      sideSize: 1,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_A, // same team — should fail
      sideAPlayerIds: [PLAYERS.A1.id],
      sideBPlayerIds: [PLAYERS.A2.id],
    };
    const res = validateBuilderState(state, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('different teams'))).toBe(true);
  });

  it('rejects wrong-team player in a side', () => {
    const state: BuilderState = {
      format: 'singles',
      sideSize: 1,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.B1.id], // B player in A's slot
      sideBPlayerIds: [PLAYERS.B2.id],
    };
    const res = validateBuilderState(state, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('wrong team'))).toBe(true);
  });

  it('rejects duplicate player on a side', () => {
    const state: BuilderState = {
      format: 'best_ball',
      sideSize: 2,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A1.id], // dupe
      sideBPlayerIds: [PLAYERS.B1.id, PLAYERS.B2.id],
    };
    const res = validateBuilderState(state, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('multiple slots'))).toBe(true);
  });

  it('rejects scramble with players from two foursomes on one side', () => {
    const state: BuilderState = {
      format: 'scramble',
      sideSize: 2,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A3.id], // tee 1 + tee 2 — fail
      sideBPlayerIds: [PLAYERS.B1.id, PLAYERS.B2.id],
    };
    const res = validateBuilderState(state, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.toLowerCase().includes('foursome'))).toBe(true);
  });

  it('rejects unsupported side size for format', () => {
    const state: BuilderState = {
      format: 'singles',
      sideSize: 2, // singles is 1v1
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A2.id],
      sideBPlayerIds: [PLAYERS.B1.id, PLAYERS.B2.id],
    };
    const res = validateBuilderState(state, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("doesn't support"))).toBe(true);
  });
});

describe('getMatchTeeTimeId', () => {
  it('returns the tee time when every filled slot shares one', () => {
    const state: BuilderState = {
      format: 'best_ball',
      sideSize: 2,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A2.id],
      sideBPlayerIds: [PLAYERS.B1.id, PLAYERS.B2.id],
    };
    expect(getMatchTeeTimeId(state, makeCtx())).toBe(TEE_1);
  });

  it('returns null when the match spans foursomes', () => {
    const state: BuilderState = {
      format: 'best_ball',
      sideSize: 4,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, PLAYERS.A2.id, PLAYERS.A3.id, PLAYERS.A4.id],
      sideBPlayerIds: [PLAYERS.B1.id, PLAYERS.B2.id, PLAYERS.B3.id, PLAYERS.B4.id],
    };
    expect(getMatchTeeTimeId(state, makeCtx())).toBeNull();
  });
});

describe('canDropOnSide', () => {
  it('best_ball lets you drop anywhere', () => {
    const state: BuilderState = {
      format: 'best_ball',
      sideSize: 2,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, null],
      sideBPlayerIds: [null, null],
    };
    // A3 is in a DIFFERENT tee time than A1 — best ball is fine with that.
    expect(canDropOnSide(state, makeCtx(), 'A', PLAYERS.A3.id)).toBe(true);
  });

  it('scramble blocks a drop that would mix foursomes on one side', () => {
    const state: BuilderState = {
      format: 'scramble',
      sideSize: 2,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [PLAYERS.A1.id, null], // A1 in tee 1
      sideBPlayerIds: [null, null],
    };
    // A3 is in tee 2 — would put 2 tee times on Side A. Drop must be denied.
    expect(canDropOnSide(state, makeCtx(), 'A', PLAYERS.A3.id)).toBe(false);
    // A2 is in tee 1 — drop allowed.
    expect(canDropOnSide(state, makeCtx(), 'A', PLAYERS.A2.id)).toBe(true);
  });

  it('scramble allows a drop on an empty side regardless of foursome', () => {
    const state: BuilderState = {
      format: 'scramble',
      sideSize: 2,
      sideATeamId: TEAM_A,
      sideBTeamId: TEAM_B,
      sideAPlayerIds: [null, null], // empty
      sideBPlayerIds: [PLAYERS.B1.id, null],
    };
    // No incumbent on A, so the foursome of the incoming player sets
    // the side's foursome.
    expect(canDropOnSide(state, makeCtx(), 'A', PLAYERS.A1.id)).toBe(true);
    expect(canDropOnSide(state, makeCtx(), 'A', PLAYERS.A3.id)).toBe(true);
  });
});
