'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teeTimes, rounds } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import type { AuthContext } from '@/lib/auth/current-user';

const TRIP_TZ_OFFSET = '-04:00';

function requireTeeTimeAdmin(ctx: AuthContext, tripId: string): void {
  if (isPlatformAdmin(ctx)) return;
  if (isTripAdminOf(ctx, tripId)) return;
  throw new AuthorizationError('Trip admin required');
}

function parseWallTime(v: FormDataEntryValue | null): Date | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(`${s}:00${TRIP_TZ_OFFSET}`);
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
  const ctx = await getAuthContext();
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

  await db.insert(teeTimes).values({
    roundId,
    time: parseWallTime(formData.get('time')),
    groupNumber: parseGroup(formData.get('groupNumber')),
  });

  revalidatePath('/schedule');
  revalidatePath(`/admin/rounds/${roundId}/edit`);
  redirect(`/admin/rounds/${roundId}/edit`);
}

export async function updateTeeTime(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
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

  revalidatePath('/schedule');
  revalidatePath(`/admin/rounds/${existing.teeTime.roundId}/edit`);
  redirect(`/admin/rounds/${existing.teeTime.roundId}/edit`);
}

export async function deleteTeeTime(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
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

  revalidatePath('/schedule');
  revalidatePath(`/admin/rounds/${existing.teeTime.roundId}/edit`);
  redirect(`/admin/rounds/${existing.teeTime.roundId}/edit`);
}
