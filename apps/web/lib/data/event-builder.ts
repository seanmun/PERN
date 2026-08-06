/**
 * Read side of the event builder (§6).
 *
 * Two loaders, both feeding the same component: the course library every
 * round-builder picks from, and — in edit mode — the event as builder
 * state.
 *
 * The edit loader reports the lineup that IS IN THE DATABASE rather than
 * one derived from the roster. The builder posts that lineup straight back
 * unless the admin changes something, so opening the page cannot rewrite
 * an event that was built by hand (Pinehurst's, most of all).
 *
 * It also reports where hole scores exist, because that is what freezes a
 * lineup under §2. The rule is enforced in `saveEvent`; this is what lets
 * the screen show the lock instead of walking the admin into the
 * rejection.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  courseFavorites,
  courseTees,
  courses,
  holeScores,
  matchParticipants,
  matches,
  rounds,
  teams,
  teeTimeParticipants,
  teeTimes,
  tripMembers,
  trips,
} from '@/db/schema';
import { tripWallDay } from '@/lib/trip-time';
import type { CourseRow } from '@/components/event-builder/CoursePicker';
import type { HandicapMethod, LoadedEvent } from '@/components/event-builder/state';
import type { FormatId } from '@buddycup/scoring/formats';

// ───────────────────────── Courses ─────────────────────────

/**
 * The course library, ranked for one person: favourites, then courses
 * they have played, then everything else. Tees ride along because the
 * round's tee choice carries the slope and rating the handicap pipeline
 * allocates from (§4.2).
 */
export async function loadBuilderCourses(userId: string): Promise<CourseRow[]> {
  const [list, favorites, playedRows, tees] = await Promise.all([
    db.select().from(courses).orderBy(asc(courses.name)),
    db
      .select({ courseId: courseFavorites.courseId })
      .from(courseFavorites)
      .where(eq(courseFavorites.userId, userId)),
    db
      .selectDistinct({ courseId: rounds.courseId })
      .from(rounds)
      .innerJoin(tripMembers, eq(tripMembers.tripId, rounds.tripId))
      .where(eq(tripMembers.userId, userId)),
    db.select().from(courseTees).orderBy(asc(courseTees.displayOrder)),
  ]);

  const favoriteIds = new Set(favorites.map((f) => f.courseId));
  const playedIds = new Set(playedRows.map((p) => p.courseId));
  const teesByCourse = new Map<string, CourseRow['tees']>();
  for (const t of tees) {
    const bucket = teesByCourse.get(t.courseId) ?? [];
    bucket.push({ id: t.id, name: t.name, slope: t.slope, rating: t.rating });
    teesByCourse.set(t.courseId, bucket);
  }

  return list
    .map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      isFavorite: favoriteIds.has(c.id),
      played: playedIds.has(c.id),
      tees: teesByCourse.get(c.id) ?? [],
    }))
    .sort((a, b) => {
      const rank = (r: typeof a) => (r.isFavorite ? 0 : r.played ? 1 : 2);
      const byRank = rank(a) - rank(b);
      return byRank !== 0 ? byRank : a.name.localeCompare(b.name);
    });
}

// ───────────────────────── The event ─────────────────────────

/**
 * Load one event as builder state. Returns null when the slug does not
 * exist or the event predates the two-team model the builder assumes —
 * the caller turns that into a 404 rather than rendering a form that
 * cannot be saved.
 */
