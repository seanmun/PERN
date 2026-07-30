import { eq, inArray, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  rounds,
  courses,
  teeTimes,
  teeTimeParticipants,
  matches,
  matchParticipants,
  tripMembers,
  teams,
  tripEvents,
  users,
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
  // Portrait fields from the linked user (null when the slot is unclaimed).
  // Used by the schedule's NBA-Jam matchup card with priority:
  // arcadePortraitUrl > member.avatarUrl > userAvatarUrl > monogram.
  arcadePortraitUrl: string | null;
  userAvatarUrl: string | null;
};

export type ScheduleMatch = Match & {
  participants: ScheduleParticipant[];
};

export type GolfRosterEntry = {
  tripMemberId: string;
  nickname: string;
  tripHandicap: string | null;
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
};

export type GolfItem = {
  kind: 'golf';
  startTime: Date;
  /** Who is IN this foursome (tee_time_participants), independent of
   *  which matches happen to be attached to it. A round-wide match is
   *  hosted by one group, but every group still has its own players and
   *  its own scorecard. */
  roster: GolfRosterEntry[];
  // The group has no tee time set yet — startTime is a sort-only stand-in
  // (round date at noon) and the UI shows "TBD" instead of a clock time.
  timeTbd: boolean;
  teeTime: TeeTime;
  round: Round;
  course: Course;
  matches: ScheduleMatch[];
};

export type EmptyRoundItem = {
  kind: 'empty_round';
  startTime: Date;            // synthetic — round.date if set, else epoch 0
  round: Round;
  course: Course;
};

export type EventItem = {
  kind: 'event';
  startTime: Date;
  event: TripEvent;
};

