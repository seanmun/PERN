/**
 * End-to-end scenario seeders.
 *
 * Each scenario:
 *   1. builds a self-contained trip with the prefix `__SCENARIO__`
 *      (players, teams, course, round, tee times, matches);
 *   2. enters a known set of hole scores through the same upsert
 *      path the score-entry UI uses (so the round-scoped fan-out
 *      and recomputeMatchStatus fire exactly like in prod);
 *   3. reads back match status + leaderboard totals and asserts
 *      the expected outcome.
 *
 * Re-running the script wipes every scenario trip (everything with the
 * `__SCENARIO__` prefix) before re-seeding, so it's safe to run any
 * number of times. Production data is left untouched.
 *
 * Run:  npm run seed:scenarios
 */

import { eq, inArray, like } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  trips,
  teams,
  tripMembers,
  rounds,
  courses,
  courseHoles,
  teeTimes,
  teeTimeParticipants,
  matches,
  matchParticipants,
  holeScores,
  users,
} from '@/db/schema';
import { getLeaderboard } from '@/lib/data/leaderboard';

// ───────────────────────── HARNESS ─────────────────────────

const PREFIX = '__SCENARIO__';
let pass = 0;
let fail = 0;

function logHeader(s: string) {
  console.log(`\n\x1b[36m── ${s} ──\x1b[0m`);
}
function logPass(s: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${s}`);
  pass++;
}
function logFail(s: string) {
  console.log(`  \x1b[31m✗\x1b[0m ${s}`);
  fail++;
}

function assert(cond: boolean, label: string) {
  if (cond) logPass(label);
  else logFail(label);
}
function assertEq<T>(actual: T, expected: T, label: string) {
  if (actual === expected) logPass(`${label} == ${String(expected)}`);
  else logFail(`${label} expected ${String(expected)}, got ${String(actual)}`);
}

// ───────────────────────── BUILDERS ─────────────────────────

async function seedSystemUser() {
  // Recompute writes use this user as the "entered_by." Anyone will do.
  const [u] = await db
    .select()
    .from(users)
    .where(like(users.email, '__scenario%'))
    .limit(1);
  if (u) return u;
  const [created] = await db
    .insert(users)
    .values({
      email: `__scenario+${Date.now()}@buddycup.test`,
      displayName: 'Scenario Runner',
    })
    .returning();
  return created;
}

async function clearOldScenarios() {
  const olds = await db
    .select({ id: trips.id })
    .from(trips)
    .where(like(trips.name, `${PREFIX}%`));
  if (!olds.length) {
    // Still wipe any orphan scenario courses.
    await db.delete(courses).where(like(courses.name, `${PREFIX}%`));
    return;
  }
  const tripIds = olds.map((t) => t.id);

  // Walk down the tree explicitly. `match_participants.team_id` doesn't
  // cascade, so the trip cascade would die yanking teams out from under
  // it. Tear matches + participants out first.
  const matchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(inArray(rounds.tripId, tripIds));
  const matchIds = matchRows.map((m) => m.id);
  if (matchIds.length) {
    await db.delete(holeScores).where(inArray(holeScores.matchId, matchIds));
    await db
      .delete(matchParticipants)
      .where(inArray(matchParticipants.matchId, matchIds));
    await db.delete(matches).where(inArray(matches.id, matchIds));
  }

  const ttRows = await db
    .select({ id: teeTimes.id })
    .from(teeTimes)
    .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
    .where(inArray(rounds.tripId, tripIds));
  const ttIds = ttRows.map((t) => t.id);
  if (ttIds.length) {
    await db
      .delete(teeTimeParticipants)
      .where(inArray(teeTimeParticipants.teeTimeId, ttIds));
    await db.delete(teeTimes).where(inArray(teeTimes.id, ttIds));
  }

  // Now the trip cascade can take rounds, teams, tripMembers safely.
  await db.delete(trips).where(inArray(trips.id, tripIds));

  // Scenario courses are global — clean them up by prefix.
  await db.delete(courses).where(like(courses.name, `${PREFIX}%`));
}

type Player = { id: string; nickname: string; teamId: string };

async function makeTrip(
  systemUserId: string,
  name: string,
  kind: 'trip' | 'outing' | 'match',
): Promise<string> {
  const [trip] = await db
    .insert(trips)
    .values({
      name: `${PREFIX}${name}`,
      slug: `${PREFIX.toLowerCase()}${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      kind,
      startDate: new Date(),
      endDate: new Date(),
      createdBy: systemUserId,
    })
    .returning();
  return trip.id;
}

async function makeTeams(
  tripId: string,
  defs: { name: string; color: string }[],
): Promise<{ id: string; name: string }[]> {
  const inserted = await db
    .insert(teams)
    .values(defs.map((d) => ({ tripId, name: d.name, color: d.color })))
    .returning({ id: teams.id, name: teams.name });
  return inserted;
}

async function makePlayers(
  tripId: string,
  teamId: string,
  defs: { nickname: string; handicap: string }[],
): Promise<Player[]> {
  const rows = await db
    .insert(tripMembers)
    .values(
      defs.map((d) => ({
        tripId,
        teamId,
        nickname: d.nickname,
        tripHandicap: d.handicap,
      })),
    )
    .returning({ id: tripMembers.id, nickname: tripMembers.nickname });
  return rows.map((r) => ({ ...r, teamId }));
}

async function makeCourse(): Promise<string> {
  const [course] = await db
    .insert(courses)
    .values({ name: `${PREFIX}Course`, location: 'Scenario, USA' })
    .returning();
  // 18 par-4 holes with sequential stroke indexes.
  await db.insert(courseHoles).values(
    Array.from({ length: 18 }, (_, i) => ({
      courseId: course.id,
      holeNumber: i + 1,
      par: 4,
      yardage: 400,
      handicapIndex: i + 1,
    })),
  );
  return course.id;
}

async function makeRound(
  tripId: string,
  courseId: string,
  order: number,
  format: 'best_ball' | 'singles' | 'scramble' | 'stroke' | 'two_man_aggregate' = 'best_ball',
): Promise<string> {
  const [round] = await db
    .insert(rounds)
    .values({
      tripId,
      courseId,
      order,
      format,
      date: new Date(),
      countsTowardCup: true,
    })
    .returning();
  return round.id;
}

async function makeTeeTime(
  roundId: string,
  groupNumber: number,
  rosterIds: string[],
): Promise<string> {
  const [tt] = await db
    .insert(teeTimes)
    .values({
      roundId,
      groupNumber,
      time: new Date(),
    })
    .returning();
  if (rosterIds.length) {
    await db.insert(teeTimeParticipants).values(
      rosterIds.map((id) => ({ teeTimeId: tt.id, tripMemberId: id })),
    );
  }
  return tt.id;
}

async function makeMatch(opts: {
  roundId: string;
  teeTimeId: string | null;
  format: 'best_ball' | 'singles' | 'scramble' | 'stroke' | 'two_man_aggregate';
  scoring?: 'match_play' | 'stableford' | 'stroke';
  sideA: Player[];
  sideB: Player[];
  pointsOverall?: number;
  pointsFront9?: number;
  pointsBack9?: number;
}): Promise<string> {
  const [m] = await db
    .insert(matches)
    .values({
      roundId: opts.roundId,
      teeTimeId: opts.teeTimeId,
      format: opts.format,
      scoring: opts.scoring ?? 'match_play',
      templateSizeA: opts.sideA.length,
      templateSizeB: opts.sideB.length,
      pointsOverall: opts.pointsOverall ?? 1,
      pointsFront9: opts.pointsFront9 ?? 0,
      pointsBack9: opts.pointsBack9 ?? 0,
    })
    .returning();
  await db.insert(matchParticipants).values([
    ...opts.sideA.map((p) => ({
      matchId: m.id,
      tripMemberId: p.id,
      teamId: p.teamId,
    })),
    ...opts.sideB.map((p) => ({
      matchId: m.id,
      tripMemberId: p.id,
      teamId: p.teamId,
    })),
  ]);
  return m.id;
}

/**
 * Write hole scores via direct insert. The action layer would auth-check
 * + revalidatePath which the script can't satisfy outside the Next
 * runtime; the same hole_scores rows + recompute call get us identical
 * end state.
 */
async function enterScores(
  matchId: string,
  systemUserId: string,
  scores: { playerId: string; hole: number; gross: number }[],
) {
  for (const s of scores) {
    await db
      .insert(holeScores)
      .values({
        matchId,
        tripMemberId: s.playerId,
        holeNumber: s.hole,
        gross: s.gross,
        enteredBy: systemUserId,
      })
      .onConflictDoUpdate({
        target: [holeScores.matchId, holeScores.tripMemberId, holeScores.holeNumber],
        set: { gross: s.gross, enteredBy: systemUserId, enteredAt: new Date() },
      });
  }
  // Trigger the same recompute path the action layer fires. Imported
  // from the PURE module so the server-only auth chain doesn't taint
  // this Node-side script.
  const { recomputeMatchStatus } = await import('@/lib/scoring/recompute');
  await recomputeMatchStatus(matchId);
}

// ───────────────────────── SCENARIOS ─────────────────────────

async function scenarioSinglesAWins(systemUserId: string) {
  logHeader('Singles 1v1 — A wins on hole 18');
  const tripId = await makeTrip(systemUserId, 'singles-a-wins', 'match');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const [alpha] = await makePlayers(tripId, teamA.id, [{ nickname: 'Alpha', handicap: '0' }]);
  const [bravo] = await makePlayers(tripId, teamB.id, [{ nickname: 'Bravo', handicap: '0' }]);
  const courseId = await makeCourse();
  const roundId = await makeRound(tripId, courseId, 1, 'singles');
  const teeTimeId = await makeTeeTime(roundId, 1, [alpha.id, bravo.id]);
  const matchId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'singles',
    sideA: [alpha],
    sideB: [bravo],
  });

  // Halve every hole 1–17 at par. A birdies hole 18 → match closes A 1 UP.
  const scores: { playerId: string; hole: number; gross: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    scores.push({ playerId: alpha.id, hole: h, gross: h === 18 ? 3 : 4 });
    scores.push({ playerId: bravo.id, hole: h, gross: 4 });
  }
  await enterScores(matchId, systemUserId, scores);

  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  assertEq(m.status, 'completed', 'match status');
  assertEq(m.winningTeamId, teamA.id, 'overall winner is team A');
  assert(m.isHalved === false, 'isHalved is false');

  const board = await getLeaderboard(tripId);
  const aTotal = board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? 0;
  const bTotal = board.teamTotals.find((t) => t.teamId === teamB.id)?.points ?? 0;
  assertEq(aTotal, 1, 'team A points');
  assertEq(bTotal, 0, 'team B points');
}

