'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { teeTimes, rounds, teeTimeParticipants, tripMembers } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import { syncTripKind } from '@/lib/trip-kind';
import type { AuthContext } from '@/lib/auth/current-user';
import { resolveRedirect } from '@/lib/actions/wizard-redirect';
import { tripWallTimeToDate } from '@/lib/trip-time';

function requireTeeTimeAdmin(ctx: AuthContext, tripId: string): void {
  if (isPlatformAdmin(ctx)) return;
  if (isTripAdminOf(ctx, tripId)) return;
  throw new AuthorizationError('Trip admin required');
}

function parseWallTime(v: FormDataEntryValue | null): Date | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = tripWallTimeToDate(s);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid time');
  return d;
}

function parseGroup(v: FormDataEntryValue | null): number {
  const s = String(v ?? '').trim();
  if (!s) throw new Error('Group number is required');
  const n = Number(s);
  if (Number.isNaN(n) || n < 1 || n > 99) throw new Error('Invalid group number');
  return Math.floor(n);
}

export async function createTeeTime(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const roundId = String(formData.get('roundId') ?? '').trim();
  if (!roundId) throw new Error('roundId required');

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!round) throw new Error('Round not found');

  requireTeeTimeAdmin(ctx, round.tripId);

  // Group number defaults to the next free one — the app knows it, so
  // the form no longer asks. An explicit number is still accepted.
  const rawGroup = String(formData.get('groupNumber') ?? '').trim();
  let groupNumber: number;
  if (rawGroup) {
    groupNumber = parseGroup(rawGroup);
  } else {
    const [top] = await db
      .select({ n: sql<number>`coalesce(max(${teeTimes.groupNumber}), 0)::int` })
      .from(teeTimes)
      .where(eq(teeTimes.roundId, roundId));
    groupNumber = (top?.n ?? 0) + 1;
  }

  await db.insert(teeTimes).values({
    roundId,
    time: parseWallTime(formData.get('time')),
    groupNumber,
  });

  // On a one-round event, group count is what separates a match from an
  // outing (§6.3). Kind is derived, so re-derive rather than leave it.
  await syncTripKind(round.tripId);

  const tripSlug = await getTripSlugById(round.tripId);
  // Groups are read by the schedule, the builder and the match builder;
  // bump the whole trip subtree rather than chase each page.
  revalidatePath(`/trips/${tripSlug}`, 'layout');
  // Callers that want to stay put still pass `redirectTo=none`; anything
  // else lands where groups now live, the builder in edit mode.
  const dest = resolveRedirect(formData, `/trips/${tripSlug}/edit`);
  if (dest) redirect(dest);
}

export async function updateTeeTime(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [existing] = await db
    .select({ teeTime: teeTimes, round: rounds })
    .from(teeTimes)
    .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
    .where(eq(teeTimes.id, id))
    .limit(1);
  if (!existing) throw new Error('Tee time not found');

  requireTeeTimeAdmin(ctx, existing.round.tripId);

  await db
    .update(teeTimes)
    .set({
      time: parseWallTime(formData.get('time')),
      groupNumber: parseGroup(formData.get('groupNumber')),
    })
    .where(eq(teeTimes.id, id));

  const tripSlug = await getTripSlugById(existing.round.tripId);
  revalidatePath(`/trips/${tripSlug}`, 'layout');
  // Tee times are shown on the schedule; that is where a caller lands.
  redirect(`/trips/${tripSlug}/schedule`);
}

/**
 * Inline-edit single-field patch for the tee-time admin card. Pairs
 * with InlineText / InlineDatetime / InlineNumber on the edit page.
 *
 * Form payload: `id`, `field` (time / groupNumber), `value`.
 */