export type TimelineItem = GolfItem | EmptyRoundItem | EventItem;

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
          // leftJoin: unclaimed tripMembers have null userId, so this row
          // can be null even though the participant exists.
          arcadePortraitUrl: users.arcadePortraitUrl,
          userAvatarUrl: users.avatarUrl,
        })
        .from(matchParticipants)
        .innerJoin(tripMembers, eq(matchParticipants.tripMemberId, tripMembers.id))
        .innerJoin(teams, eq(matchParticipants.teamId, teams.id))
        .leftJoin(users, eq(tripMembers.userId, users.id))
        .where(inArray(matchParticipants.matchId, matchIds))
    : [];

  const participantsByMatch = new Map<string, ScheduleParticipant[]>();
  for (const p of participantsList) {
    const list = participantsByMatch.get(p.participant.matchId) ?? [];
    list.push({
      ...p.participant,
      member: p.member,
      team: p.team,
      arcadePortraitUrl: p.arcadePortraitUrl,
      userAvatarUrl: p.userAvatarUrl,
    });
    participantsByMatch.set(p.participant.matchId, list);
  }

  // Foursome rosters, used to place round-wide matches under the groups
  // their players are actually in.
  const rosterRows = teeTimesList.length
    ? await db
        .select()
        .from(teeTimeParticipants)
        .where(inArray(teeTimeParticipants.teeTimeId, teeTimesList.map((t) => t.id)))
    : [];
  const rosterByTee = new Map<string, Set<string>>();
  for (const r of rosterRows) {
    const set = rosterByTee.get(r.teeTimeId) ?? new Set<string>();
    set.add(r.tripMemberId);
    rosterByTee.set(r.teeTimeId, set);
  }

  // Member + team details for rendering each group's own player list.
  const allRosterIds = [...new Set(rosterRows.map((r) => r.tripMemberId))];
  const rosterMembers = allRosterIds.length
    ? await db
        .select({ member: tripMembers, team: teams })
        .from(tripMembers)
        .leftJoin(teams, eq(tripMembers.teamId, teams.id))
        .where(inArray(tripMembers.id, allRosterIds))
    : [];
  const memberDetail = new Map(
    rosterMembers.map((r) => [
      r.member.id,
      {
        tripMemberId: r.member.id,
        nickname: r.member.nickname,
        tripHandicap: r.member.tripHandicap,
        teamId: r.member.teamId,
        teamName: r.team?.name ?? null,
        teamColor: r.team?.color ?? null,
      },
    ]),
  );
  const rosterListByTee = new Map<string, GolfRosterEntry[]>();
  for (const r of rosterRows) {
    const d = memberDetail.get(r.tripMemberId);
    if (!d) continue;
    rosterListByTee.set(r.teeTimeId, [
      ...(rosterListByTee.get(r.teeTimeId) ?? []),
      d,
    ]);
  }

  const matchesByTeeTime = new Map<string, ScheduleMatch[]>();
  const pushToTee = (teeTimeId: string, sm: ScheduleMatch) => {
    const list = matchesByTeeTime.get(teeTimeId) ?? [];
    list.push(sm);
    matchesByTeeTime.set(teeTimeId, list);
  };
  for (const m of matchesList) {
    const sm: ScheduleMatch = {
      ...m,
      participants: participantsByMatch.get(m.id) ?? [],
    };
    if (m.teeTimeId) {
      pushToTee(m.teeTimeId, sm);
      continue;
    }
    // Round-wide match (sides span foursomes, tee_time_id null). Dropping
    // it made the schedule claim "MATCHUPS TBD" for a round that had a
    // saved match — but rendering it under every group holding one of
    // its players drew the SAME match once per foursome. It belongs to
    // the round, so it renders exactly once: under the first group that
    // holds any of its players (else the round's first group), never
    // duplicated.
    const memberIds = new Set(sm.participants.map((p) => p.tripMemberId));
    const roundTees = teeTimesList.filter((t) => t.roundId === m.roundId);
    const host =
      roundTees.find((t) => {
        const roster = rosterByTee.get(t.id);
        if (!roster) return false;
        for (const id of memberIds) if (roster.has(id)) return true;
        return false;
      }) ?? roundTees[0];
    if (host) pushToTee(host.id, sm);
  }

  // A group with no time still renders — as "Time TBD", sorted into its
  // round's day at noon (epoch when the round is undated too). Dropping
  // them made an event with groups-but-no-times look completely empty.
  const golfItems: GolfItem[] = teeTimesList.map((tt) => {
    const r = roundsById.get(tt.roundId)!;
    const fallback = r.round.date
      ? new Date(r.round.date.getTime() + 12 * 60 * 60 * 1000)
      : new Date(0);
    return {
      kind: 'golf' as const,
      startTime: tt.time ?? fallback,
      timeTbd: !tt.time,
      roster: (rosterListByTee.get(tt.id) ?? []).sort((a, b) =>
        a.nickname.localeCompare(b.nickname),
      ),
      teeTime: tt,
      round: r.round,
      course: r.course,
      matches: matchesByTeeTime.get(tt.id) ?? [],
    };
  });

  // Surface rounds that have been created but don't have any tee times yet,
  // otherwise an admin sees an empty schedule after creating a round.
  //
  // Timeless tee times render above as "Time TBD" golf items, so any
  // tee time at all means the round is not empty.
  const roundIdsWithTeeTimes = new Set(teeTimesList.map((tt) => tt.roundId));
  const emptyRoundItems: EmptyRoundItem[] = visibleRounds
    .filter((r) => !roundIdsWithTeeTimes.has(r.round.id))
    .map((r) => ({
      kind: 'empty_round' as const,
      // If the round has a date, pin to local noon so it sorts inside that day.
      // If not, pin to the unix epoch so it appears in a "no date yet" group.
      startTime: r.round.date
        ? new Date(r.round.date.getTime() + 12 * 60 * 60 * 1000)
        : new Date(0),
      round: r.round,
      course: r.course,
    }));

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

  const all: TimelineItem[] = [...golfItems, ...emptyRoundItems, ...eventItems];

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
