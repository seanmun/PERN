/**
 * Harness fixtures — teardown, actors, courses, and the drivers that push
 * a payload through the real server actions and read the result back out
 * of Postgres.
 *
 * Everything the harness creates is namespaced so teardown is total and
 * re-running is safe:
 *   trips.name    starts with __HARNESS__
 *   courses.name  starts with __HARNESS__
 *   users.email   ends with @buddycup.test
 *
 * Courses are created directly rather than through an action on purpose:
 * §4.1 makes course facts immutable foundation inputs, so they are a
 * fixture, not part of the setup path under test. Every trip, member,
 * group, match and score below goes through the real action.
 */

import { eq, inArray, like } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  courseHoles,
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
  users,
} from '@/db/schema';
import { createEventFromForm, type EventFormPayload } from '@/lib/actions/create-event';
import { deriveLineup } from '@buddycup/scoring/lineup';
import type { FormatId } from '@buddycup/scoring/formats';
import { captureRedirect, revalidatedPaths, runAs, type HarnessActor } from './core';

export const TRIP_PREFIX = '__HARNESS__';
export const COURSE_PREFIX = '__HARNESS__';
export const EMAIL_DOMAIN = 'buddycup.test';

// ───────────────────────── Teardown ─────────────────────────

/**
 * Remove every artefact of a previous run.
 *
 * The tree is walked explicitly rather than leaning on the trip cascade:
 * `match_participants.team_id` and `hole_scores.entered_by` have no
 * cascade, so dropping the trip first dies pulling teams and users out
 * from under rows that still reference them.
 */
export async function teardown(): Promise<void> {
  const old = await db
    .select({ id: trips.id })
    .from(trips)
    .where(like(trips.name, `${TRIP_PREFIX}%`));
  const tripIds = old.map((t) => t.id);

  if (tripIds.length) {
    const matchRows = await db
      .select({ id: matches.id })
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(inArray(rounds.tripId, tripIds));
    const matchIds = matchRows.map((m) => m.id);
    if (matchIds.length) {
      // bbb_hole_points cascades off matches; hole_scores and
      // match_participants do not carry a safe order on their own.
      await db.delete(holeScores).where(inArray(holeScores.matchId, matchIds));
      await db
        .delete(matchParticipants)
        .where(inArray(matchParticipants.matchId, matchIds));
      await db.delete(matches).where(inArray(matches.id, matchIds));
    }

    const ttRows = await db
      .select({ id: teeTimes.id })
      .from(teeTimes)
      .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
      .where(inArray(rounds.tripId, tripIds));
    const ttIds = ttRows.map((t) => t.id);
    if (ttIds.length) {
      await db
        .delete(teeTimeParticipants)
        .where(inArray(teeTimeParticipants.teeTimeId, ttIds));
      await db.delete(teeTimes).where(inArray(teeTimes.id, ttIds));
    }

    await db.delete(trips).where(inArray(trips.id, tripIds));
  }

  // Courses are global; rounds referencing them are gone with the trips.
  await db.delete(courses).where(like(courses.name, `${COURSE_PREFIX}%`));

  // Harness users last — trips.created_by has no cascade.
  await db.delete(users).where(like(users.email, `%@${EMAIL_DOMAIN}`));
}

// ───────────────────────── Actors ─────────────────────────

let actorSeq = 0;

/**
 * A person who has signed in. No `users` row is created here — the first
 * action this actor runs goes through the real `getGlobalAuthContext()`,
 * which is what creates the row, backfills the username, and lazily
 * claims any ghost membership matching the address (§3.3).
 */
export function actor(handle: string, opts: {
  fullName?: string;
  extraEmails?: string[];
} = {}): HarnessActor {
  actorSeq++;
  return {
    clerkId: `harness_clerk_${handle}_${actorSeq}`,
    email: `${handle}.${actorSeq}@${EMAIL_DOMAIN}`,
    fullName: opts.fullName ?? `Harness ${handle}`,
    imageUrl: null,
    extraEmails: opts.extraEmails,
  };
}