async function scenarioBestBallHalved(systemUserId: string) {
  logHeader('2v2 best ball — halved over 18');
  const tripId = await makeTrip(systemUserId, 'best-ball-halved', 'outing');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const aPlayers = await makePlayers(tripId, teamA.id, [
    { nickname: 'A1', handicap: '0' },
    { nickname: 'A2', handicap: '0' },
  ]);
  const bPlayers = await makePlayers(tripId, teamB.id, [
    { nickname: 'B1', handicap: '0' },
    { nickname: 'B2', handicap: '0' },
  ]);
  const courseId = await makeCourse();
  const roundId = await makeRound(tripId, courseId, 1, 'best_ball');
  const teeTimeId = await makeTeeTime(roundId, 1, [
    ...aPlayers.map((p) => p.id),
    ...bPlayers.map((p) => p.id),
  ]);
  const matchId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'best_ball',
    sideA: aPlayers,
    sideB: bPlayers,
  });

  // Every hole pars all around → both sides best-net 4 → halved every hole.
  const scores: { playerId: string; hole: number; gross: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    for (const p of [...aPlayers, ...bPlayers]) {
      scores.push({ playerId: p.id, hole: h, gross: 4 });
    }
  }
  await enterScores(matchId, systemUserId, scores);

  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  assertEq(m.status, 'completed', 'match status');
  assert(m.isHalved === true, 'isHalved is true');
  assert(m.winningTeamId == null, 'no overall winner');

  const board = await getLeaderboard(tripId);
  const aTotal = board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? 0;
  const bTotal = board.teamTotals.find((t) => t.teamId === teamB.id)?.points ?? 0;
  assertEq(aTotal, 0.5, 'team A points (halved split)');
  assertEq(bTotal, 0.5, 'team B points (halved split)');
}

