'use server';

/**
 * The one write path for event setup (§6.3).
 *
 * `createEventFromForm` handled a single round at create time. This
 * handles the whole of §6: the round-builder atom repeated 1..N times, in
 * CREATE and EDIT mode, through one action and one payload. There is no
 * second form and no per-step save — the client holds everything and
 * posts once, which is what makes "queued save died on navigation"
 * structurally impossible rather than merely fixed.
 *
 * Write order, so a mid-sequence failure leaves an editable event rather
 * than wreckage (the Neon HTTP driver has no interactive transactions):
 *
 *   1. trip + teams + creator          (nothing exists if this fails)
 *   2. players
 *   3. per round: round -> groups -> matches
 *
 * Every failure after step 1 names its stage and hands back the event's
 * URL. Incompleteness is derived, never stored: an event with zero
 * matches renders a "finish setup" state. No status column.
 *
 * ── The layering rule (§2) in edit mode ──────────────────────────────
 *
 * Scores are foundation. Groups and matchups are a layer on top, and a
 * layer may never mutate the foundation it derives from. So a round that
 * already has hole scores has its LINEUP frozen: course, date, label and
 * cup flag stay editable, but changing who plays whom would silently
 * reinterpret strokes already entered. The action rejects that and names
 * the round rather than resolving it on the player's behalf.
 *
 * Removing a player or a round that carries scores is refused for the
 * same reason.
 */

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
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
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import {
  isRoundFormat,
  provisionTrip,
  resolveUniqueTripSlug,
  type RoundFormat,
} from '@/lib/trip-provision';
import { deriveTripKind, syncTripKind } from '@/lib/trip-kind';
import { tripWallTimeToDate } from '@/lib/trip-time';
import { FORMAT_META, type FormatId } from '@buddycup/scoring/formats';
import { FOURSOME_MAX } from '@buddycup/scoring/lineup';
import {
  validateBuilderState,
  type BuilderContext,
} from '@buddycup/scoring/validation/match-builder';

type HandicapMethod = 'group_low' | 'match_low' | 'course';

/** A player on the roster. Asked once, above the rounds (§6.2). */
export type BuilderPlayer = {
  /** Existing trip_members row, in edit mode. Null = create it. */
  memberId: string | null;
  userId: string | null;
  email: string | null;
  nickname: string;
  /** Numeric handicaps are strings end to end — never parseFloat casually. */
  handicap: string | null;
  team: 'A' | 'B';
};

/**
 * One round. Groups and matches address players by INDEX into the
 * payload's `players`, because on create they have no ids yet.
 *
 * A round with no matches is a SHELL — a first-class state (§6.2), not an
 * error. Pinehurst's captains-pick round depends on it.
 */
export type BuilderRound = {
  /** Existing rounds row, in edit mode. Null = create it. */
  roundId: string | null;
  courseId: string;
  courseTeeId: string | null;
  /** YYYY-MM-DD, or null for "date TBD". */
  date: string | null;
  label: string | null;
  countsTowardCup: boolean;
  /** Null inherits the trip default (§4.3). */
  handicapMethod: HandicapMethod | null;
  groups: number[][];
  matches: {
    format: FormatId;
    sideSize: number;
    sideA: number[];
    sideB: number[];
  }[];
};

export type EventBuilderPayload = {
  /** Null = create. Set = edit that trip. */
  tripId: string | null;
  name: string;
  startDate: string | null;
  endDate: string | null;
  teamA: { name: string; color: string };
  teamB: { name: string; color: string };
  /** Trip-level default; rounds inherit unless they override (§4.3). */
  handicapMethod: HandicapMethod;
  players: BuilderPlayer[];
  rounds: BuilderRound[];
};

const HANDICAP_METHODS: ReadonlySet<string> = new Set([
  'group_low',
  'match_low',
  'course',
]);

const DEFAULT_TEAM_A = { name: 'Team A', color: '#16a34a' };
const DEFAULT_TEAM_B = { name: 'Team B', color: '#eab308' };

/** Scoring mode each format actually resolves under. */
function scoringFor(format: FormatId): 'match_play' | 'stableford' | 'stroke' {
  // 30 Ball and BBB resolve bespoke in recompute.ts before `scoring` is
  // consulted; the builder stores 'stroke' to keep the record honest.
  if (format === 'thirty_ball' || format === 'bingo_bango_bongo') return 'stroke';
  // Stroke play is "low total wins" — that IS the format (§7.1).
  if (format === 'stroke') return 'stroke';
  // Team-input formats record one gross per side; match-play only.
  return 'match_play';
}