export async function loadEventForBuilder(
  slug: string,
): Promise<LoadedEvent | null> {
  const [trip] = await db.select().from(trips).where(eq(trips.slug, slug)).limit(1);
  if (!trip) return null;

  const teamRows = await db.select().from(teams).where(eq(teams.tripId, trip.id));
  // `saveEvent` addresses the two teams positionally, exactly as it finds
  // them; match that ordering here so side A on screen is side A on write.
  const [teamA, teamB] = teamRows;
  if (!teamA || !teamB) return null;

  const memberRows = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, trip.id));

  const roundRows = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tripId, trip.id), eq(rounds.isHidden, false)))
    .orderBy(asc(rounds.order));
  const roundIds = roundRows.map((r) => r.id);

  const matchRows = roundIds.length
    ? await db.select().from(matches).where(inArray(matches.roundId, roundIds))
    : [];
  const matchIds = matchRows.map((m) => m.id);

  const [participantRows, teeTimeRows, scoreRows] = await Promise.all([
    matchIds.length
      ? db
          .select()
          .from(matchParticipants)
          .where(inArray(matchParticipants.matchId, matchIds))
      : Promise.resolve([]),
    roundIds.length
      ? db
          .select()
          .from(teeTimes)
          .where(inArray(teeTimes.roundId, roundIds))
          .orderBy(asc(teeTimes.groupNumber))
      : Promise.resolve([]),
    matchIds.length
      ? db
          .select({
            matchId: holeScores.matchId,
            tripMemberId: holeScores.tripMemberId,
          })
          .from(holeScores)
          .where(inArray(holeScores.matchId, matchIds))
      : Promise.resolve([]),
  ]);

  const teeTimeIds = teeTimeRows.map((t) => t.id);
  const teeParticipantRows = teeTimeIds.length
    ? await db
        .select()
        .from(teeTimeParticipants)
        .where(inArray(teeTimeParticipants.teeTimeId, teeTimeIds))
    : [];

  // §2 — where scores exist, the lineup is frozen.
  const roundIdByMatch = new Map(matchRows.map((m) => [m.id, m.roundId]));
  const scoredRounds = new Set<string>();
  const scoredMembers = new Set<string>();
  for (const s of scoreRows) {
    const rid = roundIdByMatch.get(s.matchId);
    if (rid) scoredRounds.add(rid);
    scoredMembers.add(s.tripMemberId);
  }

  // Who is on the roster is a question about PLAYING, not about role.
  // Filtering to `role === 'player'` dropped Pinehurst's three captains
  // and platform admins — who play — out of the roster, and with them out
  // of every matchup they were in; opening the edit page and pressing
  // Save would then have rewritten three rounds of the flagship trip.
  //
  // Two rules, and both are needed:
  //   · anyone holding a team, or seated anywhere in a lineup, PLAYS
  //   · every `role = 'player'` row is listed regardless, because
  //     `saveEvent` deletes player rows that a payload omits, and a
  //     roster that quietly forgets someone must never be a delete
  // A viewer or an organiser who sits out has no team and no seat, so
  // they are correctly absent — and their non-player role means
  // `saveEvent` leaves their membership alone.
  const seatedMemberIds = new Set<string>([
    ...teeParticipantRows.map((p) => p.tripMemberId),
    ...participantRows.map((p) => p.tripMemberId),
  ]);
  const players = memberRows
    .filter((m) => m.role === 'player' || !!m.teamId || seatedMemberIds.has(m.id))
    .map((m) => ({
      memberId: m.id,
      userId: m.userId,
      email: m.email,
      nickname: m.nickname,
      handicap: m.tripHandicap ?? '',
      team: (m.teamId === teamB.id ? 'B' : 'A') as 'A' | 'B',
      hasScores: scoredMembers.has(m.id),
    }));

  const rosterIds = new Set(players.map((p) => p.memberId));

  return {
    tripId: trip.id,
    slug: trip.slug,
    name: trip.name,
    startDate: trip.startDate ? tripWallDay(trip.startDate) : '',
    endDate: trip.endDate ? tripWallDay(trip.endDate) : '',
    handicapMethod: trip.defaultHandicapMethod as HandicapMethod,
    teamA: { name: teamA.name, color: teamA.color ?? '#16a34a' },
    teamB: { name: teamB.name, color: teamB.color ?? '#eab308' },
    players,
    rounds: roundRows.map((r) => {
      const groups = teeTimeRows
        .filter((t) => t.roundId === r.id)
        .map((t) =>
          teeParticipantRows
            .filter((p) => p.teeTimeId === t.id && rosterIds.has(p.tripMemberId))
            .map((p) => p.tripMemberId),
        );

      const roundMatches = matchRows
        .filter((m) => m.roundId === r.id)
        .map((m) => {
          const sideA = participantRows
            .filter((p) => p.matchId === m.id && p.teamId === teamA.id)
            .map((p) => p.tripMemberId);
          const sideB = participantRows
            .filter((p) => p.matchId === m.id && p.teamId === teamB.id)
            .map((p) => p.tripMemberId);
          return {
            format: m.format as FormatId,
            // Template sizes can disagree with reality on rows written
            // before the builder existed; the participants are the fact.
            sideSize: Math.max(sideA.length, sideB.length),
            sideA,
            sideB,
          };
        });

      return {
        roundId: r.id,
        courseId: r.courseId,
        courseTeeId: r.courseTeeId,
        date: r.date ? tripWallDay(r.date) : '',
        label: r.label ?? '',
        countsTowardCup: r.countsTowardCup,
        // The round's own rule is not stored separately yet — matches
        // carry it, and they all carry the same one. Reading it back from
        // the first match keeps a round-level override round-tripping
        // instead of silently reverting to the trip default on every save.
        handicapMethod:
          (matchRows.find((m) => m.roundId === r.id)?.handicapMethod as
            | HandicapMethod
            | undefined) ?? null,
        locked: scoredRounds.has(r.id),
        groups,
        matches: roundMatches,
      };
    }),
  };
}
