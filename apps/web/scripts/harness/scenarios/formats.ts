/**
 * §8 format matrix — all eight formats, end to end.
 *
 * For each format the harness does the whole loop the spec describes:
 *
 *   deriveLineup (§6.1 "what")  →  createEventFromForm (§6.3 submit)
 *     →  assert the DB rows (trip / members / teams / groups / matches)
 *     →  score through the real action for that input shape (§5)
 *     →  assert the resolver's four columns (§7.2)
 *     →  assert the scoreboard totals (§7.3)
 *
 * Team A is given a 3 on every hole and team B a 4, with every handicap
 * at 0, so the expected result is identical across formats: A wins, one
 * point, nothing halved. That uniformity is the point — §7.2 says there
 * is ONE result shape, so one set of expectations should hold for all
 * eight. A format that needs its own special-cased expectation here is a
 * format leaking knowledge upward.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { roundFormatEnum } from '@/db/schema';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { FORMAT_META, isTeamInput, type FormatId } from '@buddycup/scoring/formats';
import { FOURSOME_MAX } from '@buddycup/scoring/lineup';
import {
  assert,
  assertEq,
  assertIncludes,
  note,
  scenario,
  type HarnessActor,
} from '../core';
import {
  buildPayload,
  createEvent,
  createEventExpectingFailure,
  loadEvent,
  makeCourse,
  reloadMatch,
  type RosterEntry,
} from '../world';
import {
  commitBbb,
  commitThirtyBall,
  playIndividualRound,
  playTeamRound,
} from '../scoring';

const WINNER_GROSS = 3;
const LOSER_GROSS = 4;

type FormatCase = {
  format: FormatId;
  /** Total roster, split evenly across the two teams. */
  roster: number;
  expectSideSize: number;
  expectGroups: number;
  expectMatches: number;
  /**
   * A match hangs off a tee time only when everyone in it rides there.
   * 30 Ball's two sides are 6 players, so they ride separately and the
   * match is round-wide with a null tee_time_id.
   */
  expectTeeTimeOnMatch: boolean;
};

const CASES: FormatCase[] = [
  { format: 'singles', roster: 2, expectSideSize: 1, expectGroups: 1, expectMatches: 1, expectTeeTimeOnMatch: true },
  { format: 'best_ball', roster: 4, expectSideSize: 2, expectGroups: 1, expectMatches: 1, expectTeeTimeOnMatch: true },
  { format: 'two_man_aggregate', roster: 4, expectSideSize: 2, expectGroups: 1, expectMatches: 1, expectTeeTimeOnMatch: true },
  { format: 'scramble', roster: 4, expectSideSize: 2, expectGroups: 1, expectMatches: 1, expectTeeTimeOnMatch: true },
  { format: 'alternate_shot', roster: 4, expectSideSize: 2, expectGroups: 1, expectMatches: 1, expectTeeTimeOnMatch: true },
  { format: 'stroke', roster: 2, expectSideSize: 1, expectGroups: 1, expectMatches: 1, expectTeeTimeOnMatch: true },
  { format: 'thirty_ball', roster: 6, expectSideSize: 3, expectGroups: 2, expectMatches: 1, expectTeeTimeOnMatch: false },
  { format: 'bingo_bango_bongo', roster: 4, expectSideSize: 2, expectGroups: 1, expectMatches: 1, expectTeeTimeOnMatch: true },
];

function roster(size: number, format: FormatId): RosterEntry[] {
  const perTeam = size / 2;
  const out: RosterEntry[] = [];
  for (let i = 0; i < perTeam; i++) {
    out.push({ nickname: `${format}-A${i + 1}`, team: 'A', handicap: '0.0' });
  }
  for (let i = 0; i < perTeam; i++) {
    out.push({ nickname: `${format}-B${i + 1}`, team: 'B', handicap: '0.0' });
  }
  return out;
}

/** The `round_format` values the DATABASE actually has, not the ones schema.ts declares. */
async function dbRoundFormats(): Promise<string[]> {
  const rows = (await db.execute(
    sql`select e.enumlabel as label
          from pg_enum e
          join pg_type t on t.oid = e.enumtypid
         where t.typname = 'round_format'
         order by e.enumsortorder`,
  )) as unknown as { rows?: { label: string }[] } | { label: string }[];
  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
  return list.map((r) => r.label);
}

export async function runFormatMatrix(admin: HarnessActor): Promise<void> {
  // §12.2 gate. The spec is explicit that a missing enum value must fail
  // loudly rather than being skipped, because "alternate shot is
  // unreachable" is precisely the kind of hole that survived July.
  await scenario('§12.2 · alternate_shot enum prerequisite', async () => {
    const inSchema = (roundFormatEnum.enumValues as readonly string[]).includes(
      'alternate_shot',
    );
    assert(
      inSchema,
      "db/schema.ts roundFormatEnum contains 'alternate_shot' (§12 migration 2)",
    );
    const inDb = await dbRoundFormats();
    assert(
      inDb.includes('alternate_shot'),
      "database round_format enum contains 'alternate_shot' (§12 migration 2)",
    );
    if (!inSchema || !inDb.includes('alternate_shot')) {
      note(`round_format is currently: ${inDb.join(', ')}`);
      note(
        "until the migration runs, createEventFromForm rejects it at isRoundFormat() and the format is unreachable",
      );
    }
  });

  for (const c of CASES) {
    await scenario(`§8 · ${FORMAT_META[c.format].label} — create → score → resolve → scoreboard`, () =>
      runFormatCase(admin, c),
    );
  }
}

