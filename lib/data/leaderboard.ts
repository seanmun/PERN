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
import { computeTeamHandicap, type TeamInputFormat } from '@/lib/scoring/engine';

// Match-input formats that score one team gross per hole (one ball per team).
const TEAM_INPUT_FORMATS: ReadonlySet<string> = new Set<TeamInputFormat>([
  'scramble',
  'alternate_shot',
]);

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
  // Net = gross - strokes received in the player's match for each hole.
  // Match-relative — i.e. against the lowest handicap in the match field,
  // not the absolute course-handicap allocation.
  net: number;
  par: number;          // sum of par for the holes scored
  scoreVsPar: number;   // net - par (negative is good)
  // Total strokes the player has actually received across their played
  // holes (match-relative). Displayed on the leaderboard in place of the
  // raw trip handicap — "+3" reads as "you've gotten 3 strokes so far in
  // the matches you're playing."
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

  // ───────── Match-relative strokes (the strokes you actually receive in each match) ─────────
  //
  // The leaderboard reports net vs par using the strokes a player gets IN THE
  // MATCH, not the absolute course handicap allocation. A 9-hcp player in a
  // match where someone else is the low (say a 22) plays as scratch for that
  // match and receives 0 strokes — even on the hardest holes — because the
  // match's "scratch" floats with the field.
  //
  // For player-input formats (best_ball / singles / two_man_aggregate):
  //   diff = round(player.hcp - min(hcp in match))
  //   strokes(hole) = floor(diff / 18) + (diff % 18 >= holeSI ? 1 : 0)
  //
  // For team-input formats (scramble / alternate_shot):
  //   teamHcp = computeTeamHandicap(teammate hcps, fmt)
  //   diff   = round(|teamA.hcp - teamB.hcp|)
  //   higher = the team with the larger handicap; gets all the strokes
  //   Each teammate of the higher team gets the team's stroke per hole.
  //
  // strokesByMatchPlayerHole[matchId][playerId][holeNumber] = strokes
  const strokesByMatchPlayerHole = new Map<
    string,
    Map<string, Map<number, number>>
  >();
  const matchSizeById = new Map<string, number>();

  // Group participants by match for the stroke-allocation pass.
  const partsByMatchId = new Map<
    string,
    { tripMemberId: string; teamId: string; handicap: number }[]
  >();
  const memberById = new Map(membersList.map((m) => [m.id, m]));
  for (const p of relevantParticipants) {
    const member = memberById.get(p.tripMemberId);
    if (!member) continue;
    const handicap = member.tripHandicap
      ? Number(member.tripHandicap)
      : 18;
    const list = partsByMatchId.get(p.matchId) ?? [];
    list.push({ tripMemberId: p.tripMemberId, teamId: p.teamId, handicap });
    partsByMatchId.set(p.matchId, list);
  }
  for (const [matchId, list] of partsByMatchId) {
    matchSizeById.set(matchId, list.length);
  }

  for (const r of visibleMatches) {
    const matchId = r.match.id;
    const parts = partsByMatchId.get(matchId) ?? [];
    if (parts.length === 0) continue;
    const courseHolesMap = holesByCourse.get(r.round.courseId);
    if (!courseHolesMap) continue;
    const holesArr = Array.from(courseHolesMap.entries()).map(([n, v]) => ({
      holeNumber: n,
      handicapIndex: v.handicapIndex,
    }));
    const perPlayer = new Map<string, Map<number, number>>();

    if (TEAM_INPUT_FORMATS.has(r.match.format)) {
      // Team-input: team handicap per side, strokes go to higher-hcp team,
      // apply to every teammate on that team.
      const byTeam = new Map<string, typeof parts>();
      for (const p of parts) {
        const list = byTeam.get(p.teamId) ?? [];
        list.push(p);
        byTeam.set(p.teamId, list);
      }
      const teamsArr = Array.from(byTeam.entries());
      if (teamsArr.length === 2) {
        const teamHcps = teamsArr.map(([teamId, members]) => {
          let h: number;
          try {
            h = computeTeamHandicap(
              members.map((m) => m.handicap),
              r.match.format as TeamInputFormat,
            );
          } catch {
            // Misconfigured roster (wrong number of players for the format) —
            // fall back to 0 strokes rather than skewing the leaderboard.
            h = 0;
          }
          return { teamId, members, h };
        });
        const diff = Math.round(Math.abs(teamHcps[0].h - teamHcps[1].h));
        const higher =
          teamHcps[0].h > teamHcps[1].h ? teamHcps[0] : teamHcps[1];
        for (const t of teamHcps) {
          const isHigher = t.teamId === higher.teamId;
          for (const member of t.members) {
            const per = new Map<number, number>();
            for (const hole of holesArr) {
              if (!isHigher || diff === 0) {
                per.set(hole.holeNumber, 0);
                continue;
              }
              const base = Math.floor(diff / 18);
              const extra =
                diff % 18 >= hole.handicapIndex ? 1 : 0;
              per.set(hole.holeNumber, base + extra);
            }
            perPlayer.set(member.tripMemberId, per);
          }
        }
      }
    } else {
      // Player-input: diff vs the LOW handicap in this match's field.
      const minH = parts.reduce(
        (acc, p) => Math.min(acc, p.handicap),
        Infinity,
      );
      for (const p of parts) {
        const diff = Math.max(0, Math.round(p.handicap - minH));
        const per = new Map<number, number>();
        for (const hole of holesArr) {
          const base = Math.floor(diff / 18);
          const extra = diff % 18 >= hole.handicapIndex ? 1 : 0;
          per.set(hole.holeNumber, base + extra);
        }
        perPlayer.set(p.tripMemberId, per);
      }
    }

    strokesByMatchPlayerHole.set(matchId, perPlayer);
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

    // Strokes = the strokes this player would receive in THIS match (not
    // their absolute course handicap allocation). For team-input formats
    // the team's strokes are applied uniformly to every teammate's row.
    const strokes =
      strokesByMatchPlayerHole
        .get(s.matchId)
        ?.get(s.tripMemberId)
        ?.get(s.holeNumber) ?? 0;

    const net = s.gross - strokes;
    player.holesScored += 1;
    player.gross += s.gross;
    player.net += net;
    player.par += hole.par;
    player.strokesGiven += strokes;
    // Display is NET vs par — gross minus the match-relative strokes received.
    player.scoreVsPar = player.net - player.par;
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
