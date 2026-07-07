import { eq, asc, and, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds,
  courses,
  courseHoles,
  courseTees,
  courseTeeYardages,
  teeTimes,
  tripMembers,
  teams,
  holeScores,
  users,
} from '@/db/schema';
import {
  computeTeamHandicap,
  type EngineHole,
  type EnginePlayer,
  type EngineScore,
  type EngineTeam,
  type EngineTeamScore,
  type TeamInputFormat,
} from '@buddycup/scoring/engine';

const TEAM_INPUT_FORMATS: ReadonlySet<string> = new Set<TeamInputFormat>([
  'scramble',
  'alternate_shot',
]);

type Match = typeof matches.$inferSelect;
type Round = typeof rounds.$inferSelect;
type Course = typeof courses.$inferSelect;
type TeeTime = typeof teeTimes.$inferSelect;
type TripMember = typeof tripMembers.$inferSelect;
type Team = typeof teams.$inferSelect;
type HoleScore = typeof holeScores.$inferSelect & {
  // Display name of the user who entered this score. Resolved server-side
  // via tripMembers.nickname for users on this trip; falls back to the
  // global user.firstName when scored by someone outside the trip
  // (a platform admin, for instance). Null only when enteredBy was null.
  enteredByLabel: string | null;
};
type CourseHole = typeof courseHoles.$inferSelect;
type CourseTee = typeof courseTees.$inferSelect;

export type MatchScoringData = {
  match: Match;
  round: Round;
  course: Course;
  teeTime: TeeTime | null;
  // The tee the round plays from. Picked explicitly on the round, or the
  // course's default if no override is set. Null only when the course has
  // no tees at all (legacy single-tee imports).
  tee: CourseTee | null;
  // courseHoles' yardage is overridden with the selected tee's yardages so
  // callers don't have to think about default vs override.
  courseHoles: CourseHole[];
  participants: { participant: TripMember; team: Team; side: 'A' | 'B' }[];
  scores: HoleScore[];
  // Whether this format is scored player-by-player (best_ball, singles,
  // aggregate, stroke) or team-by-team (scramble, alt shot). The score-entry
  // UI branches on this; the engine has separate functions per mode.
  inputMode: 'player' | 'team';
  engineHoles: EngineHole[];
  enginePlayers: EnginePlayer[];
  engineScores: EngineScore[];
  // Populated only when inputMode === 'team'. Length 2 (one per side).
  engineTeams: EngineTeam[] | null;
  engineTeamScores: EngineTeamScore[] | null;
};

