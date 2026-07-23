'use server';

import { revalidatePath } from 'next/cache';
import { eq, and, inArray, isNotNull, count } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds,
  holeScores,
  tripMembers,
} from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  canEnterScoreFor,
  isCaptainOf,
  isPlatformAdmin,
  isTripAdminOf,
  requireAuth,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import {
  computeMatch,
  computeStableford,
  computeTeamMatch,
  DEFAULT_STABLEFORD_POINTS,
  formatStatus,
  THIRTY_BALL_BUDGET,
  type PlayerInputFormat,
  type StablefordPoints,
} from '@buddycup/scoring/engine';
import { recomputeMatchStatus as pureRecompute } from '@/lib/scoring/recompute';

/**
 * Recompute the match's status / winning team / result text from its current
 * hole_scores. Called after every score upsert so the scoreboard reflects the
 * truth without a separate "finalize match" step.
 */
// Forward player-input formats straight through; everything else (scramble,
// stroke — team-input or non-match-play formats) maps to the best-ball
// engine for now and will get its own engine path in phase 2.
const PLAYER_INPUT_FORMATS: ReadonlySet<string> = new Set<PlayerInputFormat>([
  'best_ball',
  'singles',
  'two_man_aggregate',
]);

/** Re-export of the pure recompute so other server actions (round-level
 * "recompute all") have a stable name to import. */
export async function recomputeMatchStatusById(matchId: string): Promise<void> {
  return pureRecompute(matchId);
}

async function recomputeMatchStatus(matchId: string): Promise<void> {
  return pureRecompute(matchId);
}

// recomputeMatchStatus body moved to lib/scoring/recompute.ts so callers
// outside the Next runtime can use it. Both action exports above
// delegate to it.

function parseGross(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error('Invalid score');
  if (n < 1 || n > 30) throw new Error('Score out of range (1–30)');
  return Math.floor(n);
}

/**
 * Upsert a single hole's gross score. Called from the score-entry UI per hole.
 * Players can write their own; admin/trip-admin can write anyone's.
 */