function fail(stage: string, slug: string | null, err: unknown): never {
  const detail = err instanceof Error ? err.message : String(err);
  if (slug) {
    throw new Error(
      `Saved what it could, but ${stage} failed: ${detail} — reopen /trips/${slug}/edit to finish it.`,
    );
  }
  throw new Error(`Could not save the event — ${stage} failed: ${detail}`);
}

// ───────────────────────── Payload validation ─────────────────────────

type CleanPlayer = {
  memberId: string | null;
  userId: string | null;
  email: string | null;
  nickname: string;
  handicap: string | null;
  team: 'A' | 'B';
};

type CleanRound = {
  roundId: string | null;
  courseId: string;
  courseTeeId: string | null;
  date: Date | null;
  label: string | null;
  countsTowardCup: boolean;
  handicapMethod: HandicapMethod | null;
  groups: number[][];
  matches: {
    format: FormatId & RoundFormat;
    sideSize: number;
    sideA: number[];
    sideB: number[];
  }[];
  /** The round's headline game — null for a shell. */
  formatForRound: RoundFormat | null;
};

type Clean = {
  name: string;
  players: CleanPlayer[];
  rounds: CleanRound[];
  startDate: Date | null;
  endDate: Date | null;
  handicapMethod: HandicapMethod;
  teamA: { name: string; color: string };
  teamB: { name: string; color: string };
};

function parseDay(s: string | null): Date | null {
  if (!s) return null;
  const d = tripWallTimeToDate(s);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date.');
  return d;
}

/**
 * Validate the ENTIRE payload before a single row is written — the same
 * rules the client used to grey out Save, so a hand-crafted request
 * cannot get past them.
 */
function validatePayload(p: EventBuilderPayload): Clean {
  const name = (p.name ?? '').trim();
  if (!name) throw new Error('Give the event a name.');

  if (!Array.isArray(p.players) || p.players.length === 0) {
    throw new Error('Add at least one player.');
  }
  if (!Array.isArray(p.rounds) || p.rounds.length === 0) {
    throw new Error('An event needs at least one round.');
  }

  const players: CleanPlayer[] = p.players.map((pl, i) => {
    const nickname = (pl.nickname ?? '').trim();
    if (!nickname) throw new Error(`Player ${i + 1} needs a name.`);
    const email = (pl.email ?? '').trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`"${email}" doesn't look like an email address.`);
    }
    return {
      memberId: pl.memberId || null,
      userId: pl.userId || null,
      email,
      nickname,
      handicap: (pl.handicap ?? '').trim() || null,
      team: pl.team === 'B' ? 'B' : 'A',
    };
  });

  // Two members racing to claim the same user is not recoverable later.
  const seenEmail = new Set<string>();
  for (const pl of players) {
    if (!pl.email) continue;
    if (seenEmail.has(pl.email)) throw new Error(`${pl.email} is listed twice.`);
    seenEmail.add(pl.email);
  }

  const inRange = (i: unknown): i is number =>
    typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < players.length;

  const cleanRounds: CleanRound[] = p.rounds.map((r, ri) => {
    const where = p.rounds.length > 1 ? `Round ${ri + 1}` : 'The round';
    if (!r.courseId) throw new Error(`${where} needs a course.`);

    const groups = Array.isArray(r.groups) ? r.groups : [];
    const seated = new Set<number>();
    for (const g of groups) {
      if (!Array.isArray(g)) throw new Error(`${where} has a malformed group.`);
      if (g.length > FOURSOME_MAX) {
        throw new Error(
          `${where}: a group holds at most ${FOURSOME_MAX} players — one has ${g.length}.`,
        );
      }
      for (const i of g) {
        if (!inRange(i)) throw new Error(`${where} references an unknown player.`);
        if (seated.has(i)) {
          throw new Error(`${where}: ${players[i].nickname} is in two groups.`);
        }
        seated.add(i);
      }
    }

    const wanted = (Array.isArray(r.matches) ? r.matches : []).map((m) => {
      if (!FORMAT_META[m.format]) throw new Error(`Unknown game "${m.format}".`);
      if (!isRoundFormat(m.format)) {
        throw new Error(`"${m.format}" can't be saved as a round format yet.`);
      }
      const sideA = m.sideA ?? [];
      const sideB = m.sideB ?? [];
      for (const i of [...sideA, ...sideB]) {
        if (!inRange(i)) {
          throw new Error(`${where} has a matchup with an unknown player.`);
        }
      }
      if (sideA.length !== m.sideSize || sideB.length !== m.sideSize) {
        throw new Error(
          `${where}: a ${FORMAT_META[m.format].label} matchup has uneven sides.`,
        );
      }
      if (sideA.some((i) => sideB.includes(i))) {
        throw new Error(`${where}: a player can’t be on both sides of a matchup.`);
      }
      return {
        format: m.format as FormatId & RoundFormat,
        sideSize: m.sideSize,
        sideA,
        sideB,
      };
    });

    if (r.handicapMethod != null && !HANDICAP_METHODS.has(r.handicapMethod)) {
      throw new Error(`${where} has an unknown handicap rule.`);
    }

    return {
      roundId: r.roundId || null,
      courseId: r.courseId,
      courseTeeId: r.courseTeeId || null,
      date: parseDay(r.date),
      label: (r.label ?? '').trim() || null,
      countsTowardCup: r.countsTowardCup !== false,
      handicapMethod: r.handicapMethod ?? null,
      groups,
      matches: wanted,
      formatForRound: wanted.length ? wanted[0].format : null,
    };
  });

  return {
    name,
    players,
    rounds: cleanRounds,
    startDate: parseDay(p.startDate),
    endDate: parseDay(p.endDate),
    handicapMethod: HANDICAP_METHODS.has(p.handicapMethod)
      ? p.handicapMethod
      : 'group_low',
    teamA: {
      name: p.teamA?.name?.trim() || DEFAULT_TEAM_A.name,
      color: p.teamA?.color || DEFAULT_TEAM_A.color,
    },
    teamB: {
      name: p.teamB?.name?.trim() || DEFAULT_TEAM_B.name,
      color: p.teamB?.color || DEFAULT_TEAM_B.color,
    },
  };
}

