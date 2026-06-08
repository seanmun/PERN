'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { rounds, courses, courseTees } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import type { AuthContext } from '@/lib/auth/current-user';

type RoundFormat = 'best_ball' | 'singles' | 'scramble' | 'stroke' | 'two_man_aggregate';
const VALID_FORMATS: ReadonlySet<RoundFormat> = new Set([
  'best_ball',
  'singles',
  'scramble',
  'stroke',
  'two_man_aggregate',
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

/**
 * Read courseTeeId from the form. Empty/missing -> null (use course default).
 * If set, the tee must belong to the round's course or we reject.
 */
async function resolveCourseTeeId(
  raw: string | null,
  courseId: string,
): Promise<string | null> {
  if (!raw) return null;
  const [tee] = await db
    .select()
    .from(courseTees)
    .where(eq(courseTees.id, raw))
    .limit(1);
  if (!tee || tee.courseId !== courseId) {
    throw new Error('Tee does not belong to the selected course');
  }
  return tee.id;
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
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripId = String(formData.get('tripId') ?? '').trim();
  if (!tripId) throw new Error('tripId is required');
  requireRoundAdmin(ctx, tripId);

  const courseId = String(formData.get('courseId') ?? '').trim();
  if (!courseId) throw new Error('Course is required');

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw new Error('Course not found');

  // Optional tee at create time. Validate it belongs to the chosen course.
  const courseTeeId = await resolveCourseTeeId(
    trim(formData.get('courseTeeId')),
    courseId,
  );

  const label = trim(formData.get('label'));
  const format = readFormat(formData.get('format'));
  const date = parseDate(formData.get('date'));
  const countsTowardCup = formData.get('friendly') !== 'on';

  const [created] = await db
    .insert(rounds)
    .values({
      tripId,
      courseId,
      courseTeeId,
      label,
      format,
      date,
      order: await nextRoundOrder(tripId),
      countsTowardCup,
    })
    .returning();

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  revalidatePath(`/trips/${tripSlug}/admin/rounds`);
  redirect(`/trips/${tripSlug}/admin/rounds/${created.id}/edit`);
}

export async function updateRound(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
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

  // Validate tee against whichever course is being saved (matches the form
  // the user just submitted, not the previously saved courseId).
  const courseTeeId = await resolveCourseTeeId(
    trim(formData.get('courseTeeId')),
    courseId,
  );

  await db
    .update(rounds)
    .set({
      courseId,
      courseTeeId,
      label: trim(formData.get('label')),
      format: readFormat(formData.get('format')),
      date: parseDate(formData.get('date')),
      countsTowardCup: formData.get('friendly') !== 'on',
    })
    .where(eq(rounds.id, id));

  const tripSlug = await getTripSlugById(existing.tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  revalidatePath(`/trips/${tripSlug}/admin/rounds`);
  revalidatePath(`/trips/${tripSlug}/admin/rounds/${id}/edit`);
  redirect(`/trips/${tripSlug}/admin/rounds/${id}/edit`);
}

export async function deleteRound(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
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

  const tripSlug = await getTripSlugById(existing.tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  revalidatePath(`/trips/${tripSlug}/admin/rounds`);
  redirect(`/trips/${tripSlug}/admin/rounds`);
}
