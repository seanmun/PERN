/**
 * Engine + leaderboard regressions, carried over from the original
 * seed-scenarios script.
 *
 * These build their fixtures with direct inserts, and that is deliberate
 * here: each one pins down a RESOLVER or SCOREBOARD behaviour that the
 * setup path cannot currently produce — stableford scoring, split
 * front-9/back-9 point allocations, a friendly (non-cup) round, a hole
 * with a missing partner score. The single-page form has no way to ask
 * for those, so building the match row by hand is how the case gets
 * reached at all.
 *
 * Everything that IS reachable through the setup path is tested through
 * the real actions instead — see ./formats.ts and ./setup-path.ts. The
 * split is intentional: direct inserts for engine fixtures, real actions
 * for anything whose behaviour belongs to the action.
 */

import { eq, like } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  courseHoles,
  courses,
  holeScores,
  matchParticipants,
  matches,
  rounds,
  teams,
  teeTimeParticipants,
  teeTimes,
  tripMembers,
  trips,
  users,
} from '@/db/schema';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { getTeeTimeScoringData } from '@/lib/data/tee-time-scoring';
import { recomputeMatchStatus } from '@/lib/scoring/recompute';
import { assert, assertEq, scenario } from '../core';
import { COURSE_PREFIX, EMAIL_DOMAIN, TRIP_PREFIX } from '../world';

type EngineFormat =
  | 'best_ball'
  | 'singles'
  | 'scramble'
  | 'stroke'
  | 'two_man_aggregate';

type Player = { id: string; nickname: string; teamId: string };

/** Recompute writes need an `entered_by`; any user row will do. */
async function systemUser(): Promise<string> {
  const [existing] = await db
    .select()
    .from(users)
    .where(like(users.email, `engine-fixtures@${EMAIL_DOMAIN}`))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(users)
    .values({
      email: `engine-fixtures@${EMAIL_DOMAIN}`,
      displayName: 'Engine Fixtures',
    })
    .returning();
  return created.id;
}

async function makeTrip(
  createdBy: string,
  name: string,
  kind: 'trip' | 'outing' | 'match',
): Promise<string> {
  const [trip] = await db
    .insert(trips)
    .values({
      name: `${TRIP_PREFIX}${name}`,
      slug: `harness-${name}-${Math.random().toString(36).slice(2, 10)}`,
      kind,
      startDate: new Date(),
      endDate: new Date(),
      createdBy,
    })
    .returning();
  return trip.id;
}

async function makeTeams(tripId: string) {
  return db
    .insert(teams)
    .values([
      { tripId, name: 'A', color: '#16a34a' },
      { tripId, name: 'B', color: '#eab308' },
    ])
    .returning({ id: teams.id, name: teams.name });
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
    .values({ name: `${COURSE_PREFIX}engine`, location: 'Harness, USA' })
    .returning();
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
  format: EngineFormat,
  countsTowardCup = true,
): Promise<string> {
  const [round] = await db
    .insert(rounds)
    .values({
      tripId,
      courseId,
      order: 1,
      format,
      date: new Date(),
      countsTowardCup,
    })
    .returning();
  return round.id;
}

async function makeTeeTime(roundId: string, rosterIds: string[]): Promise<string> {
  const [tt] = await db
    .insert(teeTimes)
    .values({ roundId, groupNumber: 1, time: new Date() })
    .returning();
  if (rosterIds.length) {
    await db
      .insert(teeTimeParticipants)
      .values(rosterIds.map((id) => ({ teeTimeId: tt.id, tripMemberId: id })));
  }
  return tt.id;
}

