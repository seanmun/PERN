'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  bbbHolePoints,
  holeScores,
  matches,
  matchParticipants,
  rounds,
  tripMembers,
} from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isCaptainOf,
  isPlatformAdmin,
  isTripAdminOf,
  requireAuth,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import { recomputeMatchStatus } from '@/lib/scoring/recompute';

export type BbbCommitInput = {
  bingo: string | null; // tripMemberId or null = washed
  bango: string | null;
  bongo: string | null;
};

async function loadBbbMatch(matchId: string, holeNumber: number) {
  if (!matchId) throw new Error('matchId required');
  if (!Number.isFinite(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    throw new Error('Invalid hole number');
  }
  const [row] = await db
    .select({ match: matches, round: rounds })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) throw new Error('Match not found');
  if (row.match.format !== 'bingo_bango_bongo') {
    throw new Error('Not a Bingo Bango Bongo match');
  }
  const participants = await db
    .select({ member: tripMembers })
    .from(matchParticipants)
    .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
    .where(eq(matchParticipants.matchId, matchId));
  return { match: row.match, round: row.round, participants };
}

/**
 * Commit one hole's Bingo/Bango/Bongo winners. Unlike 30 Ball's per-side
 * commit, this is a GROUP decision — the three points are judged across
 * the whole foursome — so any match participant (or captain/admin) can
 * commit, and there's one commit per match-hole. Null = washed point.
 * Committing locks the hole's points (not the grosses — points are
 * judgment calls, independent of strokes); captain/admin uncommit reopens.
 */
export async function commitBbbHole(
  matchId: string,
  holeNumber: number,
  input: BbbCommitInput,
): Promise<void> {
  const ctx = await getGlobalAuthContext();
  requireAuth(ctx);

  const { round, participants } = await loadBbbMatch(matchId, holeNumber);
  const memberIds = participants.map((p) => p.member.id);

  const isParticipant =
    ctx.tripMember != null && memberIds.includes(ctx.tripMember.id);
  const isCaptainOfEither = participants.some(
    (p) => p.member.teamId != null && isCaptainOf(ctx, p.member.teamId),
  );
  if (
    !isParticipant &&
    !isCaptainOfEither &&
    !isPlatformAdmin(ctx) &&
    !isTripAdminOf(ctx, round.tripId)
  ) {
    throw new AuthorizationError(
      'Only a player in this match, a captain, or an admin can commit points',
    );
  }

  for (const winner of [input.bingo, input.bango, input.bongo]) {
    if (winner != null && !memberIds.includes(winner)) {
      throw new Error('Point winner is not in this match');
    }
  }

  // Same gate as 30 Ball: every player needs a recorded gross before the
  // hole's points commit. Points don't derive from scores, but requiring
  // them keeps the scorecard complete and the flow consistent.
  const holeRows = await db
    .select({ tripMemberId: holeScores.tripMemberId })
    .from(holeScores)
    .where(
      and(
        eq(holeScores.matchId, matchId),
        inArray(holeScores.tripMemberId, memberIds),
        eq(holeScores.holeNumber, holeNumber),
        isNotNull(holeScores.gross),
      ),
    );
  if (new Set(holeRows.map((r) => r.tripMemberId)).size < memberIds.length) {
    throw new Error('All players need a score before committing points');
  }

  const [existing] = await db
    .select({ id: bbbHolePoints.id })
    .from(bbbHolePoints)
    .where(
      and(
        eq(bbbHolePoints.matchId, matchId),
        eq(bbbHolePoints.holeNumber, holeNumber),
      ),
    )
    .limit(1);
  if (existing) throw new Error('This hole is already committed');

  // Racing double-commits land on the (match, hole) unique constraint —
  // one wins, the loser errors, which is the correct outcome.
  await db.insert(bbbHolePoints).values({
    matchId,
    holeNumber,
    bingoTripMemberId: input.bingo,
    bangoTripMemberId: input.bango,
    bongoTripMemberId: input.bongo,
    committedBy: ctx!.user.id,
  });

  await recomputeMatchStatus(matchId);

  const tripSlug = await getTripSlugById(round.tripId);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}`);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}/score`);
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
}

/**
 * Reopen a committed hole's points — mistake correction, so captain (of
 * either side) or admin only. Deletes the row; the group re-commits.
 */
export async function uncommitBbbHole(
  matchId: string,
  holeNumber: number,
): Promise<void> {
  const ctx = await getGlobalAuthContext();
  requireAuth(ctx);

  const { round, participants } = await loadBbbMatch(matchId, holeNumber);
  const isCaptainOfEither = participants.some(
    (p) => p.member.teamId != null && isCaptainOf(ctx, p.member.teamId),
  );
  if (
    !isCaptainOfEither &&
    !isPlatformAdmin(ctx) &&
    !isTripAdminOf(ctx, round.tripId)
  ) {
    throw new AuthorizationError('Only a captain or admin can uncommit points');
  }

  await db
    .delete(bbbHolePoints)
    .where(
      and(
        eq(bbbHolePoints.matchId, matchId),
        eq(bbbHolePoints.holeNumber, holeNumber),
      ),
    );

  await recomputeMatchStatus(matchId);

  const tripSlug = await getTripSlugById(round.tripId);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}`);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}/score`);
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
}
