import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds,
  teams,
  tripMembers,
  holeScores,
  courseHoles,
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
  holesScored: number;
  gross: number;
  // Tracked but not currently displayed. Reserved for a future Net
  // Leaderboard view (stableford-style); the visible Cup leaderboard
  // shows GROSS vs par, not net vs par.
  net: number;
  par: number;          // sum of par for the holes scored
  scoreVsPar: number;   // gross - par (negative is good)
};

export type Leaderboard = {
  teamTotals: TeamTotal[];
  playerTotals: PlayerTotal[];
  matchesContested: number;     // completed cup-counting matches
  matchesTotal: number;         // total cup-counting matches scheduled
  pointsAvailable: number;      // points still up for grabs
  pointsContested: number;      // points already awarded
};

/**
 * Allocate handicap strokes across the 18 holes using stroke index — the
 * absolute (per-player) allocation, not match-relative. Stroke index 1 is
 * the hardest hole; strokes go there first.
 *
 *   strokes(hole) = floor(hcp / 18) + (hcp % 18 >= holeSI ? 1 : 0)
 */
function allocateStrokes(
  handicap: number,
  holes: { holeNumber: number; handicapIndex: number }[],
): Map<number, number> {
  const result = new Map<number, number>();
  const hcp = Math.max(0, Math.round(handicap));
  for (const h of holes) {
    const base = Math.floor(hcp / 18);
    const extra = hcp % 18 >= h.handicapIndex ? 1 : 0;
    result.set(h.holeNumber, base + extra);
  }
  return result;
}

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

  // All matches in this trip with their round info
  const matchRows = await db
    .select({ match: matches, round: rounds })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(rounds.tripId, tripId));

  // Hidden rounds (e.g. test rounds) never contribute to the scoreboard
  const visibleMatches = matchRows.filter((r) => !r.round.isHidden);
  const cupMatches = visibleMatches.filter((r) => r.round.countsTowardCup);
  const completedCup = cupMatches.filter((r) => r.match.status === 'completed');

  const completedMatchIds = completedCup.map((r) => r.match.id);

  const allParticipants = visibleMatches.length
    ? await db.select().from(matchParticipants)
    : [];

  const visibleMatchIdSet = new Set(visibleMatches.map((r) => r.match.id));
  const relevantParticipants = allParticipants.filter((p) =>
    visibleMatchIdSet.has(p.matchId),
  );

  const completedMatchIdSet = new Set(completedMatchIds);

  // ───────── Team totals: match-play points from completed cup matches ─────────
  const teamTotalsMap = new Map<string, TeamTotal>();
  for (const t of teamsList) {
    teamTotalsMap.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      teamColor: t.color,
      points: 0,
    });
  }
  for (const { match } of completedCup) {
    if (match.isHalved) {
      // 0.5 to each team in the match
      const teamsInMatch = new Set(
        relevantParticipants
          .filter((p) => p.matchId === match.id)
          .map((p) => p.teamId),
      );
      for (const teamId of teamsInMatch) {
        const t = teamTotalsMap.get(teamId);
        if (t) t.points += 0.5;
      }
    } else if (match.winningTeamId) {
      const t = teamTotalsMap.get(match.winningTeamId);
      if (t) t.points += 1;
    }
  }

  // ───────── Individual leaderboard: net vs par (PGA-style) ─────────
  // Fetch all hole scores and the relevant courseHoles in a single pass.
  const allScores = visibleMatchIdSet.size
    ? await db
        .select()
        .from(holeScores)
        .where(inArray(holeScores.matchId, Array.from(visibleMatchIdSet)))
    : [];

  // Map match → round so we know which course's holes to look at AND so
  // we can dedupe stacked-match scores (one physical ball per player per
  // round per hole — even though the fan-out writes the same gross to N
  // hole_scores rows when a player is in N stacked matches).
  const courseIdByMatch = new Map<string, string>();
  const roundIdByMatch = new Map<string, string>();
  for (const r of visibleMatches) {
    courseIdByMatch.set(r.match.id, r.round.courseId);
    roundIdByMatch.set(r.match.id, r.round.id);
  }
  const courseIds = Array.from(new Set(visibleMatches.map((r) => r.round.courseId)));

  const courseHolesList = courseIds.length
    ? await db
        .select()
        .from(courseHoles)
        .where(inArray(courseHoles.courseId, courseIds))
    : [];

  // courseId → (holeNumber → { par, handicapIndex })
  const holesByCourse = new Map<
    string,
    Map<number, { par: number; handicapIndex: number }>
  >();
  for (const ch of courseHolesList) {
    const inner =
      holesByCourse.get(ch.courseId) ??
      new Map<number, { par: number; handicapIndex: number }>();
    inner.set(ch.holeNumber, { par: ch.par, handicapIndex: ch.handicapIndex });
    holesByCourse.set(ch.courseId, inner);
  }

  // Pre-allocate stroke maps per (player, course) since strokes only depend on
  // the player's handicap and the course's stroke indices.
  type StrokeKey = string; // `${playerId}::${courseId}`
  const strokesByPlayerCourse = new Map<StrokeKey, Map<number, number>>();

  function getStrokes(
    playerId: string,
    courseId: string,
    handicap: number,
  ): Map<number, number> {
    const key: StrokeKey = `${playerId}::${courseId}`;
    let m = strokesByPlayerCourse.get(key);
    if (m) return m;
    const courseHolesMap = holesByCourse.get(courseId);
    if (!courseHolesMap) {
      m = new Map();
    } else {
      const holesArr = Array.from(courseHolesMap.entries()).map(([n, v]) => ({
        holeNumber: n,
        handicapIndex: v.handicapIndex,
      }));
      m = allocateStrokes(handicap, holesArr);
    }
    strokesByPlayerCourse.set(key, m);
    return m;
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
      holesScored: 0,
      gross: 0,
      net: 0,
      par: 0,
      scoreVsPar: 0,
    });
  }

  // Dedupe by (tripMemberId, roundId, holeNumber) — when a player is in
  // multiple stacked matches in the same tee time, the upsert fan-out
  // writes the same gross to N hole_scores rows. Summing all N inflates
  // every individual leaderboard column by Nx. We keep the first row we
  // see per (player, round, hole) and ignore subsequent duplicates.
  type DedupedScore = {
    tripMemberId: string;
    courseId: string;
    holeNumber: number;
    gross: number;
  };
  const dedupedScores = new Map<string, DedupedScore>();
  for (const s of allScores) {
    if (s.gross == null) continue;
    const roundId = roundIdByMatch.get(s.matchId);
    const courseId = courseIdByMatch.get(s.matchId);
    if (!roundId || !courseId) continue;
    const key = `${s.tripMemberId}::${roundId}::${s.holeNumber}`;
    if (dedupedScores.has(key)) continue;
    dedupedScores.set(key, {
      tripMemberId: s.tripMemberId,
      courseId,
      holeNumber: s.holeNumber,
      gross: s.gross,
    });
  }

  for (const s of dedupedScores.values()) {
    const player = playerTotalsMap.get(s.tripMemberId);
    if (!player) continue;

    const courseHolesMap = holesByCourse.get(s.courseId);
    if (!courseHolesMap) continue;
    const hole = courseHolesMap.get(s.holeNumber);
    if (!hole) continue;

    // Net is still tracked (per-player handicap strokes), kept around for
    // a future "net leaderboard" tab if/when we want one. The DISPLAYED
    // score-vs-par on the Cup tab is GROSS vs par — what the player
    // actually shot, no handicap adjustment. Mirrors how PGA leaderboards
    // work and matches a viewer's intuition ("Eric shot 3 on a par 4 → -1").
    const handicapNum = player.tripHandicap ? parseFloat(player.tripHandicap) : 0;
    const strokeMap = getStrokes(s.tripMemberId, s.courseId, handicapNum);
    const strokes = strokeMap.get(s.holeNumber) ?? 0;

    player.holesScored += 1;
    player.gross += s.gross;
    player.net += s.gross - strokes;
    player.par += hole.par;
    player.scoreVsPar = player.gross - player.par;
  }

  const teamTotals = Array.from(teamTotalsMap.values()).sort(
    (a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName),
  );

  const playerTotalsList = Array.from(playerTotalsMap.values());
  const anyScored = playerTotalsList.some((p) => p.holesScored > 0);
  const hcap = (s: string | null) =>
    s ? parseFloat(s) : Number.POSITIVE_INFINITY;

  const playerTotals = playerTotalsList.sort((a, b) => {
    // Before any scores: rank by handicap (low to high) for a meaningful order.
    // Once scoring starts: lowest net-vs-par first; players with zero holes
    // played fall to the bottom; ties broken by handicap, then nickname.
    if (anyScored) {
      if (a.holesScored === 0 && b.holesScored === 0) {
        return hcap(a.tripHandicap) - hcap(b.tripHandicap);
      }
      if (a.holesScored === 0) return 1;
      if (b.holesScored === 0) return -1;
      if (a.scoreVsPar !== b.scoreVsPar) return a.scoreVsPar - b.scoreVsPar;
    }
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