export async function upsertHoleScore(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  requireAuth(ctx);

  const matchId = String(formData.get('matchId') ?? '').trim();
  const tripMemberId = String(formData.get('tripMemberId') ?? '').trim();
  const holeNumberRaw = String(formData.get('holeNumber') ?? '').trim();
  if (!matchId || !tripMemberId || !holeNumberRaw) {
    throw new Error('matchId, tripMemberId, holeNumber required');
  }
  const holeNumber = Number(holeNumberRaw);
  if (!Number.isFinite(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    throw new Error('Invalid hole number');
  }

  // Authorization: must be admin OR self
  const [target] = await db
    .select({ member: tripMembers, round: rounds, match: matches })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
    .where(
      and(
        eq(matchParticipants.matchId, matchId),
        eq(matchParticipants.tripMemberId, tripMemberId)
      )
    )
    .limit(1);

  if (!target) throw new Error('Match participant not found');

  if (!canEnterScoreFor(ctx, target.member)) {
    throw new AuthorizationError('Not authorized to enter scores for this player');
  }

  const gross = parseGross(formData.get('gross'));

  // 30 Ball lock: once a side commits a hole, the grosses behind that
  // commitment are frozen — editing one after the fact would silently
  // change a locked-in budget decision. The gross fans out round-wide,
  // so a committed row in ANY of the player's matches this round blocks
  // the edit. Admin path: uncommit the hole first, then fix the score.
  const [committedRow] = await db
    .select({ id: holeScores.id })
    .from(holeScores)
    .innerJoin(matches, eq(holeScores.matchId, matches.id))
    .where(
      and(
        eq(matches.roundId, target.round.id),
        eq(holeScores.tripMemberId, tripMemberId),
        eq(holeScores.holeNumber, holeNumber),
        isNotNull(holeScores.committedAt),
      ),
    )
    .limit(1);
  if (committedRow) {
    throw new Error(
      'This score is locked by a committed 30 Ball hole. An admin or captain must uncommit the hole to change it.',
    );
  }

  // Fan-out scope = ROUND. A player only walks one foursome per round
  // and plays one ball, so a single gross must propagate to every
  // match in the round they're a participant of — including cross-
  // foursome round-wide matches with tee_time_id = NULL that a per-
  // tee-time fan-out would have missed.
  const fanout = await db
    .select({ id: matches.id })
    .from(matches)
    .innerJoin(
      matchParticipants,
      eq(matchParticipants.matchId, matches.id)
    )
    .where(
      and(
        eq(matches.roundId, target.round.id),
        eq(matchParticipants.tripMemberId, tripMemberId)
      )
    );
  const participatingMatchIds: string[] = fanout.length
    ? fanout.map((m) => m.id)
    : [matchId];

  if (gross == null) {
    // Empty input: delete the score row from every fan-out match.
    await db
      .delete(holeScores)
      .where(
        and(
          inArray(holeScores.matchId, participatingMatchIds),
          eq(holeScores.tripMemberId, tripMemberId),
          eq(holeScores.holeNumber, holeNumber)
        )
      );
  } else {
    for (const mid of participatingMatchIds) {
      await db
        .insert(holeScores)
        .values({
          matchId: mid,
          tripMemberId,
          holeNumber,
          gross,
          enteredBy: ctx.user.id,
          enteredAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            holeScores.matchId,
            holeScores.tripMemberId,
            holeScores.holeNumber,
          ],
          set: {
            gross,
            enteredBy: ctx.user.id,
            enteredAt: new Date(),
          },
        });
    }
  }

  // Recompute status for every match that received the score.
  for (const mid of participatingMatchIds) {
    await recomputeMatchStatus(mid);
  }

  const tripSlug = await getTripSlugById(target.round.tripId);
  for (const mid of participatingMatchIds) {
    revalidatePath(`/trips/${tripSlug}/matches/${mid}`);
    revalidatePath(`/trips/${tripSlug}/matches/${mid}/score`);
  }
  // Also bust the cache for the tee-time-keyed score route — otherwise
  // navigating away and back lands on a stale snapshot, and the
  // auto-jump-to-first-unscored picks hole 1 instead of the next empty.
  if (target.match.teeTimeId) {
    revalidatePath(`/trips/${tripSlug}/tee-times/${target.match.teeTimeId}/score`);
  }
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
  revalidatePath(`/trips/${tripSlug}/feed`);
  revalidatePath(`/trips/${tripSlug}/schedule`);
}

/**
 * "30 Ball" — shared loader + auth for commit/uncommit. Resolves the
 * match, the side's members (via teamId), and their hole rows for the
 * given hole in THIS match ("counted" is per-match, no fan-out).
 */
