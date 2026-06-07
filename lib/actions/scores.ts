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
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  canEnterScoreFor,
  requireAuth,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import { computeMatch, formatStatus } from '@/lib/scoring/engine';

/**
 * Recompute the match's status / winning team / result text from its current
 * hole_scores. Called after every score upsert so the scoreboard reflects the
 * truth without a separate "finalize match" step.
 */
async function recomputeMatchStatus(matchId: string): Promise<void> {
  const data = await getMatchScoringData(matchId);
  if (!data) return;

  const computed = computeMatch({
    players: data.enginePlayers,
    holes: data.engineHoles,
    scores: data.engineScores,
  });

  // Map A/B back to the actual team IDs. data.participants carries the side.
  const teamIdByside = new Map<'A' | 'B', string>();
  for (const p of data.participants) {
    if (!teamIdByside.has(p.side)) teamIdByside.set(p.side, p.team.id);
  }

  let nextStatus: 'scheduled' | 'in_progress' | 'completed' = 'scheduled';
  let winningTeamId: string | null = null;
  let isHalved = false;
  let resultText: string | null = null;

  switch (computed.status.kind) {
    case 'not_started':
      nextStatus = 'scheduled';
      break;
    case 'in_progress':
    case 'dormie':
      nextStatus = 'in_progress';
      resultText = formatStatus(computed.status);
      break;
    case 'closed':
      nextStatus = 'completed';
      winningTeamId = teamIdByside.get(computed.status.winner) ?? null;
      resultText = formatStatus(computed.status);
      break;
    case 'halved':
      nextStatus = 'completed';
      isHalved = true;
      resultText = formatStatus(computed.status);
      break;
  }

  await db
    .update(matches)
    .set({ status: nextStatus, winningTeamId, isHalved, resultText })
    .where(eq(matches.id, matchId));
}

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

  // Recompute the match status from the new score set so the scoreboard,
  // feed, and match-detail pages reflect closeouts/halves immediately.
  await recomputeMatchStatus(matchId);

  const tripSlug = await getTripSlugById(target.round.tripId);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}`);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}/score`);
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
  revalidatePath(`/trips/${tripSlug}/feed`);
  revalidatePath(`/trips/${tripSlug}/schedule`);
}