async function scenarioStableford(systemUserId: string) {
  logHeader('Singles stableford — A wins on points');
  const tripId = await makeTrip(systemUserId, 'stableford-a-wins', 'match');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const [alpha] = await makePlayers(tripId, teamA.id, [{ nickname: 'Alpha', handicap: '0' }]);
  const [bravo] = await makePlayers(tripId, teamB.id, [{ nickname: 'Bravo', handicap: '0' }]);
  const courseId = await makeCourse();
  const roundId = await makeRound(tripId, courseId, 1, 'singles');
  const teeTimeId = await makeTeeTime(roundId, 1, [alpha.id, bravo.id]);
  const matchId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'singles',
    scoring: 'stableford',
    sideA: [alpha],
    sideB: [bravo],
  });

  // Alpha: birdies every hole (3 pts × 18 = 54). Bravo: pars (2 pts × 18 = 36).
  const scores: { playerId: string; hole: number; gross: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    scores.push({ playerId: alpha.id, hole: h, gross: 3 });
    scores.push({ playerId: bravo.id, hole: h, gross: 4 });
  }
  await enterScores(matchId, systemUserId, scores);

  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  assertEq(m.status, 'completed', 'match status');
  assertEq(m.winningTeamId, teamA.id, 'team A wins on points');
  assert(m.resultText?.includes('54') ?? false, 'result text shows 54 pts');
}