async function loadThirtyBallSideHole(
  matchId: string,
  teamId: string,
  holeNumber: number,
) {
  if (!matchId || !teamId) throw new Error('matchId and teamId required');
  if (!Number.isFinite(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    throw new Error('Invalid hole number');
  }

  const [match] = await db
    .select({ match: matches, round: rounds })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error('Match not found');
  if (match.match.format !== 'thirty_ball') {
    throw new Error('Not a 30 Ball match');
  }

  const sideMembers = await db
    .select({ member: tripMembers })
    .from(matchParticipants)
    .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
    .where(
      and(
        eq(matchParticipants.matchId, matchId),
        eq(tripMembers.teamId, teamId),
      ),
    );
  if (sideMembers.length === 0) throw new Error('Side has no players');

  const sideMemberIds = sideMembers.map((s) => s.member.id);
  const holeRows = await db
    .select()
    .from(holeScores)
    .where(
      and(
        eq(holeScores.matchId, matchId),
        inArray(holeScores.tripMemberId, sideMemberIds),
        eq(holeScores.holeNumber, holeNumber),
      ),
    );

  return { match: match.match, round: match.round, sideMembers, sideMemberIds, holeRows };
}

/**
 * "30 Ball" — commit one side's ball selection for one hole. This is the
 * side's strategic decision, so unlike gross entry it is NOT open to any
 * trip member: only a player on the side, that team's captain, or an
 * admin can commit. Committing 0 balls is legit (burning a blow-up hole).
 * Budget (30 per side) is enforced here; committed holes lock — counted
 * can't re-toggle and the grosses reject edits.
 */
export async function commitThirtyBallHole(
  matchId: string,
  teamId: string,
  holeNumber: number,
  countedTripMemberIds: string[],
): Promise<void> {
  const ctx = await getGlobalAuthContext();
  requireAuth(ctx);

  const { round, sideMemberIds, holeRows } = await loadThirtyBallSideHole(
    matchId,
    teamId,
    holeNumber,
  );

  const isSelfOnSide =
    ctx.tripMember != null && sideMemberIds.includes(ctx.tripMember.id);
  if (
    !isSelfOnSide &&
    !isCaptainOf(ctx, teamId) &&
    !isPlatformAdmin(ctx) &&
    !isTripAdminOf(ctx, round.tripId)
  ) {
    throw new AuthorizationError(
      'Only a player on this side, their captain, or an admin can commit',
    );
  }

  const countedSet = new Set(countedTripMemberIds);
  if (countedTripMemberIds.some((id) => !sideMemberIds.includes(id))) {
    throw new Error('Selected player is not on this side');
  }

  // Every side player needs a recorded gross before the hole can commit —
  // committing around a missing score would make the selection meaningless.
  const rowByMember = new Map(holeRows.map((r) => [r.tripMemberId, r]));
  for (const id of sideMemberIds) {
    if (rowByMember.get(id)?.gross == null) {
      throw new Error('All players on the side need a score before committing');
    }
  }
  if (holeRows.some((r) => r.committedAt != null)) {
    throw new Error('This hole is already committed');
  }

  // Budget: committed counted scores so far + this commit ≤ 30.
  const [{ used }] = await db
    .select({ used: count() })
    .from(holeScores)
    .where(
      and(
        eq(holeScores.matchId, matchId),
        inArray(holeScores.tripMemberId, sideMemberIds),
        eq(holeScores.counted, true),
        isNotNull(holeScores.committedAt),
      ),
    );
  if (used + countedSet.size > THIRTY_BALL_BUDGET) {
    throw new Error(
      `Only ${THIRTY_BALL_BUDGET - used} of the side's ${THIRTY_BALL_BUDGET} scores remain — can't commit ${countedSet.size}`,
    );
  }

  const now = new Date();
  for (const id of sideMemberIds) {
    await db
      .update(holeScores)
      .set({ counted: countedSet.has(id), committedAt: now })
      .where(
        and(
          eq(holeScores.matchId, matchId),
          eq(holeScores.tripMemberId, id),
          eq(holeScores.holeNumber, holeNumber),
        ),
      );
  }

  await recomputeMatchStatus(matchId);

  const tripSlug = await getTripSlugById(round.tripId);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}`);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}/score`);
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
}

/**
 * "30 Ball" — reopen a committed hole. Mistake-correction path only, so
 * it's gated tighter than commit: captain of the side or admin (a player
 * un-committing their own bad decision is exactly what the lock exists
 * to prevent). Clears counted so the side re-selects from scratch.
 */
export async function uncommitThirtyBallHole(
  matchId: string,
  teamId: string,
  holeNumber: number,
): Promise<void> {
  const ctx = await getGlobalAuthContext();
  requireAuth(ctx);

  const { round, sideMemberIds } = await loadThirtyBallSideHole(
    matchId,
    teamId,
    holeNumber,
  );

  if (
    !isCaptainOf(ctx, teamId) &&
    !isPlatformAdmin(ctx) &&
    !isTripAdminOf(ctx, round.tripId)
  ) {
    throw new AuthorizationError('Only a captain or admin can uncommit a hole');
  }

  await db
    .update(holeScores)
    .set({ counted: false, committedAt: null })
    .where(
      and(
        eq(holeScores.matchId, matchId),
        inArray(holeScores.tripMemberId, sideMemberIds),
        eq(holeScores.holeNumber, holeNumber),
      ),
    );

  await recomputeMatchStatus(matchId);

  const tripSlug = await getTripSlugById(round.tripId);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}`);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}/score`);
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
}

