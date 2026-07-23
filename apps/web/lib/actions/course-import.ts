'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  courses,
  courseHoles,
  courseTees,
  courseTeeYardages,
} from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import {
  getGolfCourse,
  gcaDisplayName,
  gcaLocationLine,
  type GcaTeeBox,
} from '@/lib/golfcourseapi/client';
import { teeRank, pickDefaultTeeIndex } from '@/lib/scorecard/tee-order';

const SOURCE = 'golfcourseapi';

/**
 * Import a course from golfcourseapi.com by its numeric id: course row +
 * tees + per-tee yardages + 18 course_holes (par / stroke index), all in
 * one tap. Dedupes on (external_source, external_id) — re-importing an
 * already-imported course just redirects to its edit page.
 *
 * Courses whose API record has no usable 18-hole tee still import as a
 * shell (name/location/address) — the admin falls back to scorecard-photo
 * extraction or manual entry, same as a Places-created course.
 */
export async function importCourseFromGolfCourseApi(
  tripId: string,
  apiCourseId: number,
): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');
  if (!tripId) throw new Error('tripId is required');
  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  const tripSlug = await getTripSlugById(tripId);
  const courseId = await importCourse(apiCourseId);

  revalidatePath(`/trips/${tripSlug}/admin/courses`);
  redirect(`/trips/${tripSlug}/admin/courses/${courseId}/edit`);
}

/**
 * Import path for the event-creation wizard, where no trip exists yet so
 * there's no trip-admin to check — the caller is about to become one.
 * Courses are a shared global library; sign-in is the only gate. Returns
 * the local course id for the wizard to carry into the Details step.
 */
export async function importCourseForWizard(
  apiCourseId: number,
): Promise<{ courseId: string }> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');
  return { courseId: await importCourse(apiCourseId) };
}

/** Dedupe-or-import; returns the local courses.id either way. */
async function importCourse(apiCourseId: number): Promise<string> {
  if (!Number.isInteger(apiCourseId) || apiCourseId <= 0) {
    throw new Error('Invalid course id');
  }

  const [existing] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.externalSource, SOURCE),
        eq(courses.externalId, String(apiCourseId)),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const api = await getGolfCourse(apiCourseId);

  // Merge tee lists: men's first, then women's whose names don't collide
  // (collisions get a "(W)" suffix so both survive). Only 18-hole tees
  // carry usable scorecard data for this app.
  const male = api.tees?.male ?? [];
  const female = api.tees?.female ?? [];
  const maleNames = new Set(
    male.map((t) => (t.tee_name ?? '').toLowerCase()).filter(Boolean),
  );
  const merged: { name: string; tee: GcaTeeBox }[] = [
    ...male.map((t) => ({ name: t.tee_name?.trim() || 'Tee', tee: t })),
    ...female.map((t) => {
      const base = t.tee_name?.trim() || 'Forward';
      const name = maleNames.has(base.toLowerCase()) ? `${base} (W)` : base;
      return { name, tee: t };
    }),
  ].filter(({ tee }) => (tee.holes?.length ?? 0) === 18);

  const orderedTees = [...merged].sort((a, b) => teeRank(a.name) - teeRank(b.name));
  const defaultIdx = pickDefaultTeeIndex(orderedTees);
  const defaultTee = defaultIdx >= 0 ? orderedTees[defaultIdx].tee : null;

  const totalPar =
    defaultTee?.par_total ??
    (defaultTee?.holes?.every((h) => h.par != null)
      ? defaultTee.holes.reduce((sum, h) => sum + (h.par ?? 0), 0)
      : null);

  const [created] = await db
    .insert(courses)
    .values({
      name: gcaDisplayName(api),
      location: gcaLocationLine(api),
      address: api.location?.address ?? null,
      latitude: api.location?.latitude ?? null,
      longitude: api.location?.longitude ?? null,
      externalSource: SOURCE,
      externalId: String(apiCourseId),
      totalPar,
    })
    .returning({ id: courses.id });

  for (let i = 0; i < orderedTees.length; i++) {
    const { name, tee } = orderedTees[i];
    const [createdTee] = await db
      .insert(courseTees)
      .values({
        courseId: created.id,
        name,
        color: null,
        rating: tee.course_rating != null ? tee.course_rating.toFixed(1) : null,
        slope: tee.slope_rating ?? null,
        totalYardage: tee.total_yards ?? null,
        displayOrder: i,
        isDefault: i === defaultIdx,
      })
      .returning({ id: courseTees.id });

    const yardageRows = (tee.holes ?? []).flatMap((h, holeIdx) =>
      h.yardage != null
        ? [{ courseTeeId: createdTee.id, holeNumber: holeIdx + 1, yardage: h.yardage }]
        : [],
    );
    if (yardageRows.length > 0) {
      await db.insert(courseTeeYardages).values(yardageRows);
    }
  }

  // course_holes from the default tee — the API's holes array is ordered
  // hole 1..18; `handicap` is the stroke index. Records occasionally omit
  // handicaps; fall back to hole number so the NOT NULL column is satisfied
  // and the admin can correct it on the edit screen.
  if (defaultTee?.holes?.length === 18) {
    for (let i = 0; i < 18; i++) {
      const h = defaultTee.holes[i];
      await db.insert(courseHoles).values({
        courseId: created.id,
        holeNumber: i + 1,
        par: h.par ?? 4,
        handicapIndex: h.handicap ?? i + 1,
        yardage: h.yardage ?? null,
      });
    }
  }

  return created.id;
}
