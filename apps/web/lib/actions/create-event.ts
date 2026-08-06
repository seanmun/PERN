'use server';

/**
 * Single-page event creation.
 *
 * The multi-step wizard (`/trips/new` -> course -> details -> setup/players
 * -> teams -> groups -> matches -> review) asked the admin for eight
 * screens' worth of input to set up one round of golf, and three of the
 * six bugs in docs/session-failures-2026-07.md were queued saves dying
 * when the user navigated between those steps.
 *
 * This is the replacement: the form holds everything client-side and
 * posts ONCE. There are no intermediate saves, so there is nothing for a
 * navigation to kill.
 *
 * The neon-http driver has no interactive transactions, so this is a
 * sequence rather than an atom. Writes are ordered so a mid-way failure
 * leaves a coherent, editable event rather than wreckage:
 *
 *   1. trip + teams + creator + round   (nothing exists if this fails)
 *   2. players
 *   3. groups (tee times) + rosters
 *   4. matches
 *
 * A failure after step 1 throws with the stage named and the trip's URL,
 * so the admin can finish by hand instead of being told "something went
 * wrong". It is never swallowed.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matchParticipants,
  matches,
  teeTimeParticipants,
  teeTimes,
  tripMembers,
  users,
} from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError } from '@/lib/auth/permissions';
import { searchPlatformUsers, type Buddy } from '@/lib/data/buddies';
import {
  isRoundFormat,
  provisionTrip,
  resolveUniqueTripSlug,
  type RoundFormat,
} from '@/lib/trip-provision';
import { deriveTripKind } from '@/lib/trip-kind';
import { tripWallTimeToDate } from '@/lib/trip-time';
import { FORMAT_META, type FormatId } from '@buddycup/scoring/formats';
import { FOURSOME_MAX } from '@buddycup/scoring/lineup';
import {
  validateBuilderState,
  type BuilderContext,
} from '@buddycup/scoring/validation/match-builder';

/**
 * Type-ahead for the setup form's Players section.
 *
 * The wizard's equivalent (`searchWizardPlayers`) requires a tripId to
 * check trip-admin against — but on this form no trip exists yet, so the
 * only meaningful gate is "are you signed in". Read-only, returns
 * platform users; the caller filters out anyone already on the roster.
 */
export async function searchPlayersForNewEvent(
  query: string,
): Promise<Buddy[]> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');
  return searchPlatformUsers(query, [], 12);
}

/**
 * What the form posts. Players have no ids yet — this action creates
 * them — so groups and matches address players by INDEX into `players`.
 */
export type EventFormPayload = {
  name: string;
  courseId: string;
  /** YYYY-MM-DD, or null for "date TBD". */
  date: string | null;
  teamA: { name: string; color: string };
  teamB: { name: string; color: string };
  players: {
    /** Existing platform user, when picked from search. */
    userId: string | null;
    email: string | null;
    nickname: string;
    /** Sent as a string — numeric handicaps are strings end to end. */
    handicap: string | null;
    /** 'A' or 'B'. */
    team: 'A' | 'B';
  }[];
  /** Foursomes, as arrays of player indices. */
  groups: number[][];
  matches: {
    format: FormatId;
    sideSize: number;
    sideA: number[];
    sideB: number[];
  }[];
};

/** Scoring mode each format actually resolves under. */
function scoringFor(format: FormatId): 'match_play' | 'stableford' | 'stroke' {
  // 30 Ball and BBB are resolved bespoke in recompute.ts before the
  // scoring field is consulted; the builder stores 'stroke' on them to
  // keep the UI honest, and this matches it.
  if (format === 'thirty_ball' || format === 'bingo_bango_bongo') {
    return 'stroke';
  }
  // Stroke play is "low total wins" — that IS the format, so it resolves
  // under stroke scoring. Storing match_play here made every Stroke Play
  // match fall through to computeMatch with its format coerced to
  // best_ball, so an 18-hole stroke match reported a hole-by-hole
  // closeout ("10 & 8") instead of a total. §7.2 is explicit that the
  // result SHAPE is the same for all formats; that doesn't mean they may
  // all be resolved by the same engine.
  if (format === 'stroke') {
    return 'stroke';
  }
  // Team-input formats (scramble, alternate shot) record one gross per
  // side; only match-play resolution is implemented for them.
  return 'match_play';
}