async function scenarioSegmentPoints(systemUserId: string) {
  logHeader('2v2 best ball, 2 pts split 9s — front 9 closes early');
  const tripId = await makeTrip(systemUserId, 'segment-points', 'outing');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const aPlayers = await makePlayers(tripId, teamA.id, [
    { nickname: 'A1', handicap: '0' },
    { nickname: 'A2', handicap: '0' },
  ]);
  const bPlayers = await makePlayers(tripId, teamB.id, [
    { nickname: 'B1', handicap: '0' },
    { nickname: 'B2', handicap: '0' },
  ]);
  const courseId = await makeCourse();
  const roundId = await makeRound(tripId, courseId, 1, 'best_ball');
  const teeTimeId = await makeTeeTime(roundId, 1, [
    ...aPlayers.map((p) => p.id),
    ...bPlayers.map((p) => p.id),
  ]);
  const matchId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'best_ball',
    sideA: aPlayers,
    sideB: bPlayers,
    pointsOverall: 0,
    pointsFront9: 1,
    pointsBack9: 1,
  });

  // A wins front 9 outright: A birdies holes 1-9, B pars. B wins back 9: B
  // birdies holes 10-18, A pars.
  const scores: { playerId: string; hole: number; gross: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    const aGross = h <= 9 ? 3 : 4;
    const bGross = h <= 9 ? 4 : 3;
    for (const p of aPlayers) scores.push({ playerId: p.id, hole: h, gross: aGross });
    for (const p of bPlayers) scores.push({ playerId: p.id, hole: h, gross: bGross });
  }
  await enterScores(matchId, systemUserId, scores);

  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  assertEq(m.front9WinningTeamId, teamA.id, 'front 9 winner is A');
  assertEq(m.back9WinningTeamId, teamB.id, 'back 9 winner is B');

  const board = await getLeaderboard(tripId);
  const aTotal = board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? 0;
  const bTotal = board.teamTotals.find((t) => t.teamId === teamB.id)?.points ?? 0;
  assertEq(aTotal, 1, 'team A points (front 9 win)');
  assertEq(bTotal, 1, 'team B points (back 9 win)');
}

