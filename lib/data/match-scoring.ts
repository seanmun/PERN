import { eq, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds,
  courses,
  courseHoles,
  teeTimes,
  tripMembers,
  teams,
  holeScores,
} from '@/db/schema';
import type { EngineHole, EnginePlayer, EngineScore } from '@/lib/scoring/engine';

type Match = typeof matches.$inferSelect;
type Round = typeof rounds.$inferSelect;
type Course = typeof courses.$inferSelect;
type TeeTime = typeof teeTimes.$inferSelect;
type TripMember = typeof tripMembers.$inferSelect;
type Team = typeof teams.$inferSelect;
type HoleScore = typeof holeScores.$inferSelect;
type CourseHole = typeof courseHoles.$inferSelect;

export type MatchScoringData = {
  match: Match;
  round: Round;
  course: Course;
  teeTime: TeeTime | null;
  courseHoles: CourseHole[];
  participants: { participant: TripMember; team: Team; side: 'A' | 'B' }[];
  scores: HoleScore[];
  engineHoles: EngineHole[];
  enginePlayers: EnginePlayer[];
  engineScores: EngineScore[];
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

  const scores = await db
    .select()
    .from(holeScores)
    .where(eq(holeScores.matchId, matchId));

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
    }));

  return {
    match: row.match,
    round: row.round,
    course: row.course,
    teeTime: row.teeTime,
    courseHoles: holes,
    participants,
    scores,
    engineHoles,
    enginePlayers,
    engineScores,
  };
}