function fail(stage: string, slug: string | null, err: unknown): never {
  const detail = err instanceof Error ? err.message : String(err);
  if (slug) {
    throw new Error(
      `The event was created, but ${stage} failed: ${detail} — reopen /trips/${slug}/edit to finish it.`,
    );
  }
  throw new Error(`Could not create the event — ${stage} failed: ${detail}`);
}

export async function createEventFromForm(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const raw = String(formData.get('payload') ?? '');
  if (!raw) throw new Error('Missing form payload');

  let p: EventFormPayload;
  try {
    p = JSON.parse(raw) as EventFormPayload;
  } catch {
    throw new Error('Form payload was not valid JSON');
  }

  // ---- Validate the payload before writing anything --------------------
  const name = (p.name ?? '').trim();
  if (!name) throw new Error('Give the event a name.');
  if (!p.courseId) throw new Error('Pick a course.');
  if (!Array.isArray(p.players) || p.players.length === 0) {
    throw new Error('Add at least one player.');
  }

  const players = p.players.map((pl, i) => {
    const nickname = (pl.nickname ?? '').trim();
    if (!nickname) throw new Error(`Player ${i + 1} needs a name.`);
    const email = (pl.email ?? '').trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`"${email}" doesn't look like an email address.`);
    }
    return {
      userId: pl.userId || null,
      email,
      nickname,
      handicap: (pl.handicap ?? '').trim() || null,
      team: pl.team === 'B' ? ('B' as const) : ('A' as const),
    };
  });

  // Duplicate emails would create two members who then both try to claim
  // the same user. Reject up front rather than half-writing the roster.
  const seenEmail = new Set<string>();
  for (const pl of players) {
    if (!pl.email) continue;
    if (seenEmail.has(pl.email)) {
      throw new Error(`${pl.email} is listed twice.`);
    }
    seenEmail.add(pl.email);
  }

  const inRange = (i: unknown): i is number =>
    typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < players.length;

  const groups = Array.isArray(p.groups) ? p.groups : [];
  const seatedSomewhere = new Set<number>();
  for (const g of groups) {
    if (!Array.isArray(g)) throw new Error('Malformed group.');
    if (g.length > FOURSOME_MAX) {
      throw new Error(
        `A group holds at most ${FOURSOME_MAX} players — one has ${g.length}.`,
      );
    }
    for (const i of g) {
      if (!inRange(i)) throw new Error('A group references an unknown player.');
      if (seatedSomewhere.has(i)) {
        throw new Error(`${players[i].nickname} is in two groups.`);
      }
      seatedSomewhere.add(i);
    }
  }

  const wantedMatches = (Array.isArray(p.matches) ? p.matches : []).map((m) => {
    if (!FORMAT_META[m.format]) throw new Error(`Unknown game "${m.format}".`);
    if (!isRoundFormat(m.format)) {
      throw new Error(`"${m.format}" can't be saved as a round format yet.`);
    }
    const sideA = m.sideA ?? [];
    const sideB = m.sideB ?? [];
    for (const i of [...sideA, ...sideB]) {
      if (!inRange(i)) throw new Error('A matchup references an unknown player.');
    }
    if (sideA.length !== m.sideSize || sideB.length !== m.sideSize) {
      throw new Error(
        `A ${FORMAT_META[m.format].label} matchup has uneven sides.`,
      );
    }
    if (sideA.some((i) => sideB.includes(i))) {
      throw new Error('A player can’t be on both sides of a matchup.');
    }
    return { format: m.format as FormatId & RoundFormat, sideSize: m.sideSize, sideA, sideB };
  });

  const date = p.date ? tripWallTimeToDate(p.date) : null;
  if (date && Number.isNaN(date.getTime())) throw new Error('Invalid date.');

  // Kind is derived, never asked (§6.3). The rule lives in one place —
  // lib/trip-kind.ts — so this path and every later round/group change
  // agree on what the event is. provisionTrip creates round 1 below.
  const kind = deriveTripKind({ roundCount: 1, groupCount: groups.length });

  // The round's headline game is the first one picked; each match still
  // carries its own format.
  const roundFormat: RoundFormat | null =
    wantedMatches.length && isRoundFormat(wantedMatches[0].format)
      ? wantedMatches[0].format
      : null;

  // ---- 1. Trip, teams, creator, round ---------------------------------
  const slug = await resolveUniqueTripSlug(name, false);
  const provisioned = await provisionTrip({
    creator: {
      id: ctx.user.id,
      email: ctx.user.email,
      displayName: ctx.user.displayName,
      fullName: ctx.user.fullName,
    },
    name,
    kind,
    slug,
    startDate: date,
    endDate: date,
    description: null,
    imageUrl: null,
    teamA: { name: p.teamA?.name?.trim() || 'Team A', color: p.teamA?.color || '#16a34a' },
    teamB: { name: p.teamB?.name?.trim() || 'Team B', color: p.teamB?.color || '#eab308' },
    courseId: p.courseId,
    roundFormat,
  });

  const { tripId, teamAId, teamBId, roundId, creatorMemberId } = provisioned;
  const teamIdFor = (side: 'A' | 'B') => (side === 'A' ? teamAId : teamBId);

  // ---- 2. Players ------------------------------------------------------
  // provisionTrip already inserted the creator as trip_admin. If they also
  // appear in the roster, reuse that row instead of creating a second
  // member for the same person.
  const creatorEmail = ctx.user.email.toLowerCase();
  const memberIdByIndex: (string | null)[] = new Array(players.length).fill(null);

  try {
    for (let i = 0; i < players.length; i++) {
      const pl = players[i];
      const isCreator =
        (pl.userId && pl.userId === ctx.user.id) ||
        (pl.email && pl.email === creatorEmail);

      if (isCreator) {
        await db
          .update(tripMembers)
          .set({
            teamId: teamIdFor(pl.team),
            tripHandicap: pl.handicap,
            nickname: pl.nickname,
          })
          .where(eq(tripMembers.id, creatorMemberId));
        memberIdByIndex[i] = creatorMemberId;
        continue;
      }

      // §3.3 collision rule, mandatory at creation time: an address that
      // already belongs to a platform user attaches THAT user. Without
      // this, an admin typing a buddy's real email — the normal case —
      // produced a second, unclaimed identity for someone the app already
      // knew, reconciled only if and when that person next signed in.
      // Matched case-insensitively, like every other email comparison.
      let userId = pl.userId;
      if (!userId && pl.email) {
        const [byEmail] = await db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${pl.email}`)
          .limit(1);
        if (byEmail) userId = byEmail.id;
      }

      // Inherit avatar and handicap from a linked platform user so the row
      // looks claimed from the moment it exists.
      let avatarUrl: string | null = null;
      let handicap = pl.handicap;
      if (userId) {
        const [u] = await db
          .select({ avatarUrl: users.avatarUrl, handicap: users.handicap })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (u) {
          avatarUrl = u.avatarUrl;
          if (handicap == null) handicap = u.handicap;
        }
      }

      const [row] = await db
        .insert(tripMembers)
        .values({
          tripId,
          userId,
          email: pl.email,
          nickname: pl.nickname,
          avatarUrl,
          teamId: teamIdFor(pl.team),
          role: 'player',
          isCaptain: false,
          tripHandicap: handicap,
        })
        .returning();
      memberIdByIndex[i] = row.id;
    }
  } catch (err) {
    fail('adding the players', slug, err);
  }

  const memberId = (i: number): string => {
    const id = memberIdByIndex[i];
    if (!id) throw new Error('Internal: player was not created');
    return id;
  };

  // ---- 3. Groups (tee times) + rosters --------------------------------
  // No round means no course was resolved; skip the golf plumbing rather
  // than writing tee times that hang off nothing.
  const teeTimeIdByGroup: string[] = [];
  if (roundId && groups.length) {
    try {
      for (let g = 0; g < groups.length; g++) {
        // Time is null, not the event date. tee_times doubles as the
        // GROUP table (groupNumber lives on it), so a group has to exist
        // as a row even when nobody has set a tee time. The schedule
        // reads `timeTbd: !tt.time` — writing the date here put local
        // midnight in the column and every group rendered "12:00 AM"
        // instead of "TBD". This form never asks for a tee time.
        const [tt] = await db
          .insert(teeTimes)
          .values({ roundId, time: null, groupNumber: g + 1 })
          .returning();
        teeTimeIdByGroup.push(tt.id);
        const ids = groups[g].map(memberId);
        if (ids.length) {
          await db
            .insert(teeTimeParticipants)
            .values(ids.map((id) => ({ teeTimeId: tt.id, tripMemberId: id })));
        }
      }
    } catch (err) {
      fail('creating the groups', slug, err);
    }
  }

  // ---- 4. Matches ------------------------------------------------------
  // Validated with the SAME function the match builder and
  // createMatchFromBuilder use, so this path can't write a lineup the
  // rest of the app considers illegal.
  if (roundId && wantedMatches.length) {
    const memberTeamById = new Map<string, string>();
    players.forEach((pl, i) => memberTeamById.set(memberId(i), teamIdFor(pl.team)));
    const memberTeeTimeById = new Map<string, string | null>();
    players.forEach((_, i) => memberTeeTimeById.set(memberId(i), null));
    groups.forEach((g, gi) =>
      g.forEach((i) => memberTeeTimeById.set(memberId(i), teeTimeIdByGroup[gi] ?? null)),
    );
    const builderCtx: BuilderContext = { memberTeamById, memberTeeTimeById };

    try {
      for (const m of wantedMatches) {
        const sideAPlayerIds = m.sideA.map(memberId);
        const sideBPlayerIds = m.sideB.map(memberId);

        const v = validateBuilderState(
          {
            format: m.format,
            sideSize: m.sideSize,
            sideATeamId: teamAId,
            sideBTeamId: teamBId,
            sideAPlayerIds,
            sideBPlayerIds,
          },
          builderCtx,
        );
        if (!v.ok) {
          throw new Error(
            `${FORMAT_META[m.format].label}: ${v.errors.join('; ')}`,
          );
        }

        // A match belongs to a tee time only when everyone in it rides
        // there. Sides spread across groups (30 Ball) leave it null and
        // the schedule hosts it under one group — see lib/data/schedule.ts.
        const teeIds = new Set(
          [...sideAPlayerIds, ...sideBPlayerIds].map((id) =>
            memberTeeTimeById.get(id) ?? null,
          ),
        );
        const teeTimeId = teeIds.size === 1 ? [...teeIds][0] : null;

        const [match] = await db
          .insert(matches)
          .values({
            roundId,
            teeTimeId,
            format: m.format,
            templateSizeA: m.sideSize,
            templateSizeB: m.sideSize,
            scoring: scoringFor(m.format),
            handicapMethod: 'group_low',
            pointsOverall: 1,
            pointsFront9: 0,
            pointsBack9: 0,
          })
          .returning();

        await db.insert(matchParticipants).values([
          ...sideAPlayerIds.map((id) => ({
            matchId: match.id,
            tripMemberId: id,
            teamId: teamAId,
          })),
          ...sideBPlayerIds.map((id) => ({
            matchId: match.id,
            tripMemberId: id,
            teamId: teamBId,
          })),
        ]);
      }
    } catch (err) {
      fail('creating the matchups', slug, err);
    }
  }

  revalidatePath('/home');
  revalidatePath(`/trips/${slug}`, 'layout');
  redirect(`/trips/${slug}/schedule`);
}
