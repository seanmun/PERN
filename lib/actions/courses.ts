'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { courses, courseHoles, rounds } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import { extractScorecardFromUrl } from '@/lib/scorecard/extract';

function trim(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = trim(v);
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error('Invalid number');
  return Math.round(n);
}

async function ensureCourseAdmin(formData: FormData): Promise<string> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripId = String(formData.get('tripId') ?? '').trim();
  if (!tripId) throw new Error('tripId is required');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, tripId)) {
    throw new AuthorizationError('Trip admin required');
  }
  return tripId;
}

/**
 * Run Claude vision on the scorecard image, validate the output, and upsert
 * the 18 holes into course_holes. Stamps scorecardExtractedAt on the course
 * when extraction succeeds. Failures are non-fatal — the URL is already
 * persisted before this runs.
 */
async function extractAndPopulateScorecard(
  courseId: string,
  scorecardImageUrl: string
): Promise<void> {
  const holes = await extractScorecardFromUrl(scorecardImageUrl);
  if (!holes) {
    console.warn(
      `[scorecard] extraction returned null for course ${courseId} — admin must enter holes manually`
    );
    return;
  }

  for (const h of holes) {
    await db
      .insert(courseHoles)
      .values({
        courseId,
        holeNumber: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        handicapIndex: h.handicapIndex,
      })
      .onConflictDoUpdate({
        target: [courseHoles.courseId, courseHoles.holeNumber],
        set: {
          par: h.par,
          yardage: h.yardage,
          handicapIndex: h.handicapIndex,
        },
      });
  }

  await db
    .update(courses)
    .set({ scorecardExtractedAt: new Date() })
    .where(eq(courses.id, courseId));
}

export async function createCourse(formData: FormData): Promise<void> {
  const tripId = await ensureCourseAdmin(formData);

  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Name is required');

  const scorecardImageUrl = trim(formData.get('scorecardImageUrl'));

  const [created] = await db
    .insert(courses)
    .values({
      name,
      location: trim(formData.get('location')),
      address: trim(formData.get('address')),
      totalPar: intOrNull(formData.get('totalPar')),
      imageUrl: trim(formData.get('imageUrl')),
      scorecardImageUrl,
    })
    .returning();

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/admin/courses`);

  const redirectTo = String(formData.get('redirectTo') ?? '').trim();
  if (redirectTo) {
    redirect(redirectTo);
  } else {
    redirect(`/trips/${tripSlug}/admin/courses/${created.id}/edit`);
  }
}

export async function updateCourse(formData: FormData): Promise<void> {
  const tripId = await ensureCourseAdmin(formData);

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Name is required');

  const [existing] = await db
    .select({ scorecardImageUrl: courses.scorecardImageUrl })
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);

  const newScorecardUrl = trim(formData.get('scorecardImageUrl'));
  const scorecardChanged =
    newScorecardUrl != null &&
    newScorecardUrl !== (existing?.scorecardImageUrl ?? null);

  await db
    .update(courses)
    .set({
      name,
      location: trim(formData.get('location')),
      address: trim(formData.get('address')),
      imageUrl: trim(formData.get('imageUrl')),
      scorecardImageUrl: newScorecardUrl,
      // If the scorecard image was swapped, stale extraction timestamp becomes
      // misleading; clear it so the "Run AI extraction" button reappears.
      scorecardExtractedAt: scorecardChanged ? null : undefined,
    })
    .where(eq(courses.id, id));

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  revalidatePath(`/trips/${tripSlug}/admin/courses`);
  revalidatePath(`/trips/${tripSlug}/admin/courses/${id}/edit`);
  redirect(`/trips/${tripSlug}/admin/courses/${id}/edit`);
}

/**
 * Manual re-extract for an existing course. Useful when the admin tunes the
 * scorecard photo or wants to retry after a failed first pass.
 */
export async function reextractScorecard(formData: FormData): Promise<void> {
  const tripId = await ensureCourseAdmin(formData);

  const courseId = String(formData.get('id') ?? '').trim();
  if (!courseId) throw new Error('id required');

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course?.scorecardImageUrl) {
    throw new Error('Course has no scorecard image to extract from');
  }

  await extractAndPopulateScorecard(courseId, course.scorecardImageUrl);

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/admin/courses`);
  revalidatePath(`/trips/${tripSlug}/admin/courses/${courseId}/edit`);
}
