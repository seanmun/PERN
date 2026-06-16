'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds,
  teeTimes,
  tripMembers,
  teams,
} from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import type { AuthContext } from '@/lib/auth/current-user';
import {
  validateBuilderState,
  getMatchTeeTimeId,
  type BuilderState,
  type BuilderContext,
} from '@/lib/validation/match-builder';
import { FORMAT_META, type FormatId } from '@/lib/scoring/formats';

function requireMatchAdmin(ctx: AuthContext, tripId: string): void {
  if (isPlatformAdmin(ctx)) return;
  if (isTripAdminOf(ctx, tripId)) return;
  throw new AuthorizationError('Trip admin required to edit matches');
}

type RoundFormat = 'best_ball' | 'singles' | 'scramble' | 'stroke' | 'two_man_aggregate';
const VALID_FORMATS: ReadonlySet<RoundFormat> = new Set<RoundFormat>([
  'best_ball',
  'singles',
  'scramble',
  'stroke',
  'two_man_aggregate',
]);

function parseFormat(v: FormDataEntryValue | null): RoundFormat | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!VALID_FORMATS.has(s as RoundFormat)) {
    throw new Error(`Invalid match format "${s}"`);
  }
  return s as RoundFormat;
}

export async function updateMatchParticipants(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const matchId = String(formData.get('matchId') ?? '').trim();
  if (!matchId) throw new Error('matchId required');

  const [match] = await db
    .select({ match: matches, round: rounds })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error('Match not found');

  requireMatchAdmin(ctx, match.round.tripId);

  const selectedMemberIds = formData.getAll('participants').map((v) => String(v));
  if (!selectedMemberIds.length) {
    throw new Error('Pick at least one player');
  }

  // Format / scoring change: bump either if the form submitted a new
  // value and it differs. Bumping wipes the match status/result so it
  // recomputes against the new rules on the next score entry —
  // otherwise old result text would leak across formats (e.g. a closed
  // best-ball result hanging on an aggregate match).
  const newFormat = parseFormat(formData.get('format'));
  const rawScoring = String(formData.get('scoring') ?? '').trim();
  const newScoring: 'match_play' | 'stableford' | 'stroke' | null =
    rawScoring === 'match_play' || rawScoring === 'stableford' || rawScoring === 'stroke'
      ? rawScoring
      : null;
  const wipeUpdate: Partial<typeof matches.$inferInsert> = {};
  if (newFormat && newFormat !== match.match.format) {
    wipeUpdate.format = newFormat;
  }
  if (newScoring && newScoring !== match.match.scoring) {
    wipeUpdate.scoring = newScoring;
  }
  if (Object.keys(wipeUpdate).length > 0) {
    await db
      .update(matches)
      .set({
        ...wipeUpdate,
        status: 'scheduled',
        resultText: null,
        winningTeamId: null,
        isHalved: false,
      })
      .where(eq(matches.id, matchId));
  }

  // Resolve each member's team via tripMembers (source of truth)
  const members = await db
    .select()
    .from(tripMembers)
    .where(inArray(tripMembers.id, selectedMemberIds));

  // Clear existing participants for this match
  await db.delete(matchParticipants).where(eq(matchParticipants.matchId, matchId));

  // Insert fresh
  const rows = members
    .filter((m) => m.teamId != null)
    .map((m) => ({
      matchId,
      tripMemberId: m.id,
      teamId: m.teamId!,
    }));

  if (rows.length) {
    await db.insert(matchParticipants).values(rows);
  }

  const tripSlug = await getTripSlugById(match.round.tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  revalidatePath(`/trips/${tripSlug}/matches/${matchId}`);
  redirect(`/trips/${tripSlug}/matches/${matchId}`);
}

export async function createMatch(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const teeTimeId = String(formData.get('teeTimeId') ?? '').trim();
  if (!teeTimeId) throw new Error('teeTimeId required');

  const [teeTime] = await db
    .select({ teeTime: teeTimes, round: rounds })
    .from(teeTimes)
    .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
    .where(eq(teeTimes.id, teeTimeId))
    .limit(1);

  if (!teeTime) throw new Error('Tee time not found');

  requireMatchAdmin(ctx, teeTime.round.tripId);

  const selectedMemberIds = formData.getAll('participants').map((v) => String(v));
  if (!selectedMemberIds.length) {
    throw new Error('Pick at least one player');
  }

  const members = await db
    .select()
    .from(tripMembers)
    .where(inArray(tripMembers.id, selectedMemberIds));

  // Format: form input wins; otherwise fall back to the round's default.
  const format = parseFormat(formData.get('format')) ?? teeTime.round.format;

  const [match] = await db
    .insert(matches)
    .values({
      roundId: teeTime.round.id,
      teeTimeId: teeTime.teeTime.id,
      format,
      status: 'scheduled',
    })
    .returning();

  const rows = members
    .filter((m) => m.teamId != null)
    .map((m) => ({
      matchId: match.id,
      tripMemberId: m.id,
      teamId: m.teamId!,
    }));

  if (rows.length) {
    await db.insert(matchParticipants).values(rows);
  }

  const tripSlug = await getTripSlugById(teeTime.round.tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  redirect(`/trips/${tripSlug}/matches/${match.id}`);
}

/**
 * Builder-style match create. Takes a single `state` field that's the
 * JSON-encoded BuilderState (format, sideSize, sideATeamId,
 * sideBTeamId, sideAPlayerIds, sideBPlayerIds) plus roundId + tripSlug.
 *
 * Runs the same validateBuilderState the client used to gate its Save
 * button, so a hand-crafted POST can't bypass the rules. Sets
 * template_size_a/b on the new row, derives tee_time_id from
 * getMatchTeeTimeId (null if cross-foursome).
 */
export async function createMatchFromBuilder(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const roundId = String(formData.get('roundId') ?? '').trim();
  const tripSlug = String(formData.get('tripSlug') ?? '').trim();
  const rawState = String(formData.get('state') ?? '').trim();
  if (!roundId || !tripSlug || !rawState) {
    throw new Error('roundId, tripSlug, state required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawState);
  } catch {
    throw new Error('Invalid state payload');
  }
  const state = parsed as BuilderState;
  if (
    !state ||
    typeof state.format !== 'string' ||
    typeof state.sideSize !== 'number' ||
    !FORMAT_META[state.format as FormatId] ||
    !Array.isArray(state.sideAPlayerIds) ||
    !Array.isArray(state.sideBPlayerIds)
  ) {
    throw new Error('Malformed builder state');
  }

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!round) throw new Error('Round not found');

  requireMatchAdmin(ctx, round.tripId);

  const allTeeTimes = await db
    .select()
    .from(teeTimes)
    .where(eq(teeTimes.roundId, roundId));

  const allMemberIds = [
    ...state.sideAPlayerIds,
    ...state.sideBPlayerIds,
  ].filter((id): id is string => !!id);

  const members = allMemberIds.length
    ? await db
        .select()
        .from(tripMembers)
        .where(inArray(tripMembers.id, allMemberIds))
    : [];

  // Build context the same way the client did. memberTeamById comes
  // from trip_members; memberTeeTimeById is derived by intersecting
  // the round's tee times with any match.tee_time_id the member is in.
  // For now (steps 1–7 of the spec), tee-time membership is implicit:
  // a player's tee time is whichever round's tee time has at least one
  // match they participate in. Step 8+ promotes this to an explicit
  // tee_time_participants table.
  const existingMatches = await db
    .select({ matchId: matches.id, teeTimeId: matches.teeTimeId })
    .from(matches)
    .where(eq(matches.roundId, roundId));
  const matchIds = existingMatches.map((m) => m.matchId);
  const participantRows = matchIds.length
    ? await db
        .select()
        .from(matchParticipants)
        .where(inArray(matchParticipants.matchId, matchIds))
    : [];
  const matchToTee = new Map(
    existingMatches.map((m) => [m.matchId, m.teeTimeId]),
  );
  const memberTeeTimeById = new Map<string, string | null>();
  for (const m of members) memberTeeTimeById.set(m.id, null);
  for (const p of participantRows) {
    if (!memberTeeTimeById.has(p.tripMemberId)) continue;
    if (memberTeeTimeById.get(p.tripMemberId)) continue; // first wins
    const tee = matchToTee.get(p.matchId);
    if (tee) memberTeeTimeById.set(p.tripMemberId, tee);
  }

  const memberTeamById = new Map<string, string>();
  for (const m of members) {
    if (m.teamId) memberTeamById.set(m.id, m.teamId);
  }

  const builderCtx: BuilderContext = { memberTeamById, memberTeeTimeById };
  const validation = validateBuilderState(state, builderCtx);
  if (!validation.ok) {
    throw new Error(
      `Lineup is invalid: ${validation.errors.join(' · ')}`,
    );
  }

  // Verify each side's team_id actually belongs to this trip.
  const tripTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tripId, round.tripId));
  const tripTeamIds = new Set(tripTeams.map((t) => t.id));
  if (
    !tripTeamIds.has(state.sideATeamId) ||
    !tripTeamIds.has(state.sideBTeamId)
  ) {
    throw new Error('Side team is not part of this trip');
  }

  // Verify the tee-times referenced by the validation exist on this round.
  const roundTeeIds = new Set(allTeeTimes.map((t) => t.id));
  for (const [memberId, teeId] of memberTeeTimeById) {
    if (teeId && !roundTeeIds.has(teeId)) {
      throw new Error(`Player ${memberId} has a tee time not on this round`);
    }
  }

  // Prefer the explicit teeTimeId from the URL/form — that's the admin
  // saying "this matchup belongs to THIS foursome." Falls back to the
  // derived value from existing match participants, which is null on
  // the first match in a round (chicken-and-egg) and would hide the
  // match from the schedule's tee-time-keyed queries.
  const explicitTeeTimeId = String(formData.get('explicitTeeTimeId') ?? '').trim();
  const derivedTeeTimeId = getMatchTeeTimeId(state, builderCtx);
  const teeTimeId =
    explicitTeeTimeId && roundTeeIds.has(explicitTeeTimeId)
      ? explicitTeeTimeId
      : derivedTeeTimeId;

  // Optional scoring + stableford point overrides off the builder form.
  // Defaults to 'match_play' if not posted (legacy callers, etc).
  const scoringRaw = String(formData.get('scoring') ?? 'match_play').trim();
  const scoring: 'match_play' | 'stableford' | 'stroke' =
    scoringRaw === 'stableford' || scoringRaw === 'stroke'
      ? scoringRaw
      : 'match_play';
  let stablefordPts: {
    eagle?: number;
    birdie?: number;
    par?: number;
    bogey?: number;
    doublePlus?: number;
  } = {};
  if (scoring === 'stableford') {
    const rawPts = String(formData.get('stablefordPoints') ?? '').trim();
    if (rawPts) {
      try {
        const parsed = JSON.parse(rawPts) as Record<string, unknown>;
        const num = (v: unknown) =>
          typeof v === 'number' && Number.isFinite(v) ? v : undefined;
        stablefordPts = {
          eagle: num(parsed.eagle),
          birdie: num(parsed.birdie),
          par: num(parsed.par),
          bogey: num(parsed.bogey),
          doublePlus: num(parsed.doublePlus),
        };
      } catch {
        // Malformed JSON — fall back to defaults rather than fail save.
      }
    }
  }

  // Match-points splitter. Defaults preserve the prior "1 pt match"
  // behavior when the builder doesn't post values.
  const clampPts = (raw: FormDataEntryValue | null, dflt: number): number => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return dflt;
    return Math.min(10, Math.floor(n));
  };
  const pointsOverall = clampPts(formData.get('pointsOverall'), 1);
  const pointsFront9 = clampPts(formData.get('pointsFront9'), 0);
  const pointsBack9 = clampPts(formData.get('pointsBack9'), 0);

  const [match] = await db
    .insert(matches)
    .values({
      roundId,
      teeTimeId,
      format: state.format as RoundFormat,
      templateSizeA: state.sideSize,
      templateSizeB: state.sideSize,
      scoring,
      ptsEagle: stablefordPts.eagle ?? null,
      ptsBirdie: stablefordPts.birdie ?? null,
      ptsPar: stablefordPts.par ?? null,
      ptsBogey: stablefordPts.bogey ?? null,
      ptsDoublePlus: stablefordPts.doublePlus ?? null,
      pointsOverall,
      pointsFront9,
      pointsBack9,
      status: 'scheduled',
    })
    .returning();

  // Persist participants. Side A → sideATeamId, Side B → sideBTeamId.
  const rows: { matchId: string; tripMemberId: string; teamId: string }[] = [];
  for (const id of state.sideAPlayerIds) {
    if (!id) continue;
    rows.push({ matchId: match.id, tripMemberId: id, teamId: state.sideATeamId });
  }
  for (const id of state.sideBPlayerIds) {
    if (!id) continue;
    rows.push({ matchId: match.id, tripMemberId: id, teamId: state.sideBTeamId });
  }
  if (rows.length) {
    await db.insert(matchParticipants).values(rows);
  }

  revalidatePath(`/trips/${tripSlug}/schedule`);
  redirect(`/trips/${tripSlug}/matches/${match.id}`);
}

export async function deleteMatch(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const matchId = String(formData.get('matchId') ?? '').trim();
  if (!matchId) throw new Error('matchId required');

  const [match] = await db
    .select({ match: matches, round: rounds })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error('Match not found');

  requireMatchAdmin(ctx, match.round.tripId);

  await db.delete(matches).where(eq(matches.id, matchId));

  const tripSlug = await getTripSlugById(match.round.tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  redirect(`/trips/${tripSlug}/schedule`);
}
