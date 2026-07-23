import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { holeScores, matches, matchParticipants, teams, tripMembers } from '@/db/schema';
import type { AuthContext } from '@/lib/auth/current-user';
import {
  isCaptainOf,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import type { ScoreClientThirtyBall } from '@/components/score-entry/ScoreEntryClient';

/**
 * 30 Ball side-state for a score-entry surface. One entry per (match,
 * side) where at least one of the side's players is on the scorecard —
 * the tee-time foursome card and the match score page both feed their
 * roster through here. Powers the per-hole "Commit scores" flow.
 */
export async function getThirtyBallEntryStates(
  roundId: string,
  rosterMemberIds: string[],
  ctx: AuthContext,
): Promise<ScoreClientThirtyBall[]> {
  if (rosterMemberIds.length === 0) return [];

  const tbMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.roundId, roundId), eq(matches.format, 'thirty_ball')));
  if (tbMatches.length === 0) return [];
  const matchIds = tbMatches.map((m) => m.id);

  const participants = await db
    .select({
      matchId: matchParticipants.matchId,
      member: tripMembers,
      team: teams,
    })
    .from(matchParticipants)
    .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
    .innerJoin(teams, eq(tripMembers.teamId, teams.id))
    .where(inArray(matchParticipants.matchId, matchIds));

  const scores = await db
    .select({
      matchId: holeScores.matchId,
      tripMemberId: holeScores.tripMemberId,
      holeNumber: holeScores.holeNumber,
      counted: holeScores.counted,
      committedAt: holeScores.committedAt,
    })
    .from(holeScores)
    .where(inArray(holeScores.matchId, matchIds));

  const isAdmin =
    isPlatformAdmin(ctx) ||
    (participants[0] != null && isTripAdminOf(ctx, participants[0].member.tripId));

  const states: ScoreClientThirtyBall[] = [];
  for (const matchId of matchIds) {
    const inMatch = participants.filter((p) => p.matchId === matchId);
    const teamIds = [...new Set(inMatch.map((p) => p.team.id))];
    for (const teamId of teamIds) {
      const side = inMatch.filter((p) => p.team.id === teamId);
      const memberIds = side.map((p) => p.member.id);
      if (!memberIds.some((id) => rosterMemberIds.includes(id))) continue;

      const sideScores = scores.filter(
        (s) => s.matchId === matchId && memberIds.includes(s.tripMemberId),
      );
      const committedHoles: Record<number, string[]> = {};
      let budgetUsed = 0;
      for (const s of sideScores) {
        if (s.committedAt == null) continue;
        if (!(s.holeNumber in committedHoles)) committedHoles[s.holeNumber] = [];
        if (s.counted) {
          committedHoles[s.holeNumber].push(s.tripMemberId);
          budgetUsed++;
        }
      }

      const isSelfOnSide =
        ctx.tripMember != null && memberIds.includes(ctx.tripMember.id);

      states.push({
        matchId,
        teamId,
        teamName: side[0]?.team.name ?? 'Team',
        teamColor: side[0]?.team.color ?? null,
        memberIds,
        canCommit: isSelfOnSide || isAdmin || isCaptainOf(ctx, teamId),
        budgetUsed,
        committedHoles,
      });
    }
  }
  return states;
}