export async function getMatchScoringData(
  matchId: string
): Promise<MatchScoringData | null> {
  const [row] = await db
    .select({
      match: matches,
      round: rounds,
      course: courses,
      teeTime: teeTimes,
    })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .leftJoin(teeTimes, eq(matches.teeTimeId, teeTimes.id))
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!row) return null;

  const holes = await db
    .select()
    .from(courseHoles)
    .where(eq(courseHoles.courseId, row.course.id))
    .orderBy(asc(courseHoles.holeNumber));

  // Pick the tee the round plays from: explicit round.courseTeeId, else the
  // course's default tee. Null only if the course was imported without tees.
  let tee: CourseTee | null = null;
  if (row.round.courseTeeId) {
    const [t] = await db
      .select()
      .from(courseTees)
      .where(eq(courseTees.id, row.round.courseTeeId))
      .limit(1);
    tee = t ?? null;
  }
  if (!tee) {
    const [t] = await db
      .select()
      .from(courseTees)
      .where(
        and(
          eq(courseTees.courseId, row.course.id),
          eq(courseTees.isDefault, true),
        ),
      )
      .limit(1);
    tee = t ?? null;
  }

  // Override courseHoles.yardage with the selected tee's per-hole yardages
  // so every caller — score entry, leaderboard, schedule — sees the right
  // numbers without each having to look up the tee separately.
  const overriddenHoles: CourseHole[] = await (async () => {
    if (!tee) return holes;
    const yardageRows = await db
      .select()
      .from(courseTeeYardages)
      .where(eq(courseTeeYardages.courseTeeId, tee.id));
    const yByHole = new Map(yardageRows.map((r) => [r.holeNumber, r.yardage]));
    return holes.map((h) => ({
      ...h,
      yardage: yByHole.get(h.holeNumber) ?? h.yardage,
    }));
  })();

  const partRows = await db
    .select({
      participant: matchParticipants,
      member: tripMembers,
      team: teams,
    })
    .from(matchParticipants)
    .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
    .innerJoin(teams, eq(matchParticipants.teamId, teams.id))
    .where(eq(matchParticipants.matchId, matchId));

  // Assign "A" / "B" labels: the team with the lowest UUID becomes "A".
  // Stable and arbitrary — only used to keep two sides distinct in the engine.
  const distinctTeams = Array.from(
    new Map(partRows.map((p) => [p.team.id, p.team])).values()
  ).sort((a, b) => (a.id < b.id ? -1 : 1));

  const sideByTeam = new Map<string, 'A' | 'B'>();
  if (distinctTeams[0]) sideByTeam.set(distinctTeams[0].id, 'A');
  if (distinctTeams[1]) sideByTeam.set(distinctTeams[1].id, 'B');

  const participants = partRows.map((p) => ({
    participant: p.member,
    team: p.team,
    side: sideByTeam.get(p.team.id) ?? 'A',
  }));

  const rawScores = await db
    .select()
    .from(holeScores)
    .where(eq(holeScores.matchId, matchId));

  // Resolve enteredBy (a users.id) to a display name. Prefer the
  // tripMembers.nickname scoped to this trip; fall back to users.firstName
  // (or email if that's also missing) for users not on the trip.
  const entererIds = Array.from(
    new Set(rawScores.map((s) => s.enteredBy).filter((id): id is string => !!id)),
  );
  const labelByUserId = new Map<string, string>();
  if (entererIds.length) {
    const memberLabels = await db
      .select({ userId: tripMembers.userId, nickname: tripMembers.nickname })
      .from(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, row.round.tripId),
          inArray(tripMembers.userId, entererIds),
        ),
      );
    for (const m of memberLabels) {
      if (m.userId) labelByUserId.set(m.userId, m.nickname);
    }
    const missing = entererIds.filter((id) => !labelByUserId.has(id));
    if (missing.length) {
      const userRows = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          fullName: users.fullName,
          email: users.email,
        })
        .from(users)
        .where(inArray(users.id, missing));
      for (const u of userRows) {
        const label =
          u.displayName ?? u.fullName ?? u.email.split('@')[0] ?? 'Unknown';
        labelByUserId.set(u.id, label);
      }
    }
  }

  const scores: HoleScore[] = rawScores.map((s) => ({
    ...s,
    enteredByLabel: s.enteredBy ? labelByUserId.get(s.enteredBy) ?? null : null,
  }));

  const engineHoles: EngineHole[] = holes.map((h) => ({
    number: h.holeNumber,
    par: h.par,
    handicapIndex: h.handicapIndex,
  }));

  const enginePlayers: EnginePlayer[] = participants.map((p) => ({
    id: p.participant.id,
    handicap: p.participant.tripHandicap
      ? Number(p.participant.tripHandicap)
      : 18, // default to mid-handicap when missing so the engine still runs
    teamSide: p.side,
  }));

  const engineScores: EngineScore[] = scores
    .filter((s) => s.gross != null)
    .map((s) => ({
      playerId: s.tripMemberId,
      holeNumber: s.holeNumber,
      gross: s.gross!,
      counted: s.counted,
    }));

  // Team-input formats: collapse participants into 2 virtual "team players"
  // with a USGA-formula handicap and a single gross per hole (read from any
  // one teammate — they're written identically by the team-score action).
  const inputMode: 'player' | 'team' = TEAM_INPUT_FORMATS.has(row.match.format)
    ? 'team'
    : 'player';

  let engineTeams: EngineTeam[] | null = null;
  let engineTeamScores: EngineTeamScore[] | null = null;

  if (inputMode === 'team') {
    const fmt = row.match.format as TeamInputFormat;
    engineTeams = distinctTeams
      .map((team): EngineTeam | null => {
        const side = sideByTeam.get(team.id);
        if (!side) return null;
        const teammates = participants.filter((p) => p.team.id === team.id);
        // Defensive: team formats require exactly 2 per side. If misconfigured,
        // fall back so the engine can still produce SOMETHING instead of
        // throwing — the score-entry UI also blocks this state up-front.
        const handicaps = teammates.map((p) =>
          p.participant.tripHandicap ? Number(p.participant.tripHandicap) : 18,
        );
        const handicap =
          handicaps.length === 2
            ? computeTeamHandicap(handicaps, fmt)
            : handicaps[0] ?? 18;
        return { id: team.id, side, handicap };
      })
      .filter((t): t is EngineTeam => t !== null);

    // The score-entry action writes the team's gross to all teammates' rows.
    // We dedupe by (teamId, holeNumber) here so the engine gets exactly one
    // gross per team per hole, even if a teammate's row is missing.
    const teamScoreMap = new Map<string, EngineTeamScore>();
    for (const s of scores) {
      if (s.gross == null) continue;
      const participant = participants.find(
        (p) => p.participant.id === s.tripMemberId,
      );
      if (!participant) continue;
      const key = `${participant.team.id}:${s.holeNumber}`;
      if (teamScoreMap.has(key)) continue;
      teamScoreMap.set(key, {
        teamId: participant.team.id,
        holeNumber: s.holeNumber,
        gross: s.gross,
      });
    }
    engineTeamScores = Array.from(teamScoreMap.values());
  }

  return {
    match: row.match,
    round: row.round,
    course: row.course,
    teeTime: row.teeTime,
    tee,
    courseHoles: overriddenHoles,
    participants,
    scores,
    inputMode,
    engineHoles,
    enginePlayers,
    engineScores,
    engineTeams,
    engineTeamScores,
  };
}