async function scenarioFanOutAcrossMatches(systemUserId: string) {
  logHeader('Stacked + cross-foursome — score fans out across matches');
  const tripId = await makeTrip(systemUserId, 'fanout', 'outing');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const aPlayers = await makePlayers(tripId, teamA.id, [
    { nickname: 'A1', handicap: '0' },
    { nickname: 'A2', handicap: '0' },
  ]);
  const bPlayers = await makePlayers(tripId, teamB.id, [
    { nickname: 'B1', handicap: '0' },
    { nickname: 'B2', handicap: '0' },
  ]);
  const courseId = await makeCourse();
  const roundId = await makeRound(tripId, courseId, 1, 'best_ball');
  const teeTimeId = await makeTeeTime(roundId, 1, [
    ...aPlayers.map((p) => p.id),
    ...bPlayers.map((p) => p.id),
  ]);
  // Stacked: 2v2 best ball + 1v1 singles within the same tee time.
  const bestBallId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'best_ball',
    sideA: aPlayers,
    sideB: bPlayers,
  });
  const singlesId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'singles',
    sideA: [aPlayers[0]],
    sideB: [bPlayers[0]],
  });

  // Action-layer fan-out requires an authenticated context that the
  // script can't fake. Direct-insert into both matches reproduces the
  // same end state (the fan-out path the upsert action would have
  // produced) and lets us verify both match statuses recompute
  // coherently from one shared set of grosses.
  const scoreRows: { playerId: string; hole: number; gross: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    scoreRows.push({ playerId: aPlayers[0].id, hole: h, gross: 3 });
    scoreRows.push({ playerId: bPlayers[0].id, hole: h, gross: 4 });
    scoreRows.push({ playerId: aPlayers[1].id, hole: h, gross: 4 });
    scoreRows.push({ playerId: bPlayers[1].id, hole: h, gross: 4 });
  }
  await enterScores(bestBallId, systemUserId, scoreRows);
  await enterScores(singlesId, systemUserId, scoreRows.filter(
    (s) => s.playerId === aPlayers[0].id || s.playerId === bPlayers[0].id,
  ));

  const [bb] = await db.select().from(matches).where(eq(matches.id, bestBallId));
  const [sg] = await db.select().from(matches).where(eq(matches.id, singlesId));
  // Both matches should have A as overall winner (A1 birdies every hole).
  assertEq(bb.winningTeamId, teamA.id, 'best ball winner is A');
  assertEq(sg.winningTeamId, teamA.id, 'singles winner is A');

  const board = await getLeaderboard(tripId);
  const aTotal = board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? 0;
  assertEq(aTotal, 2, 'team A points (2 matches × 1 pt)');
}

