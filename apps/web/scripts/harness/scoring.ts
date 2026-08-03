/**
 * Score-entry drivers — thin wrappers over the real score actions.
 *
 * There is deliberately no direct-insert path here. The old
 * seed-scenarios script wrote `hole_scores` rows itself and noted in a
 * comment that this "reproduces the same end state" as the fan-out — but
 * reproducing the end state is exactly what a harness must not do. The
 * fan-out, the 30 Ball lock, the permission check and the revalidation
 * set are behaviour of the action, and only calling the action tests them.
 */

import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { holeScores } from '@/db/schema';
import { upsertHoleScore, upsertTeamHoleScore, commitThirtyBallHole } from '@/lib/actions/scores';
import { commitBbbHole, type BbbCommitInput } from '@/lib/actions/bbb';
import { revalidatedPaths, runAs, type HarnessActor } from './core';

/** One player's gross for one hole, through the per-player action. */
export async function enterScore(
  who: HarnessActor,
  args: { matchId: string; tripMemberId: string; holeNumber: number; gross: number | null },
): Promise<string[]> {
  const fd = new FormData();
  fd.set('matchId', args.matchId);
  fd.set('tripMemberId', args.tripMemberId);
  fd.set('holeNumber', String(args.holeNumber));
  fd.set('gross', args.gross == null ? '' : String(args.gross));
  return runAs(who, async () => {
    await upsertHoleScore(fd);
    return revalidatedPaths();
  });
}

/** One side's gross for one hole, through the team action (§5 shape 3). */
export async function enterTeamScore(
  who: HarnessActor,
  args: { matchId: string; teamId: string; holeNumber: number; gross: number | null },
): Promise<string[]> {
  const fd = new FormData();
  fd.set('matchId', args.matchId);
  fd.set('teamId', args.teamId);
  fd.set('holeNumber', String(args.holeNumber));
  fd.set('gross', args.gross == null ? '' : String(args.gross));
  return runAs(who, async () => {
    await upsertTeamHoleScore(fd);
    return revalidatedPaths();
  });
}

/** §5.2 — the side commits which of its strokes count, and locks the hole. */
export async function commitThirtyBall(
  who: HarnessActor,
  args: {
    matchId: string;
    teamId: string;
    holeNumber: number;
    counted: string[];
  },
): Promise<void> {
  await runAs(who, () =>
    commitThirtyBallHole(args.matchId, args.teamId, args.holeNumber, args.counted),
  );
}

/** BBB's per-hole point award — row existence is the commit. */
export async function commitBbb(
  who: HarnessActor,
  args: { matchId: string; holeNumber: number } & BbbCommitInput,
): Promise<void> {
  await runAs(who, () =>
    commitBbbHole(args.matchId, args.holeNumber, {
      bingo: args.bingo,
      bango: args.bango,
      bongo: args.bongo,
    }),
  );
}

/**
 * Play out a whole round for one match by driving the per-player action
 * hole by hole, the way a scorer with a phone does. `grossFor` returns
 * the gross for a given player on a given hole.
 */
export async function playIndividualRound(
  who: HarnessActor,
  args: {
    matchId: string;
    memberIds: string[];
    holes?: number;
    grossFor: (memberId: string, hole: number) => number;
  },
): Promise<void> {
  const holes = args.holes ?? 18;
  for (let hole = 1; hole <= holes; hole++) {
    for (const memberId of args.memberIds) {
      await enterScore(who, {
        matchId: args.matchId,
        tripMemberId: memberId,
        holeNumber: hole,
        gross: args.grossFor(memberId, hole),
      });
    }
  }
}

/** Same, for a team-input format: one gross per side per hole. */
export async function playTeamRound(
  who: HarnessActor,
  args: {
    matchId: string;
    teamIds: string[];
    holes?: number;
    grossFor: (teamId: string, hole: number) => number;
  },
): Promise<void> {
  const holes = args.holes ?? 18;
  for (let hole = 1; hole <= holes; hole++) {
    for (const teamId of args.teamIds) {
      await enterTeamScore(who, {
        matchId: args.matchId,
        teamId,
        holeNumber: hole,
        gross: args.grossFor(teamId, hole),
      });
    }
  }
}

// ───────────────────────── Score readback ─────────────────────────

export async function scoresForMatch(
  matchId: string,
): Promise<(typeof holeScores.$inferSelect)[]> {
  return db.select().from(holeScores).where(eq(holeScores.matchId, matchId));
}

export async function scoreRow(
  matchId: string,
  tripMemberId: string,
  holeNumber: number,
): Promise<typeof holeScores.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(holeScores)
    .where(
      and(
        eq(holeScores.matchId, matchId),
        eq(holeScores.tripMemberId, tripMemberId),
        eq(holeScores.holeNumber, holeNumber),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Every match id that ended up holding a row for this player+hole. */
export async function matchesHoldingScore(
  matchIds: string[],
  tripMemberId: string,
  holeNumber: number,
): Promise<string[]> {
  if (!matchIds.length) return [];
  const rows = await db
    .select({ matchId: holeScores.matchId })
    .from(holeScores)
    .where(
      and(
        inArray(holeScores.matchId, matchIds),
        eq(holeScores.tripMemberId, tripMemberId),
        eq(holeScores.holeNumber, holeNumber),
      ),
    );
  return rows.map((r) => r.matchId).sort();
}
