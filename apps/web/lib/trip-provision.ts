/**
 * Trip provisioning — the shared core behind both event-creation paths.
 *
 * `createTrip` (the multi-step wizard) and `createEventFromForm` (the
 * single-page setup form) both need to do exactly the same thing: pick a
 * free slug, insert the trip, its two teams, the creator as trip_admin,
 * and — for single-day kinds — round 1 on the chosen course.
 *
 * It lives here rather than being written twice because "the same rule
 * implemented in two places, and only one of them gets fixed" is the
 * single most common defect in this codebase's history. See
 * docs/session-failures-2026-07.md.
 *
 * Not a server action — a plain module called BY server actions, so it
 * can return ids instead of redirecting.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  courses,
  roundFormatEnum,
  rounds,
  teams,
  tripMembers,
  trips,
  users,
} from '@/db/schema';
import { slugifyTripName } from '@/lib/slug';

export type TripKind = 'trip' | 'outing' | 'match';

/** Slugs that would collide with our route structure or reserved paths. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'new',
  'edit',
  'admin',
  'api',
  'me',
  'join',
  'sign-in',
  'sign-up',
  'privacy',
  'brand',
]);

export type RoundFormat = (typeof roundFormatEnum.enumValues)[number];

export function isRoundFormat(v: string | null): v is RoundFormat {
  return !!v && (roundFormatEnum.enumValues as readonly string[]).includes(v);
}

/**
 * Resolve a free slug.
 *
 * A slug the user explicitly typed hard-fails on collision — they chose
 * that URL and silently changing it is worse than an error. A slug
 * derived from the event name auto-suffixes instead: "Saturday at Pine
 * Hills" must never error because someone used that name last month,
 * over a URL the user was never asked about.
 */
export async function resolveUniqueTripSlug(
  slugInput: string,
  customized: boolean,
): Promise<string> {
  const base = slugifyTripName(slugInput);
  if (!base) throw new Error('Slug is required');
  if (RESERVED_SLUGS.has(base)) {
    throw new Error(`Slug "${base}" is reserved. Pick a different one.`);
  }

  const taken = async (s: string) => {
    const [row] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.slug, s))
      .limit(1);
    return Boolean(row);
  };

  if (!(await taken(base))) return base;
  if (customized) throw new Error(`Slug "${base}" is already taken.`);

  let n = 2;
  while (n < 100 && (await taken(`${base}-${n}`))) n++;
  if (n >= 100) throw new Error(`Slug "${base}" is already taken.`);
  return `${base}-${n}`;
}

export type ProvisionTripInput = {
  creator: {
    id: string;
    email: string;
    displayName: string | null;
    fullName: string | null;
  };
  name: string;
  kind: TripKind;
  slug: string;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  imageUrl: string | null;
  teamA: { name: string; color: string };
  teamB: { name: string; color: string };
  /** Single-day kinds front-load their course; round 1 is created on it. */
  courseId?: string | null;
  roundFormat?: RoundFormat | null;
};

export type ProvisionedTrip = {
  tripId: string;
  slug: string;
  teamAId: string;
  teamBId: string;
  /** Null when no course was supplied (trips add rounds later). */
  roundId: string | null;
  /** The creator's own tripMembers row. */
  creatorMemberId: string;
};

/**
 * Insert the trip and everything it can't exist without. Returns the ids
 * so callers can keep building (players, groups, matches) without
 * re-querying what they just wrote.
 */
export async function provisionTrip(
  input: ProvisionTripInput,
): Promise<ProvisionedTrip> {
  const [trip] = await db
    .insert(trips)
    .values({
      slug: input.slug,
      name: input.name,
      kind: input.kind,
      startDate: input.startDate,
      endDate: input.endDate,
      description: input.description,
      imageUrl: input.imageUrl,
      createdBy: input.creator.id,
    })
    .returning();

  const insertedTeams = await db
    .insert(teams)
    .values([
      { tripId: trip.id, name: input.teamA.name, color: input.teamA.color },
      { tripId: trip.id, name: input.teamB.name, color: input.teamB.color },
    ])
    .returning();

  const creatorEmail = input.creator.email.toLowerCase();
  const creatorNickname =
    input.creator.displayName ??
    input.creator.fullName ??
    creatorEmail.split('@')[0];

  const [creatorMember] = await db
    .insert(tripMembers)
    .values({
      tripId: trip.id,
      userId: input.creator.id,
      email: creatorEmail,
      nickname: creatorNickname,
      role: 'trip_admin',
      isCaptain: false,
    })
    .returning();

  await db
    .update(users)
    .set({ defaultTripId: trip.id, updatedAt: new Date() })
    .where(eq(users.id, input.creator.id));

  // Round 1 on the chosen course. A bad or missing courseId simply skips
  // it — the admin can add the round later — but the format is never
  // guessed: hardcoding one here is what made every downstream screen
  // (groups, matches) infer the wrong game.
  let roundId: string | null = null;
  if (input.courseId) {
    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .limit(1);
    if (course) {
      const [round] = await db
        .insert(rounds)
        .values({
          tripId: trip.id,
          courseId: course.id,
          format: input.roundFormat ?? 'best_ball',
          date: input.startDate,
          order: 1,
        })
        .returning();
      roundId = round.id;
    }
  }

  return {
    tripId: trip.id,
    slug: trip.slug,
    teamAId: insertedTeams[0].id,
    teamBId: insertedTeams[1].id,
    roundId,
    creatorMemberId: creatorMember.id,
  };
}