/**
 * §7.1 — a stroke-play side of 2+ is the SUM of its players' nets, not the
 * best one.
 *
 * The scores are chosen so the two rules disagree about who wins, which is
 * the only way to tell them apart from the outside:
 *
 *   A: 4 + 4 = 8   best 4
 *   B: 3 + 6 = 9   best 3
 *
 * Sum says A wins every hole. Best ball says B wins every hole. Before the
 * fix, `stroke` was coerced to best_ball in recompute.ts and this match
 * resolved to B.
 */
export async function runStrokeAggregation(admin: HarnessActor): Promise<void> {
  await scenario('§7.1 · Stroke play, 2 a side — side number is the SUM of nets', async () => {
    const course = await makeCourse('stroke-sum');
    const entries: RosterEntry[] = [
      { nickname: 'sum-A1', team: 'A', handicap: '0.0' },
      { nickname: 'sum-A2', team: 'A', handicap: '0.0' },
      { nickname: 'sum-B1', team: 'B', handicap: '0.0' },
      { nickname: 'sum-B2', team: 'B', handicap: '0.0' },
    ];
    const { payload } = buildPayload({
      name: 'stroke-sum',
      courseId: course.courseId,
      roster: entries,
      formats: ['stroke'],
    });
    assertEq(payload.matches[0]?.sideSize, 2, 'derived a 2-a-side stroke match');

    const created = await createEvent(admin, payload);
    const ev = await loadEvent(created.slug);
    const { match } = ev.matches[0];
    assertEq(match.scoring, 'stroke', 'resolves under stroke scoring');

    const teamA = ev.teams.find((t) => t.name === 'MachIans');
    const teamB = ev.teams.find((t) => t.name === 'Douchebags');
    if (!teamA || !teamB) return void assert(false, 'teams resolvable');

    const gross: Record<string, number> = {
      [ev.byNickname.get('sum-A1')!.id]: 4,
      [ev.byNickname.get('sum-A2')!.id]: 4,
      [ev.byNickname.get('sum-B1')!.id]: 3,
      [ev.byNickname.get('sum-B2')!.id]: 6,
    };
    await playIndividualRound(admin, {
      matchId: match.id,
      memberIds: Object.keys(gross),
      grossFor: (memberId) => gross[memberId],
    });

    const resolved = await reloadMatch(match.id);
    assertEq(resolved.status, 'completed', 'match status');
    assertEq(
      resolved.winningTeamId,
      teamA.id,
      'A wins on summed nets (8 v 9) — best-ball aggregation would hand it to B',
    );
    assertEq(resolved.isHalved, false, 'not halved');
    // 18 holes × 8 vs 18 × 9.
    assertIncludes(resolved.resultText, '144', 'result text carries A’s 18-hole total');
    assertIncludes(resolved.resultText, '162', 'result text carries B’s 18-hole total');

    const board = await getLeaderboard(ev.trip.id);
    assertEq(
      board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? -1,
      1,
      'scoreboard: team A points',
    );
  });
}