/** An address for a player who has NOT signed in — a ghost's email. */
export function ghostEmail(handle: string): string {
  actorSeq++;
  return `${handle}.${actorSeq}@${EMAIL_DOMAIN}`;
}

/** Turn a ghost's email into a signed-in actor holding that address. */
export function actorFor(email: string, fullName = 'Harness Claimer'): HarnessActor {
  actorSeq++;
  return {
    clerkId: `harness_clerk_claim_${actorSeq}`,
    email,
    fullName,
    imageUrl: null,
  };
}

// ───────────────────────── Course fixture ─────────────────────────

export type CourseFixture = { courseId: string; par: number };

/**
 * 18 holes, par 4, stroke indexes 1–18, plus a default tee at slope 113 /
 * rating 72. Scratch slope and rating mean the §4.2 stage-1 allocator
 * runs for real while still handing back a predictable stroke count.
 */
export async function makeCourse(label: string): Promise<CourseFixture> {
  const [course] = await db
    .insert(courses)
    .values({ name: `${COURSE_PREFIX}${label}`, location: 'Harness, USA' })
    .returning();

  await db.insert(courseHoles).values(
    Array.from({ length: 18 }, (_, i) => ({
      courseId: course.id,
      holeNumber: i + 1,
      par: 4,
      yardage: 400,
      handicapIndex: i + 1,
    })),
  );

  await db.insert(courseTees).values({
    courseId: course.id,
    name: 'Harness',
    displayOrder: 1,
    slope: 113,
    rating: '72.0',
    isDefault: true,
  });

  return { courseId: course.id, par: 72 };
}

// ───────────────────────── Payload building ─────────────────────────

export type RosterEntry = {
  nickname: string;
  team: 'A' | 'B';
  handicap: string;
  email?: string | null;
  userId?: string | null;
};

/**
 * Build the payload the §6.1 round-builder posts.
 *
 * Groups and matchups are NOT hand-written: they come out of
 * `deriveLineup`, the same pure function the form uses to answer "what"
 * → teams/foursomes/matchups. Players have no ids before submit, so the
 * derivation runs on their payload indices — exactly what the client
 * does.
 */
export function buildPayload(input: {
  name: string;
  courseId: string;
  date?: string | null;
  roster: RosterEntry[];
  formats: FormatId[];
}): { payload: EventFormPayload; notes: string[]; governing: FormatId | null } {
  const lineup = deriveLineup({
    players: input.roster.map((p, i) => ({
      id: String(i),
      handicap: Number(p.handicap),
      teamId: p.team,
    })),
    formats: input.formats,
    teamAId: 'A',
    teamBId: 'B',
    respectExistingTeams: true,
  });

  const idx = (s: string) => Number(s);

  return {
    payload: {
      name: `${TRIP_PREFIX}${input.name}`,
      courseId: input.courseId,
      date: input.date === undefined ? '2026-08-20' : input.date,
      teamA: { name: 'MachIans', color: '#16a34a' },
      teamB: { name: 'Douchebags', color: '#eab308' },
      players: input.roster.map((p) => ({
        userId: p.userId ?? null,
        email: p.email ?? null,
        nickname: p.nickname,
        handicap: p.handicap,
        team: p.team,
      })),
      groups: lineup.groups.map((g) => g.map(idx)),
      matches: lineup.matches.map((m) => ({
        format: m.format,
        sideSize: m.sideSize,
        sideA: m.sideAPlayerIds.map(idx),
        sideB: m.sideBPlayerIds.map(idx),
      })),
    },
    notes: lineup.notes,
    governing: lineup.governingFormat,
  };
}

// ───────────────────────── The create driver ─────────────────────────

export type CreateResult = {
  slug: string;
  redirect: string;
  revalidated: string[];
};

/**
 * Push a payload through `createEventFromForm` — the real action, with
 * real validation, real write ordering, real permissions. Success is a
 * redirect to the new event's schedule; anything else throws.
 */