// ───────────────────────── Shared round writer ─────────────────────────

/**
 * Write one round's groups and matches. Used identically on create and on
 * edit, so the two paths cannot drift — the single most common defect in
 * this codebase's history is one rule implemented twice.
 *
 * A shell round (no matches) still gets its groups, and that is the whole
 * point: course and tee times now, matchups later, through this same
 * builder.
 */
async function writeRoundLineup(args: {
  roundId: string;
  round: CleanRound;
  memberIdAt: (index: number) => string;
  teamAId: string;
  teamBId: string;
  teamOfIndex: (index: number) => 'A' | 'B';
  playerCount: number;
  defaultHandicapMethod: HandicapMethod;
}): Promise<void> {
  const {
    roundId,
    round,
    memberIdAt,
    teamAId,
    teamBId,
    teamOfIndex,
    playerCount,
  } = args;

  // ---- Groups (tee times) ---------------------------------------------
  // `time` stays null, not the event date. tee_times doubles as the GROUP
  // table, so a group must exist as a row even with no tee time set; the
  // schedule reads `timeTbd: !tt.time`, and writing the date here made
  // every group render "12:00 AM" instead of "TBD".
  const teeTimeIdByGroup: string[] = [];
  for (let g = 0; g < round.groups.length; g++) {
    const [tt] = await db
      .insert(teeTimes)
      .values({ roundId, time: null, groupNumber: g + 1 })
      .returning();
    teeTimeIdByGroup.push(tt.id);
    const ids = round.groups[g].map(memberIdAt);
    if (ids.length) {
      await db
        .insert(teeTimeParticipants)
        .values(ids.map((id) => ({ teeTimeId: tt.id, tripMemberId: id })));
    }
  }

  if (!round.matches.length) return;

  // ---- Matches ---------------------------------------------------------
  // Validated with the SAME function the builder used to grey out illegal
  // states, so this path cannot write a lineup the rest of the app
  // considers illegal.
  const memberTeamById = new Map<string, string>();
  const memberTeeTimeById = new Map<string, string | null>();
  for (let i = 0; i < playerCount; i++) {
    const id = memberIdAt(i);
    memberTeamById.set(id, teamOfIndex(i) === 'A' ? teamAId : teamBId);
    memberTeeTimeById.set(id, null);
  }
  round.groups.forEach((g, gi) =>
    g.forEach((i) => memberTeeTimeById.set(memberIdAt(i), teeTimeIdByGroup[gi] ?? null)),
  );
  const builderCtx: BuilderContext = { memberTeamById, memberTeeTimeById };

  const handicapMethod = round.handicapMethod ?? args.defaultHandicapMethod;

  for (const m of round.matches) {
    const sideAPlayerIds = m.sideA.map(memberIdAt);
    const sideBPlayerIds = m.sideB.map(memberIdAt);

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
      throw new Error(`${FORMAT_META[m.format].label}: ${v.errors.join('; ')}`);
    }

    // A match belongs to a tee time only when everyone in it rides there.
    // Sides spread across groups (30 Ball) leave it null and the schedule
    // hosts it under one group — see lib/data/schedule.ts.
    const teeIds = new Set(
      [...sideAPlayerIds, ...sideBPlayerIds].map(
        (id) => memberTeeTimeById.get(id) ?? null,
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
        handicapMethod,
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
}

/**
 * Resolve a roster entry to a member id, creating the row when it has no
 * id yet.
 *
 * §3.3's collision rule is mandatory here: an address that already
 * belongs to a platform user attaches THAT user rather than minting a
 * second, unclaimed identity for someone the app already knows.
 */
async function upsertMember(args: {
  tripId: string;
  player: CleanPlayer;
  teamId: string;
}): Promise<string> {
  const { tripId, player, teamId } = args;

  let userId = player.userId;
  if (!userId && player.email) {
    const [byEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${player.email}`)
      .limit(1);
    if (byEmail) userId = byEmail.id;
  }

  if (player.memberId) {
    await db
      .update(tripMembers)
      .set({
        nickname: player.nickname,
        email: player.email,
        tripHandicap: player.handicap,
        teamId,
        ...(userId ? { userId } : {}),
      })
      .where(eq(tripMembers.id, player.memberId));
    return player.memberId;
  }

  // Inherit avatar and handicap from a linked platform user so the row
  // looks claimed from the moment it exists.
  let avatarUrl: string | null = null;
  let handicap = player.handicap;
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
      email: player.email,
      nickname: player.nickname,
      avatarUrl,
      teamId,
      role: 'player',
      isCaptain: false,
      tripHandicap: handicap,
    })
    .returning();
  return row.id;
}

// ───────────────────────── Create ─────────────────────────

async function createNew(ctx: AuthCtx, clean: Clean): Promise<{ slug: string }> {
  // Kind is derived, never asked (§6.3).
  const kind = deriveTripKind({
    roundCount: clean.rounds.length,
    groupCount: clean.rounds[0]?.groups.length ?? 0,
  });

  // ---- 1. Trip, teams, creator ----------------------------------------
  const slug = await resolveUniqueTripSlug(clean.name, false);
  const provisioned = await provisionTrip({
    creator: {
      id: ctx.user.id,
      email: ctx.user.email,
      displayName: ctx.user.displayName,
      fullName: ctx.user.fullName,
    },
    name: clean.name,
    kind,
    slug,
    startDate: clean.startDate,
    endDate: clean.endDate,
    description: null,
    imageUrl: null,
    teamA: clean.teamA,
    teamB: clean.teamB,
    // Rounds are written below, uniformly, so create and edit share one
    // code path. provisionTrip's own round shortcut is deliberately unused.
    courseId: null,
    roundFormat: null,
  });

  const { tripId, teamAId, teamBId, creatorMemberId } = provisioned;
  const teamIdFor = (side: 'A' | 'B') => (side === 'A' ? teamAId : teamBId);

  await db
    .update(trips)
    .set({ defaultHandicapMethod: clean.handicapMethod })
    .where(eq(trips.id, tripId));

  // ---- 2. Players ------------------------------------------------------
  // provisionTrip already inserted the creator as trip_admin. If they also
  // appear on the roster, reuse that row rather than creating a second
  // member for the same person.
  const creatorEmail = ctx.user.email.toLowerCase();
  const memberIdByIndex: (string | null)[] = new Array(clean.players.length).fill(null);

  try {
    for (let i = 0; i < clean.players.length; i++) {
      const pl = clean.players[i];
      const isCreator =
        (pl.userId && pl.userId === ctx.user.id) ||
        (pl.email && pl.email === creatorEmail);

      memberIdByIndex[i] = await upsertMember({
        tripId,
        player: isCreator ? { ...pl, memberId: creatorMemberId } : pl,
        teamId: teamIdFor(pl.team),
      });
    }
  } catch (err) {
    fail('adding the players', slug, err);
  }

  const memberIdAt = (i: number): string => {
    const id = memberIdByIndex[i];
    if (!id) throw new Error('Internal: player was not created');
    return id;
  };

  // ---- 3. Rounds -------------------------------------------------------
  for (let ri = 0; ri < clean.rounds.length; ri++) {
    const r = clean.rounds[ri];
    try {
      const [round] = await db
        .insert(rounds)
        .values({
          tripId,
          courseId: r.courseId,
          courseTeeId: r.courseTeeId,
          // A shell has no game yet; best_ball satisfies NOT NULL and is
          // never read while the round holds no matches.
          format: r.formatForRound ?? 'best_ball',
          date: r.date ?? clean.startDate,
          order: ri + 1,
          label: r.label,
          countsTowardCup: r.countsTowardCup,
        })
        .returning();

      await writeRoundLineup({
        roundId: round.id,
        round: r,
        memberIdAt,
        teamAId,
        teamBId,
        teamOfIndex: (i) => clean.players[i].team,
        playerCount: clean.players.length,
        defaultHandicapMethod: clean.handicapMethod,
      });
    } catch (err) {
      fail(
        clean.rounds.length > 1 ? `building round ${ri + 1}` : 'building the round',
        slug,
        err,
      );
    }
  }

  await syncTripKind(tripId);
  revalidatePath('/home');
  revalidatePath(`/trips/${slug}`, 'layout');
  return { slug };
}

// ───────────────────────── Edit ─────────────────────────

/** Canonical signature of a round's lineup, for change detection. */
function lineupSignature(
  groups: string[][],
  matchRows: { format: string; sideA: string[]; sideB: string[] }[],
): string {
  const g = groups
    .map((x) => [...x].sort().join(','))
    .sort()
    .join('|');
  const m = matchRows
    .map(
      (x) =>
        `${x.format}:${[...x.sideA].sort().join(',')}:${[...x.sideB].sort().join(',')}`,
    )
    .sort()
    .join('|');
  return `${g}#${m}`;
}

async function updateExisting(
  ctx: AuthCtx,
  tripId: string,
  clean: Clean,
): Promise<{ slug: string }> {
  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new Error('Event not found');
  const slug = trip.slug;

  const existingTeams = await db.select().from(teams).where(eq(teams.tripId, tripId));
  const [teamARow, teamBRow] = existingTeams;
  if (!teamARow || !teamBRow) {
    throw new Error('This event is missing its teams — it cannot be edited here.');
  }
  const teamAId = teamARow.id;
  const teamBId = teamBRow.id;
  const teamIdFor = (side: 'A' | 'B') => (side === 'A' ? teamAId : teamBId);

  const existingMembers = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  const existingRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tripId, tripId));
  const existingRoundIds = existingRounds.map((r) => r.id);

  const existingMatches = existingRoundIds.length
    ? await db.select().from(matches).where(inArray(matches.roundId, existingRoundIds))
    : [];
  const existingMatchIds = existingMatches.map((m) => m.id);
  const existingParticipants = existingMatchIds.length
    ? await db
        .select()
        .from(matchParticipants)
        .where(inArray(matchParticipants.matchId, existingMatchIds))
    : [];

  // Which rounds carry scores? That is what freezes a lineup (§2).
  const scoredRoundIds = new Set<string>();
  const scoredMemberIds = new Set<string>();
  if (existingMatchIds.length) {
    const scoreRows = await db
      .select({
        matchId: holeScores.matchId,
        tripMemberId: holeScores.tripMemberId,
      })
      .from(holeScores)
      .where(inArray(holeScores.matchId, existingMatchIds));
    const roundIdByMatch = new Map(existingMatches.map((m) => [m.id, m.roundId]));
    for (const s of scoreRows) {
      const rid = roundIdByMatch.get(s.matchId);
      if (rid) scoredRoundIds.add(rid);
      scoredMemberIds.add(s.tripMemberId);
    }
  }

  // ---- 1. Trip header --------------------------------------------------
  await db
    .update(trips)
    .set({
      name: clean.name,
      startDate: clean.startDate,
      endDate: clean.endDate,
      defaultHandicapMethod: clean.handicapMethod,
    })
    .where(eq(trips.id, tripId));
  await db
    .update(teams)
    .set({ name: clean.teamA.name, color: clean.teamA.color })
    .where(eq(teams.id, teamAId));
  await db
    .update(teams)
    .set({ name: clean.teamB.name, color: clean.teamB.color })
    .where(eq(teams.id, teamBId));

  // ---- 2. Players ------------------------------------------------------
  const memberIdByIndex: (string | null)[] = new Array(clean.players.length).fill(null);
  const keptMemberIds = new Set<string>();
  try {
    for (let i = 0; i < clean.players.length; i++) {
      const pl = clean.players[i];
      const id = await upsertMember({
        tripId,
        player: pl,
        teamId: teamIdFor(pl.team),
      });
      memberIdByIndex[i] = id;
      keptMemberIds.add(id);
    }
  } catch (err) {
    fail('saving the players', slug, err);
  }

  const memberIdAt = (i: number): string => {
    const id = memberIdByIndex[i];
    if (!id) throw new Error('Internal: player was not saved');
    return id;
  };

  // Members dropped from the roster. Admins (including the creator, who
  // may not be playing) are left alone — the roster is who PLAYS, not who
  // can administer.
  const removable = existingMembers.filter(
    (m) => !keptMemberIds.has(m.id) && m.role === 'player',
  );
  const blockedByScores = removable.filter((m) => scoredMemberIds.has(m.id));
  if (blockedByScores.length) {
    throw new Error(
      `${blockedByScores.map((m) => m.nickname).join(', ')} already ${
        blockedByScores.length === 1 ? 'has' : 'have'
      } scores recorded — remove those first, or leave them on the roster.`,
    );
  }
  if (removable.length) {
    const ids = removable.map((m) => m.id);
    try {
      await db
        .delete(teeTimeParticipants)
        .where(inArray(teeTimeParticipants.tripMemberId, ids));
      await db
        .delete(matchParticipants)
        .where(inArray(matchParticipants.tripMemberId, ids));
      await db.delete(tripMembers).where(inArray(tripMembers.id, ids));
    } catch (err) {
      fail('removing players', slug, err);
    }
  }

  // ---- 3. Rounds -------------------------------------------------------
  const payloadRoundIds = new Set(
    clean.rounds.map((r) => r.roundId).filter((x): x is string => !!x),
  );
  const droppedRounds = existingRounds.filter((r) => !payloadRoundIds.has(r.id));
  const droppedWithScores = droppedRounds.filter((r) => scoredRoundIds.has(r.id));
  if (droppedWithScores.length) {
    throw new Error(
      `${droppedWithScores
        .map((r) => r.label ?? `Round ${r.order}`)
        .join(', ')} already ${
        droppedWithScores.length === 1 ? 'has scores' : 'have scores'
      } — delete the scores before removing the round.`,
    );
  }

  for (let ri = 0; ri < clean.rounds.length; ri++) {
    const r = clean.rounds[ri];
    const where =
      clean.rounds.length > 1 ? `saving round ${ri + 1}` : 'saving the round';
    try {
      if (!r.roundId) {
        const [created] = await db
          .insert(rounds)
          .values({
            tripId,
            courseId: r.courseId,
            courseTeeId: r.courseTeeId,
            format: r.formatForRound ?? 'best_ball',
            date: r.date ?? clean.startDate,
            order: ri + 1,
            label: r.label,
            countsTowardCup: r.countsTowardCup,
          })
          .returning();
        await writeRoundLineup({
          roundId: created.id,
          round: r,
          memberIdAt,
          teamAId,
          teamBId,
          teamOfIndex: (i) => clean.players[i].team,
          playerCount: clean.players.length,
          defaultHandicapMethod: clean.handicapMethod,
        });
        continue;
      }

      // Metadata is always editable, scores or not.
      await db
        .update(rounds)
        .set({
          courseId: r.courseId,
          courseTeeId: r.courseTeeId,
          format: r.formatForRound ?? 'best_ball',
          date: r.date ?? clean.startDate,
          order: ri + 1,
          label: r.label,
          countsTowardCup: r.countsTowardCup,
        })
        .where(eq(rounds.id, r.roundId));

      const roundMatches = existingMatches.filter((m) => m.roundId === r.roundId);
      const roundMatchIds = roundMatches.map((m) => m.id);
      const roundTeeTimes = await db
        .select()
        .from(teeTimes)
        .where(eq(teeTimes.roundId, r.roundId));
      const roundTtIds = roundTeeTimes.map((t) => t.id);
      const roundTtp = roundTtIds.length
        ? await db
            .select()
            .from(teeTimeParticipants)
            .where(inArray(teeTimeParticipants.teeTimeId, roundTtIds))
        : [];

      const currentGroups = roundTeeTimes
        .slice()
        .sort((a, b) => a.groupNumber - b.groupNumber)
        .map((tt) =>
          roundTtp.filter((x) => x.teeTimeId === tt.id).map((x) => x.tripMemberId),
        );
      const currentMatches = roundMatches.map((m) => ({
        format: m.format as string,
        sideA: existingParticipants
          .filter((x) => x.matchId === m.id && x.teamId === teamAId)
          .map((x) => x.tripMemberId),
        sideB: existingParticipants
          .filter((x) => x.matchId === m.id && x.teamId === teamBId)
          .map((x) => x.tripMemberId),
      }));

      const wantedGroups = r.groups.map((g) => g.map(memberIdAt));
      const wantedMatches = r.matches.map((m) => ({
        format: m.format as string,
        sideA: m.sideA.map(memberIdAt),
        sideB: m.sideB.map(memberIdAt),
      }));

      const unchanged =
        lineupSignature(currentGroups, currentMatches) ===
        lineupSignature(wantedGroups, wantedMatches);
      if (unchanged) continue;

      // §2: a round with scores has its lineup frozen. Reject rather than
      // silently reinterpreting strokes already entered.
      if (scoredRoundIds.has(r.roundId)) {
        throw new Error(
          'this round already has scores, so its groups and matchups are locked. Course, date, label and cup setting can still be changed.',
        );
      }

      if (roundMatchIds.length) {
        await db
          .delete(matchParticipants)
          .where(inArray(matchParticipants.matchId, roundMatchIds));
        await db.delete(matches).where(inArray(matches.id, roundMatchIds));
      }
      if (roundTtIds.length) {
        await db
          .delete(teeTimeParticipants)
          .where(inArray(teeTimeParticipants.teeTimeId, roundTtIds));
        await db.delete(teeTimes).where(inArray(teeTimes.id, roundTtIds));
      }

      await writeRoundLineup({
        roundId: r.roundId,
        round: r,
        memberIdAt,
        teamAId,
        teamBId,
        teamOfIndex: (i) => clean.players[i].team,
        playerCount: clean.players.length,
        defaultHandicapMethod: clean.handicapMethod,
      });
    } catch (err) {
      fail(where, slug, err);
    }
  }

  if (droppedRounds.length) {
    try {
      const ids = droppedRounds.map((r) => r.id);
      const dropMatches = existingMatches
        .filter((m) => ids.includes(m.roundId))
        .map((m) => m.id);
      if (dropMatches.length) {
        await db
          .delete(matchParticipants)
          .where(inArray(matchParticipants.matchId, dropMatches));
        await db.delete(matches).where(inArray(matches.id, dropMatches));
      }
      // tee_times and their participants cascade off rounds.
      await db.delete(rounds).where(inArray(rounds.id, ids));
    } catch (err) {
      fail('removing rounds', slug, err);
    }
  }

  await syncTripKind(tripId);
  revalidatePath('/home');
  revalidatePath(`/trips/${slug}`, 'layout');
  return { slug };
}

// ───────────────────────── Entry ─────────────────────────

type AuthCtx = NonNullable<Awaited<ReturnType<typeof getGlobalAuthContext>>>;

/**
 * Save an event. Returns the slug; the caller navigates. Deliberately not
 * a redirect — the builder needs to know it succeeded so it can drop its
 * unsaved-changes guard before leaving.
 */
export async function saveEvent(formData: FormData): Promise<{ slug: string }> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const raw = String(formData.get('payload') ?? '');
  if (!raw) throw new Error('Missing form payload');

  let p: EventBuilderPayload;
  try {
    p = JSON.parse(raw) as EventBuilderPayload;
  } catch {
    throw new Error('Form payload was not valid JSON');
  }

  const clean = validatePayload(p);
  return p.tripId ? updateExisting(ctx, p.tripId, clean) : createNew(ctx, clean);
}
