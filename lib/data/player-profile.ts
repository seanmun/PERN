import { eq, inArray, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  tripMembers,
  teams,
  matches,
  matchParticipants,
  rounds,
  courses,
  teeTimes,
} from '@/db/schema';

type TripMember = typeof tripMembers.$inferSelect;
type Team = typeof teams.$inferSelect;
type Match = typeof matches.$inferSelect;
type Round = typeof rounds.$inferSelect;
type Course = typeof courses.$inferSelect;
type TeeTime = typeof teeTimes.$inferSelect;

export type ProfileMatchParticipant = {
  tripMemberId: string;
  nickname: string;
  tripHandicap: string | null;
  avatarUrl: string | null;
  teamId: string;
  teamName: string;
  teamColor: string | null;
};

export type ProfileMatch = {
  match: Match;
  round: Round;
  course: Course;
  teeTime: TeeTime | null;
  participants: ProfileMatchParticipant[];
};

export type PlayerProfile = {
  member: TripMember;
  team: Team | null;
  matches: ProfileMatch[];
};

export async function getPlayerProfile(
  tripMemberId: string
): Promise<PlayerProfile | null> {
  const [member] = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.id, tripMemberId))
    .limit(1);
  if (!member) return null;

  let team: Team | null = null;
  if (member.teamId) {
    const [t] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, member.teamId))
      .limit(1);
    team = t ?? null;
  }

  const playerMatches = await db
    .select({
      match: matches,
      round: rounds,
      course: courses,
      teeTime: teeTimes,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .leftJoin(teeTimes, eq(matches.teeTimeId, teeTimes.id))
    .where(eq(matchParticipants.tripMemberId, tripMemberId))
    .orderBy(asc(rounds.order));

  const matchIds = playerMatches.map((m) => m.match.id);

  const allParticipants = matchIds.length
    ? await db
        .select({
          participant: matchParticipants,
          member: tripMembers,
          team: teams,
        })
        .from(matchParticipants)
        .innerJoin(
          tripMembers,
          eq(matchParticipants.tripMemberId, tripMembers.id)
        )
        .innerJoin(teams, eq(matchParticipants.teamId, teams.id))
        .where(inArray(matchParticipants.matchId, matchIds))
    : [];

  const participantsByMatch = new Map<string, ProfileMatchParticipant[]>();
  for (const row of allParticipants) {
    const list = participantsByMatch.get(row.participant.matchId) ?? [];
    list.push({
      tripMemberId: row.participant.tripMemberId,
      nickname: row.member.nickname,
      tripHandicap: row.member.tripHandicap,
      avatarUrl: row.member.avatarUrl,
      teamId: row.team.id,
      teamName: row.team.name,
      teamColor: row.team.color,
    });
    participantsByMatch.set(row.participant.matchId, list);
  }

  return {
    member,
    team,
    matches: playerMatches.map((pm) => ({
      match: pm.match,
      round: pm.round,
      course: pm.course,
      teeTime: pm.teeTime,
      participants: participantsByMatch.get(pm.match.id) ?? [],
    })),
  };
}
