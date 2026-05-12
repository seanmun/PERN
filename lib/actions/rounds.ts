'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { rounds, trips, courses } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import type { AuthContext } from '@/lib/auth/current-user';

type RoundFormat = 'match_play_2v2' | 'singles' | 'scramble' | 'stroke';
const VALID_FORMATS: ReadonlySet<RoundFormat> = new Set([
  'match_play_2v2',
  'singles',
  'scramble',
  'stroke',
]);

const TRIP_TZ_OFFSET = '-04:00';

function requireRoundAdmin(ctx: AuthContext, tripId: string): void {
  if (isPlatformAdmin(ctx)) return;
  if (isTripAdminOf(ctx, tripId)) return;
  throw new AuthorizationError('Trip admin required');
}

function trim(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function readFormat(v: FormDataEntryValue | null): RoundFormat {
  const s = String(v ?? '').trim();
  if (!VALID_FORMATS.has(s as RoundFormat)) {
    throw new Error('Invalid format');
  }
  return s as RoundFormat;
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Date input gives YYYY-MM-DD; pin to local midnight in trip TZ.
  const d = new Date(`${s}T00:00:00${TRIP_TZ_OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  return d;
}

async function getTripOrThrow(): Promise<typeof trips.$inferSelect> {
  const [trip] = await db.select().from(trips).limit(1);
  if (!trip) throw new Error('No trip configured');
  return trip;
}

async function nextRoundOrder(tripId: string): Promise<number> {
  const [last] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tripId, tripId))
    .orderBy(desc(rounds.order))
    .limit(1);
  return (last?.order ?? 0) + 1;
}

export async function createRound(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const trip = await getTripOrThrow();
  requireRoundAdmin(ctx, trip.id);

  const courseId = String(formData.get('courseId') ?? '').trim();
  if (!courseId) throw new Error('Course is required');

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw new Error('Course not found');

  const label = trim(formData.get('label'));
  const format = readFormat(formData.get('format'));
  const date = parseDate(formData.get('date'));
  const countsTowardCup = formData.get('countsTowardCup') !== 'off';

  const [created] = await db
    .insert(rounds)
    .values({
      tripId: trip.id,
      courseId,
      label,
      format,
      date,
      order: await nextRoundOrder(trip.id),
      countsTowardCup,
    })
    .returning();

  revalidatePath('/schedule');
  revalidatePath('/admin/rounds');
  redirect(`/admin/rounds/${created.id}/edit`);
}

export async function updateRound(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [existing] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, id))
    .limit(1);
  if (!existing) throw new Error('Round not found');

  requireRoundAdmin(ctx, existing.tripId);

  const courseId = String(formData.get('courseId') ?? '').trim();
  if (!courseId) throw new Error('Course is required');

  await db
    .update(rounds)
    .set({
      courseId,
      label: trim(formData.get('label')),
      format: readFormat(formData.get('format')),
      date: parseDate(formData.get('date')),
      countsTowardCup: formData.get('countsTowardCup') !== 'off',
    })
    .where(eq(rounds.id, id));

  revalidatePath('/schedule');
  revalidatePath('/admin/rounds');
  revalidatePath(`/admin/rounds/${id}/edit`);
  redirect(`/admin/rounds/${id}/edit`);
}

export async function deleteRound(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [existing] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, id))
    .limit(1);
  if (!existing) throw new Error('Round not found');

  requireRoundAdmin(ctx, existing.tripId);

  await db.delete(rounds).where(eq(rounds.id, id));

  revalidatePath('/schedule');
  revalidatePath('/admin/rounds');
  redirect('/admin/rounds');
}
