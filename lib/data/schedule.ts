import { eq, inArray, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  rounds,
  courses,
  teeTimes,
  matches,
  matchParticipants,
  tripMembers,
  teams,
  tripEvents,
} from '@/db/schema';

type Round = typeof rounds.$inferSelect;
type Course = typeof courses.$inferSelect;
type TeeTime = typeof teeTimes.$inferSelect;
type Match = typeof matches.$inferSelect;
type MatchParticipant = typeof matchParticipants.$inferSelect;
type TripMember = typeof tripMembers.$inferSelect;
type Team = typeof teams.$inferSelect;
type TripEvent = typeof tripEvents.$inferSelect;

export type ScheduleParticipant = MatchParticipant & {
  member: TripMember;
  team: Team;
};

export type ScheduleMatch = Match & {
  participants: ScheduleParticipant[];
};

export type GolfItem = {
  kind: 'golf';
  startTime: Date;
  teeTime: TeeTime;
  round: Round;
  course: Course;
  matches: ScheduleMatch[];
};

export type EventItem = {
  kind: 'event';
  startTime: Date;
  event: TripEvent;
};

export type TimelineItem = GolfItem | EventItem;

export type ScheduleDay = {
  date: string;       // YYYY-MM-DD in trip TZ
  dayLabel: string;   // "Wednesday"
  monthDay: string;   // "Aug 19"
  items: TimelineItem[];
};

const TRIP_TZ = 'America/New_York';

function dateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TRIP_TZ,
  }).format(d);
}

function dayLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: TRIP_TZ,
  }).format(d);
}

function monthDayLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: TRIP_TZ,
  }).format(d);
}

export async function getScheduleByDay(tripId: string): Promise<ScheduleDay[]> {
  const roundsList = await db
    .select({ round: rounds, course: courses })
    .from(rounds)
    .innerJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(rounds.tripId, tripId))
    .orderBy(asc(rounds.order));

  // Hidden rounds (test rounds) never appear on the schedule
  const visibleRounds = roundsList.filter((r) => !r.round.isHidden);

  const roundsById = new Map(visibleRounds.map((r) => [r.round.id, r]));
  const roundIds = visibleRounds.map((r) => r.round.id);

  const teeTimesList = roundIds.length
    ? await db
        .select()
        .from(teeTimes)
        .where(inArray(teeTimes.roundId, roundIds))
        .orderBy(asc(teeTimes.groupNumber))
    : [];

  const matchesList = roundIds.length
    ? await db
        .select()
        .from(matches)
        .where(inArray(matches.roundId, roundIds))
    : [];

  const matchIds = matchesList.map((m) => m.id);
  const participantsList = matchIds.length
    ? await db
        .select({
          participant: matchParticipants,
          member: tripMembers,
          team: teams,
        })
        .from(matchParticipants)
        .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
        .innerJoin(teams, eq(matchParticipants.teamId, teams.id))
        .where(inArray(matchParticipants.matchId, matchIds))
    : [];

  const participantsByMatch = new Map<string, ScheduleParticipant[]>();
  for (const p of participantsList) {
    const list = participantsByMatch.get(p.participant.matchId) ?? [];
    list.push({ ...p.participant, member: p.member, team: p.team });
    participantsByMatch.set(p.participant.matchId, list);
  }

  const matchesByTeeTime = new Map<string, ScheduleMatch[]>();
  for (const m of matchesList) {
    if (!m.teeTimeId) continue;
    const list = matchesByTeeTime.get(m.teeTimeId) ?? [];
    list.push({ ...m, participants: participantsByMatch.get(m.id) ?? [] });
    matchesByTeeTime.set(m.teeTimeId, list);
  }

  const golfItems: GolfItem[] = teeTimesList
    .filter((tt) => tt.time)
    .map((tt) => {
      const r = roundsById.get(tt.roundId)!;
      return {
        kind: 'golf' as const,
        startTime: tt.time!,
        teeTime: tt,
        round: r.round,
        course: r.course,
        matches: matchesByTeeTime.get(tt.id) ?? [],
      };
    });

  const eventsList = await db
    .select()
    .from(tripEvents)
    .where(eq(tripEvents.tripId, tripId))
    .orderBy(asc(tripEvents.startTime));

  const eventItems: EventItem[] = eventsList.map((e) => ({
    kind: 'event' as const,
    startTime: e.startTime,
    event: e,
  }));

  const all: TimelineItem[] = [...golfItems, ...eventItems];

  const byDate = new Map<string, TimelineItem[]>();
  for (const item of all) {
    const key = dateKey(item.startTime);
    const list = byDate.get(key) ?? [];
    list.push(item);
    byDate.set(key, list);
  }

  const days: ScheduleDay[] = [];
  for (const [date, items] of byDate.entries()) {
    items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const sample = items[0].startTime;
    days.push({
      date,
      dayLabel: dayLabel(sample),
      monthDay: monthDayLabel(sample),
      items,
    });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));

  return days;
}
