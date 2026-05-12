import { eq, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds,
  teams,
  tripMembers,
} from '@/db/schema';

type Team = typeof teams.$inferSelect;

export type TeamTotal = {
  teamId: string;
  teamName: string;
  teamColor: string | null;
  points: number;
};

export type PlayerTotal = {
  tripMemberId: string;
  nickname: string;
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
  tripHandicap: string | null;
  points: number;
  matchesPlayed: number;
};

export type Leaderboard = {
  teamTotals: TeamTotal[];
  playerTotals: PlayerTotal[];
  matchesContested: number;     // completed cup-counting matches
  matchesTotal: number;         // total cup-counting matches scheduled
  pointsAvailable: number;      // points still up for grabs
  pointsContested: number;      // points already awarded (sum of team totals)
};

export async function getLeaderboard(tripId: string): Promise<Leaderboard> {
  const teamsList = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, tripId))
    .orderBy(asc(teams.name));

  const membersList = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId))
    .orderBy(asc(tripMembers.nickname));

  // All cup-counting matches in this trip with their round info
  const matchRows = await db
    .select({ match: matches, round: rounds })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(rounds.tripId, tripId));

  const cupMatches = matchRows.filter((r) => r.round.countsTowardCup);
  const completedCup = cupMatches.filter((r) => r.match.status === 'completed');

  const completedMatchIds = completedCup.map((r) => r.match.id);

  const participants = completedMatchIds.length
    ? await db
        .select()
        .from(matchParticipants)
    : [];

  const completedMatchIdSet = new Set(completedMatchIds);
  const relevantParticipants = participants.filter((p) =>
    completedMatchIdSet.has(p.matchId)
  );

  // Map: matchId -> participants
  const participantsByMatch = new Map<string, typeof relevantParticipants>();
  for (const p of relevantParticipants) {
    const list = participantsByMatch.get(p.matchId) ?? [];
    list.push(p);
    participantsByMatch.set(p.matchId, list);
  }

  // Initialise team totals
  const teamTotalsMap = new Map<string, TeamTotal>();
  for (const t of teamsList) {
    teamTotalsMap.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      teamColor: t.color,
      points: 0,
    });
  }

  // Initialise player totals
  const playerTotalsMap = new Map<string, PlayerTotal>();
  const teamById = new Map(teamsList.map((t) => [t.id, t] as [string, Team]));
  for (const m of membersList) {
    const team = m.teamId ? teamById.get(m.teamId) ?? null : null;
    playerTotalsMap.set(m.id, {
      tripMemberId: m.id,
      nickname: m.nickname,
      teamId: m.teamId,
      teamName: team?.name ?? null,
      teamColor: team?.color ?? null,
      tripHandicap: m.tripHandicap,
      points: 0,
      matchesPlayed: 0,
    });
  }

  // Score each completed cup match
  for (const { match } of completedCup) {
    const matchParts = participantsByMatch.get(match.id) ?? [];

    for (const p of matchParts) {
      const player = playerTotalsMap.get(p.tripMemberId);
      if (player) player.matchesPlayed += 1;
    }

    if (match.isHalved) {
      const teamsInMatch = new Set(matchParts.map((p) => p.teamId));
      for (const teamId of teamsInMatch) {
        const t = teamTotalsMap.get(teamId);
        if (t) t.points += 0.5;
      }
      for (const p of matchParts) {
        const player = playerTotalsMap.get(p.tripMemberId);
        if (player) player.points += 0.5;
      }
    } else if (match.winningTeamId) {
      const t = teamTotalsMap.get(match.winningTeamId);
      if (t) t.points += 1;
      for (const p of matchParts) {
        if (p.teamId === match.winningTeamId) {
          const player = playerTotalsMap.get(p.tripMemberId);
          if (player) player.points += 1;
        }
      }
    }
  }

  const teamTotals = Array.from(teamTotalsMap.values()).sort((a, b) =>
    b.points - a.points || a.teamName.localeCompare(b.teamName)
  );

  const playerTotalsList = Array.from(playerTotalsMap.values());
  const anyPointsScored = playerTotalsList.some((p) => p.points > 0);
  const hcap = (s: string | null) => (s ? parseFloat(s) : Number.POSITIVE_INFINITY);

  const playerTotals = playerTotalsList.sort((a, b) => {
    // While there are no points on the board, rank by handicap (low to high)
    // so the board has meaningful order on day 1. Once scoring starts, points
    // take over; handicap is the tiebreaker.
    if (anyPointsScored && b.points !== a.points) return b.points - a.points;
    const ah = hcap(a.tripHandicap);
    const bh = hcap(b.tripHandicap);
    if (ah !== bh) return ah - bh;
    return a.nickname.localeCompare(b.nickname);
  });

  return {
    teamTotals,
    playerTotals,
    matchesContested: completedCup.length,
    matchesTotal: cupMatches.length,
    pointsAvailable: cupMatches.length - completedCup.length,
    pointsContested: completedCup.length,
  };
}