export async function createEvent(
  who: HarnessActor,
  payload: EventFormPayload,
): Promise<CreateResult> {
  const fd = new FormData();
  fd.set('payload', JSON.stringify(payload));

  return runAs(who, async () => {
    const redirect = await captureRedirect(() => createEventFromForm(fd));
    const revalidated = revalidatedPaths();
    if (!redirect) {
      throw new Error('createEventFromForm returned without redirecting');
    }
    const m = /^\/trips\/([^/]+)\/schedule$/.exec(redirect);
    if (!m) {
      throw new Error(`unexpected redirect target: ${redirect}`);
    }
    return { slug: m[1], redirect, revalidated };
  });
}

/** Same call, but the caller expects it to blow up. Returns the error. */
export async function createEventExpectingFailure(
  who: HarnessActor,
  payload: EventFormPayload,
): Promise<Error> {
  const fd = new FormData();
  fd.set('payload', JSON.stringify(payload));
  return runAs(who, async () => {
    try {
      await createEventFromForm(fd);
    } catch (err) {
      if (err instanceof Error && err.name === 'HarnessRedirect') {
        throw new Error('expected a failure, but the action succeeded');
      }
      return err instanceof Error ? err : new Error(String(err));
    }
    throw new Error('expected a failure, but the action returned normally');
  });
}

// ───────────────────────── Readback ─────────────────────────

export type LoadedEvent = {
  trip: typeof trips.$inferSelect;
  teams: (typeof teams.$inferSelect)[];
  members: (typeof tripMembers.$inferSelect)[];
  rounds: (typeof rounds.$inferSelect)[];
  groups: { teeTime: typeof teeTimes.$inferSelect; memberIds: string[] }[];
  matches: {
    match: typeof matches.$inferSelect;
    participants: (typeof matchParticipants.$inferSelect)[];
  }[];
  /** Roster lookup by the nickname the payload used. */
  byNickname: Map<string, typeof tripMembers.$inferSelect>;
};

/** Read the whole event back out of Postgres, no caching in between. */
export async function loadEvent(slug: string): Promise<LoadedEvent> {
  const [trip] = await db.select().from(trips).where(eq(trips.slug, slug)).limit(1);
  if (!trip) throw new Error(`no trip with slug ${slug}`);

  const teamRows = await db.select().from(teams).where(eq(teams.tripId, trip.id));
  const memberRows = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, trip.id));
  const roundRows = await db.select().from(rounds).where(eq(rounds.tripId, trip.id));
  const roundIds = roundRows.map((r) => r.id);

  const ttRows = roundIds.length
    ? await db.select().from(teeTimes).where(inArray(teeTimes.roundId, roundIds))
    : [];
  const ttpRows = ttRows.length
    ? await db
        .select()
        .from(teeTimeParticipants)
        .where(
          inArray(
            teeTimeParticipants.teeTimeId,
            ttRows.map((t) => t.id),
          ),
        )
    : [];

  const matchRows = roundIds.length
    ? await db.select().from(matches).where(inArray(matches.roundId, roundIds))
    : [];
  const mpRows = matchRows.length
    ? await db
        .select()
        .from(matchParticipants)
        .where(
          inArray(
            matchParticipants.matchId,
            matchRows.map((m) => m.id),
          ),
        )
    : [];

  return {
    trip,
    teams: teamRows,
    members: memberRows,
    rounds: roundRows,
    groups: ttRows
      .slice()
      .sort((a, b) => a.groupNumber - b.groupNumber)
      .map((tt) => ({
        teeTime: tt,
        memberIds: ttpRows
          .filter((p) => p.teeTimeId === tt.id)
          .map((p) => p.tripMemberId),
      })),
    matches: matchRows.map((m) => ({
      match: m,
      participants: mpRows.filter((p) => p.matchId === m.id),
    })),
    byNickname: new Map(memberRows.map((m) => [m.nickname, m])),
  };
}

/** Re-read one match after a score write. */
export async function reloadMatch(
  matchId: string,
): Promise<typeof matches.$inferSelect> {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!m) throw new Error(`no match ${matchId}`);
  return m;
}
