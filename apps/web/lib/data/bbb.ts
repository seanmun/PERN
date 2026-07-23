import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { bbbHolePoints, matches, matchParticipants, tripMembers } from '@/db/schema';
import type { AuthContext } from '@/lib/auth/current-user';
import {
  isCaptainOf,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import type { ScoreClientBbb } from '@/components/score-entry/ScoreEntryClient';
import type { BbbHolePoints as EngineBbbPoints } from '@buddycup/scoring/engine';

/** Committed point rows for one match, in the engine's input shape. */
export async function getBbbPoints(matchId: string): Promise<EngineBbbPoints[]> {
  const rows = await db
    .select()
    .from(bbbHolePoints)
    .where(eq(bbbHolePoints.matchId, matchId));
  return rows.map((r) => ({
    holeNumber: r.holeNumber,
    bingo: r.bingoTripMemberId,
    bango: r.bangoTripMemberId,
    bongo: r.bongoTripMemberId,
  }));
}

/**
 * Bingo Bango Bongo commit state for a score-entry surface: one entry per
 * BBB match in the round with players on this scorecard. Unlike 30 Ball
 * there's no per-side split — the three points are a group decision.
 */
export async function getBbbEntryStates(
  roundId: string,
  rosterMemberIds: string[],
  ctx: AuthContext,
): Promise<ScoreClientBbb[]> {
  if (rosterMemberIds.length === 0) return [];

  const bbbMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(eq(matches.roundId, roundId), eq(matches.format, 'bingo_bango_bongo')),
    );
  if (bbbMatches.length === 0) return [];
  const matchIds = bbbMatches.map((m) => m.id);

  const participants = await db
    .select({ matchId: matchParticipants.matchId, member: tripMembers })
    .from(matchParticipants)
    .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
    .where(inArray(matchParticipants.matchId, matchIds));

  const rows = await db
    .select()
    .from(bbbHolePoints)
    .where(inArray(bbbHolePoints.matchId, matchIds));

  const isAdmin =
    isPlatformAdmin(ctx) ||
    (participants[0] != null && isTripAdminOf(ctx, participants[0].member.tripId));

  const states: ScoreClientBbb[] = [];
  for (const matchId of matchIds) {
    const inMatch = participants.filter((p) => p.matchId === matchId);
    const memberIds = inMatch.map((p) => p.member.id);
    if (!memberIds.some((id) => rosterMemberIds.includes(id))) continue;

    const committedHoles: ScoreClientBbb['committedHoles'] = {};
    for (const r of rows) {
      if (r.matchId !== matchId) continue;
      committedHoles[r.holeNumber] = {
        bingo: r.bingoTripMemberId,
        bango: r.bangoTripMemberId,
        bongo: r.bongoTripMemberId,
      };
    }

    const isParticipant =
      ctx.tripMember != null && memberIds.includes(ctx.tripMember.id);
    const isCaptainOfEither = inMatch.some(
      (p) => p.member.teamId != null && isCaptainOf(ctx, p.member.teamId),
    );

    states.push({
      matchId,
      memberIds,
      canCommit: isParticipant || isCaptainOfEither || isAdmin,
      committedHoles,
    });
  }
  return states;
}
