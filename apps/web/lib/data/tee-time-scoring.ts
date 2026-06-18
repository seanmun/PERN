/**
 * Tee-time-keyed score-entry data loader.
 *
 * Reads the foursome's explicit roster from `tee_time_participants`
 * (decoupled from match participation), so a player in only a
 * round-wide cross-foursome match still shows on the scorecard.
 *
 * For each roster player we pick "their" matchId — any match in the
 * round they're a participant of. Score writes use that matchId; the
 * upsert action fans out from there to every other match the player
 * is in for the round.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  teeTimes,
  teeTimeParticipants,
  tripMembers,
  teams,
} from '@/db/schema';
import {
  getMatchScoringData,
  type MatchScoringData,
} from '@/lib/data/match-scoring';

type TripMember = typeof tripMembers.$inferSelect;
type Team = typeof teams.$inferSelect;

export type TeeTimeScoringData = MatchScoringData & {
  resolvedTeeTimeId: string;
  /** Per-player matchId map: tripMemberId → matchId to attribute that player's
   * score writes to. Each player is mapped to one of their participating
   * matches in the round; the upsert action fans out from there. */
  matchIdByPlayer: Record<string, string>;
  /** Foursome roster from tee_time_participants — independent of any single
   * match's participants. The scorecard renders one row per entry here. */
  rosterPlayers: { member: TripMember; team: Team; side: 'A' | 'B' }[];
};

export async function getTeeTimeScoringData(
  teeTimeId: string,
): Promise<TeeTimeScoringData | null> {
  const [teeTime] = await db
    .select()
    .from(teeTimes)
    .where(eq(teeTimes.id, teeTimeId))
    .limit(1);
  if (!teeTime) return null;

  // 1. Roster: explicit tee_time_participants rows.
  const rosterRows = await db
    .select({ tripMemberId: teeTimeParticipants.tripMemberId })
    .from(teeTimeParticipants)
    .where(eq(teeTimeParticipants.teeTimeId, teeTimeId));
  const rosterMemberIds = rosterRows.map((r) => r.tripMemberId);

  // 2. All matches in this round + their participants. We need a
  //    matchId per roster player; we pick any match they're in.
  const roundMatches = await db
    .select({ id: matches.id, teeTimeId: matches.teeTimeId })
    .from(matches)
    .where(eq(matches.roundId, teeTime.roundId));

  const allParticipants = roundMatches.length
    ? await db
        .select({
          matchId: matchParticipants.matchId,
          tripMemberId: matchParticipants.tripMemberId,
        })
        .from(matchParticipants)
        .where(
          inArray(
            matchParticipants.matchId,
            roundMatches.map((m) => m.id),
          ),
        )
    : [];

  // Prefer a match whose tee_time_id matches THIS tee time (in-foursome
  // matches like the 2v2). Falls back to any round-wide match the
  // player's in. Picking in-foursome first keeps the action layer's
  // existing tee-time-scoped fan-out doing useful work for the common case.
  const teeTimeOf = new Map(roundMatches.map((m) => [m.id, m.teeTimeId]));
  const matchIdByPlayer = new Map<string, string>();
  for (const p of allParticipants) {
    if (!rosterMemberIds.includes(p.tripMemberId)) continue;
    const isInFoursome = teeTimeOf.get(p.matchId) === teeTimeId;
    const existing = matchIdByPlayer.get(p.tripMemberId);
    const existingIsInFoursome = existing
      ? teeTimeOf.get(existing) === teeTimeId
      : false;
    if (!existing || (isInFoursome && !existingIsInFoursome)) {
      matchIdByPlayer.set(p.tripMemberId, p.matchId);
    }
  }

  // 3. Pick the "primary" match to drive scorecard rendering — the
  //    widest in-foursome match. Its data shape (course, holes, tees,
  //    participants list etc.) is what the UI renders. We then patch
  //    in any roster players who aren't in the primary match.
  const foursomeMatches = roundMatches.filter((m) => m.teeTimeId === teeTimeId);
  const countByMatch = new Map<string, number>();
  for (const p of allParticipants) {
    if (foursomeMatches.find((m) => m.id === p.matchId)) {
      countByMatch.set(p.matchId, (countByMatch.get(p.matchId) ?? 0) + 1);
    }
  }
  let primaryMatchId: string | undefined = [...countByMatch.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))[0]?.[0];

  // If no in-foursome match exists, fall back to ANY match a roster
  // player is in (most likely the round-wide match).
  if (!primaryMatchId) {
    const first = matchIdByPlayer.values().next();
    if (!first.done) primaryMatchId = first.value;
  }

  if (!primaryMatchId) return null;

  const data = await getMatchScoringData(primaryMatchId);
  if (!data) return null;

  // Augment data.scores with scores from any OTHER match a roster
  // player is in for this round. Fan-out may not have populated every
  // match (especially cross-foursome), so we dedupe by (player, hole)
  // and keep the first non-null gross we see. The primary-match scores
  // already loaded by getMatchScoringData win the tiebreaker.
  const otherMatchIds = roundMatches
    .map((m) => m.id)
    .filter((id) => id !== primaryMatchId);
  if (otherMatchIds.length && rosterMemberIds.length) {
    const seen = new Set(
      data.scores.map((s) => `${s.tripMemberId}:${s.holeNumber}`),
    );
    const extra = await getMatchScoringData(otherMatchIds[0]);
    if (extra) {
      for (const s of extra.scores) {
        if (!rosterMemberIds.includes(s.tripMemberId)) continue;
        const key = `${s.tripMemberId}:${s.holeNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        data.scores.push(s);
      }
    }
  }

  // Build the full roster's tripMember + team payload. Side (A/B) is
  // derived from team UUID sort, the same scheme the engine uses to
  // bucket sides, so visual side assignment matches scoring.
  const rosterDetails = rosterMemberIds.length
    ? await db
        .select({ member: tripMembers, team: teams })
        .from(tripMembers)
        .leftJoin(teams, eq(tripMembers.teamId, teams.id))
        .where(inArray(tripMembers.id, rosterMemberIds))
    : [];

  const distinctTeams = Array.from(
    new Map(rosterDetails.filter((r) => r.team).map((r) => [r.team!.id, r.team!])).values(),
  ).sort((a, b) => (a.id < b.id ? -1 : 1));
  const sideByTeam = new Map<string, 'A' | 'B'>();
  if (distinctTeams[0]) sideByTeam.set(distinctTeams[0].id, 'A');
  if (distinctTeams[1]) sideByTeam.set(distinctTeams[1].id, 'B');

  const rosterPlayers = rosterDetails
    .filter((r): r is { member: TripMember; team: Team } => r.team != null)
    .map((r) => ({
      member: r.member,
      team: r.team,
      side: sideByTeam.get(r.team.id) ?? 'A',
    }));

  return {
    ...data,
    resolvedTeeTimeId: teeTimeId,
    matchIdByPlayer: Object.fromEntries(matchIdByPlayer),
    rosterPlayers,
  };
}
