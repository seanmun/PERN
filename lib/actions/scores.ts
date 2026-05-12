'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds,
  holeScores,
  tripMembers,
} from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  canEnterScoreFor,
  requireAuth,
} from '@/lib/auth/permissions';

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
  const ctx = await getAuthContext();
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

  if (gross == null) {
    // Empty input: delete the score row (player cleared their entry)
    await db
      .delete(holeScores)
      .where(
        and(
          eq(holeScores.matchId, matchId),
          eq(holeScores.tripMemberId, tripMemberId),
          eq(holeScores.holeNumber, holeNumber)
        )
      );
  } else {
    await db
      .insert(holeScores)
      .values({
        matchId,
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

  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}/score`);
}