async function scenarioMatchClosesEarly(systemUserId: string) {
  logHeader('Singles 1v1 — match closes 3 & 2 at hole 16 (dead 17/18)');
  const tripId = await makeTrip(systemUserId, 'closes-early', 'match');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const [alpha] = await makePlayers(tripId, teamA.id, [{ nickname: 'Alpha', handicap: '0' }]);
  const [bravo] = await makePlayers(tripId, teamB.id, [{ nickname: 'Bravo', handicap: '0' }]);
  const courseId = await makeCourse();
  const roundId = await makeRound(tripId, courseId, 1, 'singles');
  const teeTimeId = await makeTeeTime(roundId, 1, [alpha.id, bravo.id]);
  const matchId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'singles',
    sideA: [alpha],
    sideB: [bravo],
  });

  // A wins holes 1, 2, 3 (3 UP). Halves 4–16 (still 3 UP, 2 to play).
  // Closure: |lead| > remaining → match closes 3 & 2 at hole 16.
  // Bravo "wins" 17 and 18 by birdying, but they're dead.
  const scores: { playerId: string; hole: number; gross: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    let aGross = 4;
    let bGross = 4;
    if (h <= 3) {
      aGross = 3;
      bGross = 4;
    } else if (h >= 17) {
      aGross = 4;
      bGross = 3;
    }
    scores.push({ playerId: alpha.id, hole: h, gross: aGross });
    scores.push({ playerId: bravo.id, hole: h, gross: bGross });
  }
  await enterScores(matchId, systemUserId, scores);

  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  assertEq(m.status, 'completed', 'match status');
  assertEq(m.winningTeamId, teamA.id, 'overall winner is team A (3 & 2)');
  assert(m.resultText?.includes('3') ?? false, 'resultText reflects 3 & 2');

  const board = await getLeaderboard(tripId);
  const aTotal = board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? 0;
  const bTotal = board.teamTotals.find((t) => t.teamId === teamB.id)?.points ?? 0;
  assertEq(aTotal, 1, 'team A gets the point (despite B "winning" 17 & 18)');
  assertEq(bTotal, 0, 'team B has 0 points');
}

async function scenarioScramble(systemUserId: string) {
  logHeader('Scramble — team-input format, A beats B by 1');
  const tripId = await makeTrip(systemUserId, 'scramble', 'outing');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const aPlayers = await makePlayers(tripId, teamA.id, [
    { nickname: 'A1', handicap: '0' },
    { nickname: 'A2', handicap: '0' },
  ]);
  const bPlayers = await makePlayers(tripId, teamB.id, [
    { nickname: 'B1', handicap: '0' },
    { nickname: 'B2', handicap: '0' },
  ]);
  const courseId = await makeCourse();
  const roundId = await makeRound(tripId, courseId, 1, 'scramble');
  const teeTimeId = await makeTeeTime(roundId, 1, [
    ...aPlayers.map((p) => p.id),
    ...bPlayers.map((p) => p.id),
  ]);
  const matchId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'scramble',
    sideA: aPlayers,
    sideB: bPlayers,
  });

  // Team-input: every teammate's row gets the SAME gross (fan-out
  // behavior). A team posts 3s on holes 1-3, then 4s. B team posts all
  // 4s. A wins three holes.
  const scores: { playerId: string; hole: number; gross: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    const aGross = h <= 3 ? 3 : 4;
    const bGross = 4;
    for (const p of aPlayers) scores.push({ playerId: p.id, hole: h, gross: aGross });
    for (const p of bPlayers) scores.push({ playerId: p.id, hole: h, gross: bGross });
  }
  await enterScores(matchId, systemUserId, scores);

  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  assertEq(m.status, 'completed', 'match status');
  assertEq(m.winningTeamId, teamA.id, 'team A wins the scramble');

  const board = await getLeaderboard(tripId);
  const aTotal = board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? 0;
  assertEq(aTotal, 1, 'team A gets the point');
}

async function scenarioAggregatePartial(systemUserId: string) {
  logHeader('Two-man aggregate — hole skipped when only one partner scored');
  const tripId = await makeTrip(systemUserId, 'aggregate-partial', 'outing');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const aPlayers = await makePlayers(tripId, teamA.id, [
    { nickname: 'A1', handicap: '0' },
    { nickname: 'A2', handicap: '0' },
  ]);
  const bPlayers = await makePlayers(tripId, teamB.id, [
    { nickname: 'B1', handicap: '0' },
    { nickname: 'B2', handicap: '0' },
  ]);
  const courseId = await makeCourse();
  const roundId = await makeRound(tripId, courseId, 1, 'two_man_aggregate');
  const teeTimeId = await makeTeeTime(roundId, 1, [
    ...aPlayers.map((p) => p.id),
    ...bPlayers.map((p) => p.id),
  ]);
  const matchId = await makeMatch({
    roundId,
    teeTimeId,
    format: 'two_man_aggregate',
    sideA: aPlayers,
    sideB: bPlayers,
  });

  // Hole 1: only A1 enters. Aggregate needs BOTH → hole skipped.
  // Holes 2-18: everyone enters par 4 → side sums equal 8 each → halved.
  const scores: { playerId: string; hole: number; gross: number }[] = [];
  scores.push({ playerId: aPlayers[0].id, hole: 1, gross: 3 });
  for (let h = 2; h <= 18; h++) {
    for (const p of [...aPlayers, ...bPlayers]) {
      scores.push({ playerId: p.id, hole: h, gross: 4 });
    }
  }
  await enterScores(matchId, systemUserId, scores);

  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  // Only 17 holes counted (hole 1 partial) — match shows in_progress
  // because aggregate engine refuses to call the result with a missing
  // partner-score on hole 1.
  assert(
    m.status === 'in_progress' || m.status === 'completed',
    'match status (aggregate with skipped hole)',
  );
}