/**
 * Team-input score upsert — for Scramble and Alternate Shot. One gross per
 * team per hole; the action writes it to every teammate's holeScores row
 * (the storage layer stays per-player, so any consumer not aware of team
 * formats still computes a coherent score). The team engine reads any one
 * teammate's row since they're identical.
 *
 * Auth: any current member of the team can submit on its behalf, plus the
 * usual platform/trip admin overrides. (We don't have a "team captain"
 * concept that limits score entry to the captain; any teammate can record.)
 */
export async function upsertTeamHoleScore(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  requireAuth(ctx);

  const matchId = String(formData.get('matchId') ?? '').trim();
  const teamId = String(formData.get('teamId') ?? '').trim();
  const holeNumberRaw = String(formData.get('holeNumber') ?? '').trim();
  if (!matchId || !teamId || !holeNumberRaw) {
    throw new Error('matchId, teamId, holeNumber required');
  }
  const holeNumber = Number(holeNumberRaw);
  if (!Number.isFinite(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    throw new Error('Invalid hole number');
  }

  // Pull the match's round (for the trip context) plus every participant
  // on this team. Validates that the team belongs to the match in one go.
  const teamParticipants = await db
    .select({
      member: tripMembers,
      round: rounds,
      match: matches,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
    .where(
      and(
        eq(matchParticipants.matchId, matchId),
        eq(matchParticipants.teamId, teamId),
      ),
    );

  if (teamParticipants.length === 0) {
    throw new Error("That team isn't on this match.");
  }

  // Authorization: admin OR a member of this team
  const isAdmin = isPlatformAdmin(ctx) || isTripAdminOf(ctx, teamParticipants[0].round.tripId);
  const isTeammate = teamParticipants.some(
    (p) => ctx.tripMember?.id === p.member.id,
  );
  if (!isAdmin && !isTeammate) {
    throw new AuthorizationError(
      'Not authorized to enter scores for this team',
    );
  }

  const gross = parseGross(formData.get('gross'));
  const tripMemberIds = teamParticipants.map((p) => p.member.id);

  // Fan-out to stacked matches: the team plays one ball even if the foursome
  // is also doing a side match in a different format. Same tee-time gating
  // as the player-input action — different groups never share scores.
  const teeTimeId = teamParticipants[0].match.teeTimeId;
  let participatingMatchIds: string[] = [matchId];
  if (teeTimeId) {
    const fanout = await db
      .select({ id: matches.id })
      .from(matches)
      .innerJoin(
        matchParticipants,
        eq(matchParticipants.matchId, matches.id),
      )
      .where(
        and(
          eq(matches.teeTimeId, teeTimeId),
          inArray(matchParticipants.tripMemberId, tripMemberIds),
        ),
      );
    participatingMatchIds = Array.from(new Set(fanout.map((m) => m.id)));
  }

  if (gross == null) {
    await db
      .delete(holeScores)
      .where(
        and(
          inArray(holeScores.matchId, participatingMatchIds),
          inArray(holeScores.tripMemberId, tripMemberIds),
          eq(holeScores.holeNumber, holeNumber),
        ),
      );
  } else {
    for (const mid of participatingMatchIds) {
      for (const tmId of tripMemberIds) {
        await db
          .insert(holeScores)
          .values({
            matchId: mid,
            tripMemberId: tmId,
            holeNumber,
            gross,
            enteredBy: ctx.user.id,
            enteredAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              holeScores.matchId,
              holeScores.tripMemberId,
              holeScores.holeNumber,
            ],
            set: {
              gross,
              enteredBy: ctx.user.id,
              enteredAt: new Date(),
            },
          });
      }
    }
  }

  for (const mid of participatingMatchIds) {
    await recomputeMatchStatus(mid);
  }

  const tripSlug = await getTripSlugById(teamParticipants[0].round.tripId);
  for (const mid of participatingMatchIds) {
    revalidatePath(`/trips/${tripSlug}/matches/${mid}`);
    revalidatePath(`/trips/${tripSlug}/matches/${mid}/score`);
  }
  if (teamParticipants[0].match.teeTimeId) {
    revalidatePath(
      `/trips/${tripSlug}/tee-times/${teamParticipants[0].match.teeTimeId}/score`,
    );
  }
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
  revalidatePath(`/trips/${tripSlug}/feed`);
  revalidatePath(`/trips/${tripSlug}/schedule`);
}