async function makeMatch(opts: {
  roundId: string;
  teeTimeId: string | null;
  format: EngineFormat;
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
  await db.insert(matchParticipants).values(
    [...opts.sideA, ...opts.sideB].map((p) => ({
      matchId: m.id,
      tripMemberId: p.id,
      teamId: p.teamId,
    })),
  );
  return m.id;
}

type ScoreSpec = { playerId: string; hole: number; gross: number };

async function enterScores(
  matchId: string,
  enteredBy: string,
  scores: ScoreSpec[],
): Promise<void> {
  for (const s of scores) {
    await db
      .insert(holeScores)
      .values({
        matchId,
        tripMemberId: s.playerId,
        holeNumber: s.hole,
        gross: s.gross,
        enteredBy,
      })
      .onConflictDoUpdate({
        target: [holeScores.matchId, holeScores.tripMemberId, holeScores.holeNumber],
        set: { gross: s.gross, enteredBy, enteredAt: new Date() },
      });
  }
  await recomputeMatchStatus(matchId);
}

async function points(tripId: string, teamId: string): Promise<number> {
  const board = await getLeaderboard(tripId);
  return board.teamTotals.find((t) => t.teamId === teamId)?.points ?? 0;
}

async function reload(matchId: string) {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  return m;
}

// ───────────────────────── Scenarios ─────────────────────────

export async function runEngineRegressions(): Promise<void> {
  const uid = await systemUser();
  const courseId = await makeCourse();

  await scenario('engine · Singles 1v1 — A wins on the last hole', async () => {
    const tripId = await makeTrip(uid, 'singles-a-wins', 'match');
    const [teamA, teamB] = await makeTeams(tripId);
    const [alpha] = await makePlayers(tripId, teamA.id, [{ nickname: 'Alpha', handicap: '0' }]);
    const [bravo] = await makePlayers(tripId, teamB.id, [{ nickname: 'Bravo', handicap: '0' }]);
    const roundId = await makeRound(tripId, courseId, 'singles');
    const tt = await makeTeeTime(roundId, [alpha.id, bravo.id]);
    const matchId = await makeMatch({
      roundId,
      teeTimeId: tt,
      format: 'singles',
      sideA: [alpha],
      sideB: [bravo],
    });

    const scores: ScoreSpec[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ playerId: alpha.id, hole: h, gross: h === 18 ? 3 : 4 });
      scores.push({ playerId: bravo.id, hole: h, gross: 4 });
    }
    await enterScores(matchId, uid, scores);

    const m = await reload(matchId);
    assertEq(m.status, 'completed', 'match status');
    assertEq(m.winningTeamId, teamA.id, 'overall winner is A');
    assertEq(m.isHalved, false, 'not halved');
    assertEq(await points(tripId, teamA.id), 1, 'team A points');
    assertEq(await points(tripId, teamB.id), 0, 'team B points');
  });

  await scenario('engine · 2v2 best ball — halved over 18', async () => {
    const tripId = await makeTrip(uid, 'best-ball-halved', 'outing');
    const [teamA, teamB] = await makeTeams(tripId);
    const aPlayers = await makePlayers(tripId, teamA.id, [
      { nickname: 'A1', handicap: '0' },
      { nickname: 'A2', handicap: '0' },
    ]);
    const bPlayers = await makePlayers(tripId, teamB.id, [
      { nickname: 'B1', handicap: '0' },
      { nickname: 'B2', handicap: '0' },
    ]);
    const roundId = await makeRound(tripId, courseId, 'best_ball');
    const tt = await makeTeeTime(roundId, [...aPlayers, ...bPlayers].map((p) => p.id));
    const matchId = await makeMatch({
      roundId,
      teeTimeId: tt,
      format: 'best_ball',
      sideA: aPlayers,
      sideB: bPlayers,
    });

    const scores: ScoreSpec[] = [];
    for (let h = 1; h <= 18; h++) {
      for (const p of [...aPlayers, ...bPlayers]) {
        scores.push({ playerId: p.id, hole: h, gross: 4 });
      }
    }
    await enterScores(matchId, uid, scores);

    const m = await reload(matchId);
    assertEq(m.status, 'completed', 'match status');
    assertEq(m.isHalved, true, 'halved');
    assertEq(m.winningTeamId, null, 'no overall winner');
    assertEq(await points(tripId, teamA.id), 0.5, 'team A points (split)');
    assertEq(await points(tripId, teamB.id), 0.5, 'team B points (split)');
  });

  await scenario('engine · Stableford — A wins on points', async () => {
    const tripId = await makeTrip(uid, 'stableford', 'match');
    const [teamA, teamB] = await makeTeams(tripId);
    const [alpha] = await makePlayers(tripId, teamA.id, [{ nickname: 'Alpha', handicap: '0' }]);
    const [bravo] = await makePlayers(tripId, teamB.id, [{ nickname: 'Bravo', handicap: '0' }]);
    const roundId = await makeRound(tripId, courseId, 'singles');
    const tt = await makeTeeTime(roundId, [alpha.id, bravo.id]);
    const matchId = await makeMatch({
      roundId,
      teeTimeId: tt,
      format: 'singles',
      scoring: 'stableford',
      sideA: [alpha],
      sideB: [bravo],
    });

    const scores: ScoreSpec[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ playerId: alpha.id, hole: h, gross: 3 });
      scores.push({ playerId: bravo.id, hole: h, gross: 4 });
    }
    await enterScores(matchId, uid, scores);

    const m = await reload(matchId);
    assertEq(m.status, 'completed', 'match status');
    assertEq(m.winningTeamId, teamA.id, 'A wins on points');
    assert(m.resultText?.includes('54') ?? false, `result text shows 54 pts (${m.resultText})`);
  });

  await scenario('engine · Split 9s — front to A, back to B', async () => {
    const tripId = await makeTrip(uid, 'segment-points', 'outing');
    const [teamA, teamB] = await makeTeams(tripId);
    const aPlayers = await makePlayers(tripId, teamA.id, [
      { nickname: 'A1', handicap: '0' },
      { nickname: 'A2', handicap: '0' },
    ]);
    const bPlayers = await makePlayers(tripId, teamB.id, [
      { nickname: 'B1', handicap: '0' },
      { nickname: 'B2', handicap: '0' },
    ]);
    const roundId = await makeRound(tripId, courseId, 'best_ball');
    const tt = await makeTeeTime(roundId, [...aPlayers, ...bPlayers].map((p) => p.id));
    const matchId = await makeMatch({
      roundId,
      teeTimeId: tt,
      format: 'best_ball',
      sideA: aPlayers,
      sideB: bPlayers,
      pointsOverall: 0,
      pointsFront9: 1,
      pointsBack9: 1,
    });

    const scores: ScoreSpec[] = [];
    for (let h = 1; h <= 18; h++) {
      const aGross = h <= 9 ? 3 : 4;
      const bGross = h <= 9 ? 4 : 3;
      for (const p of aPlayers) scores.push({ playerId: p.id, hole: h, gross: aGross });
      for (const p of bPlayers) scores.push({ playerId: p.id, hole: h, gross: bGross });
    }
    await enterScores(matchId, uid, scores);

    const m = await reload(matchId);
    assertEq(m.front9WinningTeamId, teamA.id, 'front 9 winner');
    assertEq(m.back9WinningTeamId, teamB.id, 'back 9 winner');
    assertEq(await points(tripId, teamA.id), 1, 'team A points');
    assertEq(await points(tripId, teamB.id), 1, 'team B points');
  });

  await scenario('engine · Match closes 3 & 2 — holes 17/18 are dead', async () => {
    const tripId = await makeTrip(uid, 'closes-early', 'match');
    const [teamA, teamB] = await makeTeams(tripId);
    const [alpha] = await makePlayers(tripId, teamA.id, [{ nickname: 'Alpha', handicap: '0' }]);
    const [bravo] = await makePlayers(tripId, teamB.id, [{ nickname: 'Bravo', handicap: '0' }]);
    const roundId = await makeRound(tripId, courseId, 'singles');
    const tt = await makeTeeTime(roundId, [alpha.id, bravo.id]);
    const matchId = await makeMatch({
      roundId,
      teeTimeId: tt,
      format: 'singles',
      sideA: [alpha],
      sideB: [bravo],
    });

    const scores: ScoreSpec[] = [];
    for (let h = 1; h <= 18; h++) {
      let aGross = 4;
      let bGross = 4;
      if (h <= 3) aGross = 3;
      else if (h >= 17) bGross = 3;
      scores.push({ playerId: alpha.id, hole: h, gross: aGross });
      scores.push({ playerId: bravo.id, hole: h, gross: bGross });
    }
    await enterScores(matchId, uid, scores);

    const m = await reload(matchId);
    assertEq(m.status, 'completed', 'match status');
    assertEq(m.winningTeamId, teamA.id, 'winner is A');
    assert(m.resultText?.includes('3 & 2') ?? false, `result text is 3 & 2 (${m.resultText})`);
    assertEq(await points(tripId, teamA.id), 1, 'A keeps the point despite B "winning" 17 & 18');
    assertEq(await points(tripId, teamB.id), 0, 'team B points');
  });

  await scenario('engine · Two-man aggregate — a hole with one missing partner', async () => {
    const tripId = await makeTrip(uid, 'aggregate-partial', 'outing');
    const [teamA, teamB] = await makeTeams(tripId);
    const aPlayers = await makePlayers(tripId, teamA.id, [
      { nickname: 'A1', handicap: '0' },
      { nickname: 'A2', handicap: '0' },
    ]);
    const bPlayers = await makePlayers(tripId, teamB.id, [
      { nickname: 'B1', handicap: '0' },
      { nickname: 'B2', handicap: '0' },
    ]);
    const roundId = await makeRound(tripId, courseId, 'two_man_aggregate');
    const tt = await makeTeeTime(roundId, [...aPlayers, ...bPlayers].map((p) => p.id));
    const matchId = await makeMatch({
      roundId,
      teeTimeId: tt,
      format: 'two_man_aggregate',
      sideA: aPlayers,
      sideB: bPlayers,
    });

    const scores: ScoreSpec[] = [{ playerId: aPlayers[0].id, hole: 1, gross: 3 }];
    for (let h = 2; h <= 18; h++) {
      for (const p of [...aPlayers, ...bPlayers]) {
        scores.push({ playerId: p.id, hole: h, gross: 4 });
      }
    }
    await enterScores(matchId, uid, scores);

    const m = await reload(matchId);
    // An incomplete card must not resolve a winner off 17 holes.
    assertEq(m.status, 'in_progress', 'incomplete card leaves the match unresolved');
    assertEq(m.winningTeamId, null, 'no winner declared');
  });

  await scenario('engine · Friendly round contributes nothing to the cup', async () => {
    const tripId = await makeTrip(uid, 'friendly', 'outing');
    const [teamA, teamB] = await makeTeams(tripId);
    const [alpha] = await makePlayers(tripId, teamA.id, [{ nickname: 'Alpha', handicap: '0' }]);
    const [bravo] = await makePlayers(tripId, teamB.id, [{ nickname: 'Bravo', handicap: '0' }]);
    const roundId = await makeRound(tripId, courseId, 'singles', false);
    const tt = await makeTeeTime(roundId, [alpha.id, bravo.id]);
    const matchId = await makeMatch({
      roundId,
      teeTimeId: tt,
      format: 'singles',
      sideA: [alpha],
      sideB: [bravo],
    });

    const scores: ScoreSpec[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ playerId: alpha.id, hole: h, gross: 3 });
      scores.push({ playerId: bravo.id, hole: h, gross: 4 });
    }
    await enterScores(matchId, uid, scores);

    const m = await reload(matchId);
    assertEq(m.winningTeamId, teamA.id, 'the match still records a winner');
    assertEq(await points(tripId, teamA.id), 0, 'friendly round awards A nothing');
    assertEq(await points(tripId, teamB.id), 0, 'friendly round awards B nothing');
  });

  await scenario('engine · Foursome scorecard loads every in-foursome match', async () => {
    const tripId = await makeTrip(uid, 'load-all-matches', 'outing');
    const [teamA, teamB] = await makeTeams(tripId);
    const [a1, a2] = await makePlayers(tripId, teamA.id, [
      { nickname: 'A1', handicap: '0' },
      { nickname: 'A2', handicap: '0' },
    ]);
    const [b1, b2] = await makePlayers(tripId, teamB.id, [
      { nickname: 'B1', handicap: '0' },
      { nickname: 'B2', handicap: '0' },
    ]);
    const roundId = await makeRound(tripId, courseId, 'singles');
    const tt = await makeTeeTime(roundId, [a1.id, a2.id, b1.id, b2.id]);
    // Two separate 1v1s in one foursome, with no wider match spanning them.
    const m1 = await makeMatch({ roundId, teeTimeId: tt, format: 'singles', sideA: [a1], sideB: [b1] });
    const m2 = await makeMatch({ roundId, teeTimeId: tt, format: 'singles', sideA: [a2], sideB: [b2] });

    const s1: ScoreSpec[] = [];
    const s2: ScoreSpec[] = [];
    for (let h = 1; h <= 12; h++) {
      s1.push({ playerId: a1.id, hole: h, gross: 4 });
      s1.push({ playerId: b1.id, hole: h, gross: 4 });
      s2.push({ playerId: a2.id, hole: h, gross: 4 });
      s2.push({ playerId: b2.id, hole: h, gross: 4 });
    }
    await enterScores(m1, uid, s1);
    await enterScores(m2, uid, s2);

    const result = await getTeeTimeScoringData(tt);
    if (!result) return void assert(false, 'getTeeTimeScoringData returned a foursome');
    for (const p of [a1, a2, b1, b2]) {
      const count = result.scores.filter((s) => s.tripMemberId === p.id).length;
      assertEq(count, 12, `${p.nickname} has 12 hole scores`);
    }
  });
}
