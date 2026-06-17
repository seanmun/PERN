'use server';

import { revalidatePath } from 'next/cache';
import { eq, and, inArray } from 'drizzle-orm';
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
  type PlayerInputFormat,
  type StablefordPoints,
} from '@/lib/scoring/engine';
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