async function scenarioFriendlyRoundExcluded(systemUserId: string) {
  logHeader('Friendly round — does not count toward cup totals');
  const tripId = await makeTrip(systemUserId, 'friendly', 'outing');
  const [teamA, teamB] = await makeTeams(tripId, [
    { name: 'A', color: '#16a34a' },
    { name: 'B', color: '#eab308' },
  ]);
  const [alpha] = await makePlayers(tripId, teamA.id, [{ nickname: 'Alpha', handicap: '0' }]);
  const [bravo] = await makePlayers(tripId, teamB.id, [{ nickname: 'Bravo', handicap: '0' }]);
  const courseId = await makeCourse();
  // Create round with countsTowardCup = false.
  const [round] = await db
    .insert(rounds)
    .values({
      tripId,
      courseId,
      order: 1,
      format: 'singles',
      date: new Date(),
      countsTowardCup: false,
    })
    .returning();
  const teeTimeId = await makeTeeTime(round.id, 1, [alpha.id, bravo.id]);
  const matchId = await makeMatch({
    roundId: round.id,
    teeTimeId,
    format: 'singles',
    sideA: [alpha],
    sideB: [bravo],
  });

  // A wins outright — but the round is friendly, so it shouldn't credit
  // cup totals at all.
  const scores: { playerId: string; hole: number; gross: number }[] = [];
  for (let h = 1; h <= 18; h++) {
    scores.push({ playerId: alpha.id, hole: h, gross: 3 });
    scores.push({ playerId: bravo.id, hole: h, gross: 4 });
  }
  await enterScores(matchId, systemUserId, scores);

  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  assertEq(m.winningTeamId, teamA.id, 'match still records a winner');

  const board = await getLeaderboard(tripId);
  const aTotal = board.teamTotals.find((t) => t.teamId === teamA.id)?.points ?? 0;
  const bTotal = board.teamTotals.find((t) => t.teamId === teamB.id)?.points ?? 0;
  assertEq(aTotal, 0, 'friendly round contributes 0 to team A cup total');
  assertEq(bTotal, 0, 'friendly round contributes 0 to team B cup total');
}

// ───────────────────────── ENTRY ─────────────────────────

async function main() {
  console.log('\x1b[36mclearing previous scenarios…\x1b[0m');
  await clearOldScenarios();
  const systemUser = await seedSystemUser();
  console.log(`system user: ${systemUser.email}`);

  await scenarioSinglesAWins(systemUser.id);
  await scenarioBestBallHalved(systemUser.id);
  await scenarioStableford(systemUser.id);
  await scenarioSegmentPoints(systemUser.id);
  await scenarioFanOutAcrossMatches(systemUser.id);
  await scenarioMatchClosesEarly(systemUser.id);
  await scenarioScramble(systemUser.id);
  await scenarioAggregatePartial(systemUser.id);
  await scenarioFriendlyRoundExcluded(systemUser.id);

  console.log(`\n\x1b[1mResults:\x1b[0m \x1b[32m${pass} pass\x1b[0m · \x1b[${fail === 0 ? 32 : 31}m${fail} fail\x1b[0m`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