async function runFormatCase(admin: HarnessActor, c: FormatCase): Promise<void> {
  const course = await makeCourse(`${c.format}`);
  const entries = roster(c.roster, c.format);
  const { payload, notes } = buildPayload({
    name: `fmt-${c.format}`,
    courseId: course.courseId,
    roster: entries,
    formats: [c.format],
  });

  for (const n of notes) note(`deriveLineup: ${n}`);

  // ---- Derivation is the contract the form relies on -------------------
  assertEq(payload.groups.length, c.expectGroups, 'derived groups');
  assertEq(payload.matches.length, c.expectMatches, 'derived matchups');
  assert(
    payload.groups.every((g) => g.length <= FOURSOME_MAX),
    `no derived group exceeds ${FOURSOME_MAX} seats`,
  );
  if (payload.matches.length) {
    assertEq(payload.matches[0].sideSize, c.expectSideSize, 'derived side size');
  }

  // ---- Submit through the real action ---------------------------------
  const supported = (roundFormatEnum.enumValues as readonly string[]).includes(
    c.format,
  );
  if (!supported) {
    const err = await createEventExpectingFailure(admin, payload);
    // Not a pass. The format is in scope for v1 (§8) and the harness
    // records that it cannot be created at all.
    assert(
      false,
      `${FORMAT_META[c.format].label} can be created — blocked by the missing enum: "${err.message}"`,
    );
    return;
  }

  const created = await createEvent(admin, payload);
  const ev = await loadEvent(created.slug);

  // ---- §6.3 write ordering landed everything --------------------------
  assertEq(ev.trip.kind, c.expectGroups > 1 ? 'outing' : 'match', 'derived event kind');
  assertEq(ev.teams.length, 2, 'teams written');
  assertEq(ev.members.length, c.roster + 1, 'members written (roster + creator)');
  assertEq(ev.rounds.length, 1, 'rounds written');
  assertEq(ev.rounds[0].format, c.format, 'round format');
  assertEq(ev.groups.length, c.expectGroups, 'groups (tee_times) written');
  assert(
    ev.groups.every((g) => g.memberIds.length <= FOURSOME_MAX),
    `no persisted group exceeds ${FOURSOME_MAX} seats`,
  );
  assertEq(ev.matches.length, c.expectMatches, 'matches written');

  const { match, participants } = ev.matches[0];
  assertEq(match.format, c.format, 'match format');
  assertEq(match.templateSizeA, c.expectSideSize, 'match templateSizeA');
  assertEq(match.templateSizeB, c.expectSideSize, 'match templateSizeB');
  assertEq(participants.length, c.expectSideSize * 2, 'match participants');
  assertEq(
    match.teeTimeId != null,
    c.expectTeeTimeOnMatch,
    'match is seated at a tee time',
  );

  // §7.2: stroke play is a resolution mode, and a match whose FORMAT is
  // stroke play must resolve under it. Anything else silently scores
  // "Stroke Play" as best-ball match play.
  if (c.format === 'stroke') {
    assertEq(match.scoring, 'stroke', 'stroke-play match resolves under stroke scoring');
  }

  const teamA = ev.teams.find((t) => t.name === 'MachIans');
  const teamB = ev.teams.find((t) => t.name === 'Douchebags');
  if (!teamA || !teamB) {
    assert(false, 'both teams resolvable by name');
    return;
  }

  const sideAIds = participants.filter((p) => p.teamId === teamA.id).map((p) => p.tripMemberId);
  const sideBIds = participants.filter((p) => p.teamId === teamB.id).map((p) => p.tripMemberId);
  assertEq(sideAIds.length, c.expectSideSize, 'side A seats filled');
  assertEq(sideBIds.length, c.expectSideSize, 'side B seats filled');

  // ---- §5 — score through the shape this format actually uses ---------
  if (isTeamInput(c.format)) {
    await playTeamRound(admin, {
      matchId: match.id,
      teamIds: [teamA.id, teamB.id],
      grossFor: (teamId) => (teamId === teamA.id ? WINNER_GROSS : LOSER_GROSS),
    });
  } else {
    const aSet = new Set(sideAIds);
    await playIndividualRound(admin, {
      matchId: match.id,
      memberIds: [...sideAIds, ...sideBIds],
      grossFor: (memberId) => (aSet.has(memberId) ? WINNER_GROSS : LOSER_GROSS),
    });

    if (c.format === 'thirty_ball') {
      // §5 attribution layer: after the grosses exist, each side commits
      // which of them count. One ball a hole keeps both sides inside the
      // 30 budget and leaves A ahead on raw strokes.
      for (let hole = 1; hole <= 18; hole++) {
        await commitThirtyBall(admin, {
          matchId: match.id,
          teamId: teamA.id,
          holeNumber: hole,
          counted: [sideAIds[0]],
        });
        await commitThirtyBall(admin, {
          matchId: match.id,
          teamId: teamB.id,
          holeNumber: hole,
          counted: [sideBIds[0]],
        });
      }
    }

    if (c.format === 'bingo_bango_bongo') {
      // Judgment points, not gross-derived. Award all three to A.
      for (let hole = 1; hole <= 18; hole++) {
        await commitBbb(admin, {
          matchId: match.id,
          holeNumber: hole,
          bingo: sideAIds[0],
          bango: sideAIds[0],
          bongo: sideAIds[0],
        });
      }
    }
  }

  // ---- §7.2 — one result shape, whatever the format -------------------
  const resolved = await reloadMatch(match.id);
  assertEq(resolved.status, 'completed', 'match status');
  assertEq(resolved.winningTeamId, teamA.id, 'winning side is A');
  assertEq(resolved.isHalved, false, 'not halved');
  assert(
    typeof resolved.resultText === 'string' && resolved.resultText.length > 0,
    `result text is populated (${resolved.resultText})`,
  );

  // ---- §7.3 — the scoreboard sums the contract, no format branches ----
  const board = await getLeaderboard(ev.trip.id);
  const aPoints = board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? -1;
  const bPoints = board.teamTotals.find((t) => t.teamId === teamB.id)?.points ?? -1;
  assertEq(aPoints, 1, 'scoreboard: team A points');
  assertEq(bPoints, 0, 'scoreboard: team B points');
  assertEq(board.matchesContested, 1, 'scoreboard: matches contested');
  assertEq(board.pointsAvailable, 0, 'scoreboard: points still available');

  // Team-score formats produce no per-player grosses, so their players
  // are absent from the individual race rather than sitting on zeros.
  const played = board.playerTotals.filter((p) => p.holesScored > 0).length;
  if (isTeamInput(c.format)) {
    assertEq(played, 0, 'individual leaderboard omits team-score players');
  } else {
    assertEq(played, c.roster, 'individual leaderboard covers every player');
  }
}
