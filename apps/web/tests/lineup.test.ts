/**
 * Lineup derivation tests.
 *
 * The setup form's whole promise is "pick a course, players and a game,
 * and the teams and foursomes fill themselves in". These tests lock in
 * the cases a user would actually set up, plus two invariants that must
 * never break:
 *
 *   1. No group ever exceeds four seats (updateTeeTimeRoster throws).
 *   2. Every derived match PASSES the real match-builder validator —
 *      the same function the server action runs before writing. That is
 *      what guarantees the form can't hand the user a lineup whose
 *      Create button is disabled with no explanation.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveLineup,
  preferredSideSize,
  FOURSOME_MAX,
  type LineupPlayer,
} from '@buddycup/scoring/lineup';
import {
  validateBuilderState,
  type BuilderContext,
} from '@buddycup/scoring/validation/match-builder';
import { FORMAT_META, type FormatId } from '@buddycup/scoring/formats';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

/** N players with spread-out handicaps so the auto-split has something to do. */
function roster(n: number): LineupPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    handicap: i * 2,
    teamId: null,
  }));
}

function derive(n: number, formats: FormatId[]) {
  return deriveLineup({
    players: roster(n),
    formats,
    teamAId: TEAM_A,
    teamBId: TEAM_B,
  });
}

/**
 * Run every derived match through the real validator, using the derived
 * groups as the tee-time map — exactly what the server will see.
 */
function assertAllMatchesValid(result: ReturnType<typeof deriveLineup>) {
  const memberTeamById = new Map(Object.entries(result.teamByPlayer));
  const memberTeeTimeById = new Map<string, string | null>();
  result.groups.forEach((g, i) =>
    g.forEach((id) => memberTeeTimeById.set(id, `tee-${i}`)),
  );
  const ctx: BuilderContext = { memberTeamById, memberTeeTimeById };

  for (const m of result.matches) {
    const v = validateBuilderState(
      {
        format: m.format,
        sideSize: m.sideSize,
        sideATeamId: TEAM_A,
        sideBTeamId: TEAM_B,
        sideAPlayerIds: m.sideAPlayerIds,
        sideBPlayerIds: m.sideBPlayerIds,
      },
      ctx,
    );
    expect(
      v.ok,
      `${m.format} ${m.sideSize}v${m.sideSize} rejected: ${v.errors.join('; ')}`,
    ).toBe(true);
  }
}

describe('preferredSideSize — fill a foursome, not a bus', () => {
  it('best ball with plenty of players is 2v2, not 4v4', () => {
    expect(preferredSideSize('best_ball', 4)).toBe(2);
  });

  it('scramble defaults to 2v2 so one match fills one group', () => {
    expect(preferredSideSize('scramble', 4)).toBe(2);
  });

  it('30 ball has no choice — 3 a side, even though 6 > 4 seats', () => {
    expect(preferredSideSize('thirty_ball', 4)).toBe(3);
  });

  it('bingo bango bongo prefers 2v2, filling its single foursome', () => {
    expect(preferredSideSize('bingo_bango_bongo', 4)).toBe(2);
  });

  it('singles is always 1v1', () => {
    expect(preferredSideSize('singles', 4)).toBe(1);
  });

  it('a thin roster falls back to what it can field', () => {
    expect(preferredSideSize('best_ball', 1)).toBe(2); // smallest legal
    expect(preferredSideSize('stroke', 1)).toBe(1);
  });
});

describe('the cases a user actually sets up', () => {
  it('4 players, best ball — one group, one 2v2', () => {
    const r = derive(4, ['best_ball']);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toHaveLength(4);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].sideSize).toBe(2);
    assertAllMatchesValid(r);
  });

  it('6 players, 30 ball — 3v3, each side in its own group', () => {
    const r = derive(6, ['thirty_ball']);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].sideSize).toBe(3);
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0]).toHaveLength(3);
    expect(r.groups[1]).toHaveLength(3);
    // Each side rides together — that's the format's actual requirement.
    const [m] = r.matches;
    expect(new Set(m.sideAPlayerIds).size).toBe(3);
    assertAllMatchesValid(r);
  });

  it('8 players, scramble — two 2v2 scrambles in two groups', () => {
    const r = derive(8, ['scramble']);
    expect(r.matches).toHaveLength(2);
    expect(r.matches.every((m) => m.sideSize === 2)).toBe(true);
    expect(r.groups).toHaveLength(2);
    expect(r.groups.every((g) => g.length === 4)).toBe(true);
    assertAllMatchesValid(r);
  });

  it('8 players, best ball — two 2v2 matches, two groups', () => {
    const r = derive(8, ['best_ball']);
    expect(r.matches).toHaveLength(2);
    expect(r.groups).toHaveLength(2);
    assertAllMatchesValid(r);
  });

  it('4 players, bingo bango bongo — everyone in ONE group', () => {
    const r = derive(4, ['bingo_bango_bongo']);
    expect(FORMAT_META.bingo_bango_bongo.requiresSingleFoursome).toBe(true);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toHaveLength(4);
    expect(r.matches).toHaveLength(1);
    assertAllMatchesValid(r);
  });

  it('4 players, singles — two 1v1s sharing one foursome', () => {
    const r = derive(4, ['singles']);
    expect(r.matches).toHaveLength(2);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toHaveLength(4);
    assertAllMatchesValid(r);
  });

  it('12 players, best ball — three groups of four', () => {
    const r = derive(12, ['best_ball']);
    expect(r.groups).toHaveLength(3);
    expect(r.groups.every((g) => g.length === 4)).toBe(true);
    expect(r.matches).toHaveLength(3);
    assertAllMatchesValid(r);
  });
});

