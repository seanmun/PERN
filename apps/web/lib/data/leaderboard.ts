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
  courseTees,
} from '@/db/schema';
import { toCourseHandicap } from '@buddycup/scoring/handicap';

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
  // Raw gross strokes summed across deduped holes.
  gross: number;
  // Net = gross - the player's full COURSE-handicap strokes for the
  // round (trip handicap treated as an index, converted via the round
  // tee's slope/rating when available). Independent of any match's
  // handicap method — the leaderboard is one consistent basis.
  net: number;
  par: number;          // sum of par for the holes scored
  scoreVsPar: number;   // net - par (negative is good)
  // Stableford total under the standard 4/3/2/1/0 (eagle/birdie/par/
  // bogey/double+) scale, computed from net vs par per hole. Always
  // populated regardless of which scoring mode a match uses — the
  // leaderboard column is a parallel "what would your stableford be"
  // view of every player's round.
  stablefordPoints: number;
  // Total course-handicap strokes across the player's played holes.
  // Displayed on the leaderboard as "+N".
  strokesGiven: number;
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
  // Award points per match segment. A segment counts the moment its
  // winner column is set — segments close independently from the
  // overall match, so a front-9 closeout can show up on the cup
  // standings before the back 9 is even started.
  for (const { match } of cupMatches) {
    const teamsInMatch = Array.from(
      new Set(
        relevantParticipants
          .filter((p) => p.matchId === match.id)
          .map((p) => p.teamId),
      ),
    );

    // Overall segment (full 18). Halved = split equally between the
    // two teams.
    if (match.pointsOverall > 0 && match.status === 'completed') {
      if (match.isHalved) {
        const split = match.pointsOverall / teamsInMatch.length;
        for (const teamId of teamsInMatch) {
          const t = teamTotalsMap.get(teamId);
          if (t) t.points += split;
        }
      } else if (match.winningTeamId) {
        const t = teamTotalsMap.get(match.winningTeamId);
        if (t) t.points += match.pointsOverall;
      }
    }

    // Front 9 segment.
    if (match.pointsFront9 > 0 && match.front9WinningTeamId) {
      const t = teamTotalsMap.get(match.front9WinningTeamId);
      if (t) t.points += match.pointsFront9;
    }

    // Back 9 segment.
    if (match.pointsBack9 > 0 && match.back9WinningTeamId) {
      const t = teamTotalsMap.get(match.back9WinningTeamId);
      if (t) t.points += match.pointsBack9;
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

  // ───────── Course-handicap strokes (leaderboard basis) ─────────
  //
  // The leaderboard reports net vs par off each player's FULL course
  // handicap — trip handicap treated as an index and converted via the
  // round tee's slope/rating (Index × Slope/113 + (Rating − Par)) when
  // the tee has them, falling back to the raw handicap otherwise.
  // Deliberately independent of any match's handicap_method: matches
  // resolve their own strokes for their own results, but the ongoing
  // individual race is one consistent basis for everyone.
  //
  // Match size is still needed below — the dedupe pass prefers the
  // widest match's gross row when a player is in stacked matches.
  const matchSizeById = new Map<string, number>();
  for (const p of relevantParticipants) {
    matchSizeById.set(p.matchId, (matchSizeById.get(p.matchId) ?? 0) + 1);
  }
  const memberById = new Map(membersList.map((m) => [m.id, m]));

  // Round → tee (explicit pick on the round, else the course default).
  const roundTeeById = new Map<string, { slope: number | null; rating: number | null }>();
  {
    const uniqueRounds = new Map(visibleMatches.map((r) => [r.round.id, r.round]));
    const teeCourseIds = Array.from(
      new Set(Array.from(uniqueRounds.values()).map((r) => r.courseId)),
    );
    const teesList = teeCourseIds.length
      ? await db
          .select()
          .from(courseTees)
          .where(inArray(courseTees.courseId, teeCourseIds))
      : [];
    for (const [roundId, round] of uniqueRounds) {
      const tee =
        teesList.find((t) => t.id === round.courseTeeId) ??
        teesList.find((t) => t.courseId === round.courseId && t.isDefault) ??
        null;
      roundTeeById.set(roundId, {
        slope: tee?.slope ?? null,
        rating: tee?.rating != null ? Number(tee.rating) : null,
      });
    }
  }

  // Course par per courseId (sum of hole pars) for the conversion.
  const parByCourse = new Map<string, number>();
  for (const [courseId, holesMap] of holesByCourse) {
    let par = 0;
    for (const h of holesMap.values()) par += h.par;
    parByCourse.set(courseId, par);
  }

  // Lazy per-(round, player) allocation cache.
  const strokesCache = new Map<string, Map<number, number>>();
  function strokesFor(
    roundId: string,
    courseId: string,
    tripMemberId: string,
  ): Map<number, number> | null {
    const key = `${roundId}::${tripMemberId}`;
    const cached = strokesCache.get(key);
    if (cached) return cached;
    const member = memberById.get(tripMemberId);
    const holesMap = holesByCourse.get(courseId);
    if (!member || !holesMap) return null;
    const index = member.tripHandicap ? Number(member.tripHandicap) : 18;
    const tee = roundTeeById.get(roundId) ?? { slope: null, rating: null };
    const courseHcp = toCourseHandicap(index, {
      slope: tee.slope,
      rating: tee.rating,
      par: parByCourse.get(courseId) ?? null,
    });
    const holesArr = Array.from(holesMap.entries()).map(([n, v]) => ({
      holeNumber: n,
      handicapIndex: v.handicapIndex,
    }));
    const allocated = allocateStrokes(courseHcp, holesArr);
    strokesCache.set(key, allocated);
    return allocated;
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
      stablefordPoints: 0,
      strokesGiven: 0,
    });
  }

  // Dedupe by (tripMemberId, roundId, holeNumber). When a player is in
  // multiple stacked matches at one tee time, the upsert fan-out writes
  // the same gross to N rows. We keep ONE row per unique key — preferring
  // the row from the WIDEST match (most participants). That's the "primary"
  // match for the foursome (Best Ball over Singles when stacked) and its
  // stroke allocation is the one we apply to the leaderboard.
  type DedupedScore = {
    tripMemberId: string;
    matchId: string;
    roundId: string;
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
    const existing = dedupedScores.get(key);
    if (existing) {
      const existingSize = matchSizeById.get(existing.matchId) ?? 0;
      const candidateSize = matchSizeById.get(s.matchId) ?? 0;
      if (existingSize >= candidateSize) continue;
    }
    dedupedScores.set(key, {
      tripMemberId: s.tripMemberId,
      matchId: s.matchId,
      roundId,
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

    // Strokes = the player's full course-handicap allocation for this
    // round (see the section above) — one basis for the whole board.
    const strokes =
      strokesFor(s.roundId, s.courseId, s.tripMemberId)?.get(s.holeNumber) ?? 0;

    const net = s.gross - strokes;
    player.holesScored += 1;
    player.gross += s.gross;
    player.net += net;
    player.par += hole.par;
    player.strokesGiven += strokes;
    // Display is NET vs par — gross minus the course-handicap strokes.
    player.scoreVsPar = player.net - player.par;
    // Stableford under the standard scale: eagle+=4, birdie=3, par=2,
    // bogey=1, double+=0.
    const diff = net - hole.par;
    let pts: number;
    if (diff <= -2) pts = 4;
    else if (diff === -1) pts = 3;
    else if (diff === 0) pts = 2;
    else if (diff === 1) pts = 1;
    else pts = 0;
    player.stablefordPoints += pts;
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