export async function updateTeeTimeField(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  const field = String(formData.get('field') ?? '').trim();
  const raw = formData.get('value');
  if (!id || !field) throw new Error('id and field required');

  const [row] = await db
    .select({ teeTime: teeTimes, round: rounds })
    .from(teeTimes)
    .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
    .where(eq(teeTimes.id, id))
    .limit(1);
  if (!row) throw new Error('Tee time not found');

  requireTeeTimeAdmin(ctx, row.round.tripId);

  const patch: Partial<typeof teeTimes.$inferInsert> = {};
  switch (field) {
    case 'time': {
      // Empty clears it — tee times are optional until the sheet is set;
      // the schedule shows the group as "Time TBD" meanwhile.
      const d = parseWallTime(raw);
      patch.time = d;
      break;
    }
    case 'groupNumber':
      patch.groupNumber = parseGroup(raw);
      break;
    default:
      throw new Error(`Unknown field "${field}"`);
  }

  await db.update(teeTimes).set(patch).where(eq(teeTimes.id, id));

  const tripSlug = await getTripSlugById(row.round.tripId);
  revalidatePath(`/trips/${tripSlug}`, 'layout');
}

/**
 * Replace the foursome's roster (tee_time_participants) with the
 * selected set. Wipes the existing rows and inserts whatever the form
 * sends. This is the explicit "who's physically in this group" list,
 * decoupled from match participation.
 */
export async function updateTeeTimeRoster(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const teeTimeId = String(formData.get('teeTimeId') ?? '').trim();
  if (!teeTimeId) throw new Error('teeTimeId required');

  const [row] = await db
    .select({ teeTime: teeTimes, round: rounds })
    .from(teeTimes)
    .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
    .where(eq(teeTimes.id, teeTimeId))
    .limit(1);
  if (!row) throw new Error('Tee time not found');

  requireTeeTimeAdmin(ctx, row.round.tripId);

  const memberIds = formData.getAll('memberIds').map((v) => String(v)).filter(Boolean);
  if (memberIds.length > 4) {
    throw new Error('A foursome maxes out at 4 players. Uncheck one before saving.');
  }

  // Posted ids are client input — keep only real members of THIS trip,
  // otherwise another trip's players can be written into the foursome.
  const validMemberIds = memberIds.length
    ? (
        await db
          .select({ id: tripMembers.id })
          .from(tripMembers)
          .where(
            and(
              eq(tripMembers.tripId, row.round.tripId),
              inArray(tripMembers.id, memberIds),
            ),
          )
      ).map((m) => m.id)
    : [];

  await db
    .delete(teeTimeParticipants)
    .where(eq(teeTimeParticipants.teeTimeId, teeTimeId));

  if (validMemberIds.length) {
    await db
      .insert(teeTimeParticipants)
      .values(validMemberIds.map((id) => ({ teeTimeId, tripMemberId: id })));
  }

  const tripSlug = await getTripSlugById(row.round.tripId);
  // Who is in which foursome is read by score entry, the schedule and
  // the match builder — bump the whole trip subtree.
  revalidatePath(`/trips/${tripSlug}`, 'layout');
  // Callers that want to stay put still pass `redirectTo=none`; anything
  // else lands where groups now live, the builder in edit mode.
  const dest = resolveRedirect(formData, `/trips/${tripSlug}/edit`);
  if (dest) redirect(dest);
}

export async function deleteTeeTime(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [existing] = await db
    .select({ teeTime: teeTimes, round: rounds })
    .from(teeTimes)
    .innerJoin(rounds, eq(teeTimes.roundId, rounds.id))
    .where(eq(teeTimes.id, id))
    .limit(1);
  if (!existing) throw new Error('Tee time not found');

  requireTeeTimeAdmin(ctx, existing.round.tripId);

  await db.delete(teeTimes).where(eq(teeTimes.id, id));

  await syncTripKind(existing.round.tripId);

  const tripSlug = await getTripSlugById(existing.round.tripId);
  revalidatePath(`/trips/${tripSlug}`, 'layout');
  redirect(`/trips/${tripSlug}/edit`);
}