describe('invariants that must never break', () => {
  const FORMATS: FormatId[] = [
    'singles',
    'best_ball',
    'two_man_aggregate',
    'scramble',
    'alternate_shot',
    'stroke',
    'thirty_ball',
    'bingo_bango_bongo',
  ];

  it('no group ever exceeds four seats, any roster, any format', () => {
    for (const format of FORMATS) {
      for (let n = 1; n <= 24; n++) {
        const r = derive(n, [format]);
        for (const g of r.groups) {
          expect(
            g.length,
            `${format} with ${n} players produced a group of ${g.length}`,
          ).toBeLessThanOrEqual(FOURSOME_MAX);
        }
      }
    }
  });

  it('no player is seated in two groups, and none is lost', () => {
    for (const format of FORMATS) {
      for (let n = 1; n <= 24; n++) {
        const r = derive(n, [format]);
        const seated = r.groups.flat();
        expect(new Set(seated).size, `${format} n=${n} duplicate seat`).toBe(
          seated.length,
        );
        expect(seated.length, `${format} n=${n} lost a player`).toBe(n);
      }
    }
  });

  it('every derived match passes the real builder validator', () => {
    for (const format of FORMATS) {
      for (let n = 1; n <= 24; n++) {
        assertAllMatchesValid(derive(n, [format]));
      }
    }
  });

  it('every player lands on exactly one of the two teams', () => {
    for (let n = 1; n <= 24; n++) {
      const r = derive(n, ['best_ball']);
      expect(Object.keys(r.teamByPlayer)).toHaveLength(n);
      for (const teamId of Object.values(r.teamByPlayer)) {
        expect([TEAM_A, TEAM_B]).toContain(teamId);
      }
    }
  });

  it('a match never puts the same player on both sides', () => {
    for (const format of FORMATS) {
      for (let n = 1; n <= 24; n++) {
        for (const m of derive(n, [format]).matches) {
          const overlap = m.sideAPlayerIds.filter((id) =>
            m.sideBPlayerIds.includes(id),
          );
          expect(overlap, `${format} n=${n}`).toEqual([]);
        }
      }
    }
  });

  it('a player is never in two matches of the same format', () => {
    for (const format of FORMATS) {
      for (let n = 1; n <= 24; n++) {
        const used = new Set<string>();
        for (const m of derive(n, [format]).matches) {
          for (const id of [...m.sideAPlayerIds, ...m.sideBPlayerIds]) {
            expect(used.has(id), `${format} n=${n} double-booked ${id}`).toBe(
              false,
            );
            used.add(id);
          }
        }
      }
    }
  });
});

describe('honest notes instead of silent failure', () => {
  it('says so when the roster is too thin for the game', () => {
    // 30 Ball needs 3 a side; 4 players only fields 2.
    const r = derive(4, ['thirty_ball']);
    expect(r.matches).toHaveLength(0);
    expect(r.notes.join(' ')).toMatch(/30 Ball/);
    expect(r.notes.join(' ')).toMatch(/3 per side/);
  });

  it('flags an uneven roster rather than quietly dropping someone', () => {
    const r = derive(5, ['best_ball']);
    expect(r.notes.join(' ')).toMatch(/uneven/i);
    // The odd player is still seated in a group — never lost.
    expect(r.groups.flat()).toHaveLength(5);
  });

  it('asks for a game when none is picked, but still splits teams', () => {
    const r = derive(8, []);
    expect(r.matches).toHaveLength(0);
    expect(r.governingFormat).toBeNull();
    expect(r.groups.flat()).toHaveLength(8);
    expect(r.notes.join(' ')).toMatch(/Pick a game/);
  });

  it('empty roster asks for players', () => {
    const r = derive(0, ['best_ball']);
    expect(r.groups).toEqual([]);
    expect(r.notes.join(' ')).toMatch(/Add players/);
  });
});

describe('existing team assignments', () => {
  it('are respected when every player has one', () => {
    const players: LineupPlayer[] = [
      { id: 'p1', handicap: 0, teamId: TEAM_A },
      { id: 'p2', handicap: 5, teamId: TEAM_A },
      { id: 'p3', handicap: 10, teamId: TEAM_B },
      { id: 'p4', handicap: 15, teamId: TEAM_B },
    ];
    const r = deriveLineup({
      players,
      formats: ['best_ball'],
      teamAId: TEAM_A,
      teamBId: TEAM_B,
      respectExistingTeams: true,
    });
    expect(r.teamByPlayer.p1).toBe(TEAM_A);
    expect(r.teamByPlayer.p2).toBe(TEAM_A);
    expect(r.teamByPlayer.p3).toBe(TEAM_B);
    expect(r.teamByPlayer.p4).toBe(TEAM_B);
    assertAllMatchesValid(r);
  });

  it('are re-split when only some players are assigned', () => {
    const players: LineupPlayer[] = [
      { id: 'p1', handicap: 0, teamId: TEAM_A },
      { id: 'p2', handicap: 5, teamId: null },
      { id: 'p3', handicap: 10, teamId: null },
      { id: 'p4', handicap: 15, teamId: null },
    ];
    const r = deriveLineup({
      players,
      formats: ['best_ball'],
      teamAId: TEAM_A,
      teamBId: TEAM_B,
      respectExistingTeams: true,
    });
    // A half-assigned roster would field 1 v 3; it re-splits to 2 v 2.
    const counts = Object.values(r.teamByPlayer).reduce<Record<string, number>>(
      (acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }),
      {},
    );
    expect(counts[TEAM_A]).toBe(2);
    expect(counts[TEAM_B]).toBe(2);
  });
});
