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
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import type { AuthContext } from '@/lib/auth/current-user';

function requireMatchAdmin(ctx: AuthContext, tripId: string): void {
  if (isPlatformAdmin(ctx)) return;
  if (isTripAdminOf(ctx, tripId)) return;
  throw new AuthorizationError('Trip admin required to edit matches');
}

export async function updateMatchParticipants(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
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
  const ctx = await getAuthContext();
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

  const [match] = await db
    .insert(matches)
    .values({
      roundId: teeTime.round.id,
      teeTimeId: teeTime.teeTime.id,
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

export async function deleteMatch(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
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
