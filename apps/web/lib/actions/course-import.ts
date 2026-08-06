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
  apiCourseId: string,
): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');
  if (!tripId) throw new Error('tripId is required');
  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  const tripSlug = await getTripSlugById(tripId);
  await importCourse(apiCourseId);

  revalidatePath(`/trips/${tripSlug}`, 'layout');
  redirect(`/trips/${tripSlug}/edit`);
}

/**
 * Import path for the event-creation wizard, where no trip exists yet so
 * there's no trip-admin to check — the caller is about to become one.
 * Courses are a shared global library; sign-in is the only gate. Returns
 * the local course id for the wizard to carry into the Details step.
 */
export async function importCourseForWizard(
  apiCourseId: string,
): Promise<{ courseId: string }> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');
  return { courseId: await importCourse(apiCourseId) };
}

/** Dedupe-or-import; returns the local courses.id either way. */
async function importCourse(apiCourseId: string): Promise<string> {
  if (!apiCourseId.trim()) throw new Error('Invalid course id');

  const [existing] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.externalSource, SOURCE),
        eq(courses.externalId, apiCourseId),
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
      externalId: apiCourseId,
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

// ───────────────────────── Enrich an existing course ─────────────────────────

/**
 * Pull slope/rating (and missing yardages) from golfcourseapi onto a course
 * that ALREADY EXISTS, instead of importing a second copy of it.
 *
 * `importCourse` above dedupes on (external_source, external_id), so it can
 * only ever recognise courses it created itself. Every course built the
 * other way — Google Places plus scorecard-photo extraction, which is how
 * all of Pinehurst's were — has neither column set, so an import would
 * insert a duplicate and leave the trip's rounds pointed at the original.
 * That is the whole reason the API looked useless here.
 *
 * This merges instead:
 *   · tees are matched by name, case-insensitively
 *   · only BLANK fields are filled — an admin-entered rating always wins
 *   · external_source/external_id get stamped on, so the course is
 *     recognised from here on and this never has to guess again
 *
 * Nothing is deleted and no hole pars are touched: those came from the
 * scorecard the group actually played, and §4.1 makes course facts
 * foundation data. This only fills in what was missing.
 */
export async function enrichCourseFromGolfCourseApi(
  formData: FormData,
): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripId = String(formData.get('tripId') ?? '').trim();
  const courseId = String(formData.get('courseId') ?? '').trim();
  const apiCourseId = String(formData.get('apiCourseId') ?? '').trim();
  if (!tripId || !courseId) throw new Error('tripId and courseId are required');
  if (!apiCourseId) throw new Error('Invalid course id');
  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw new Error('Course not found');

  const api = await getGolfCourse(apiCourseId);

  // Same merge the importer does, minus the 18-hole filter: a 9-hole or
  // par-3 course still carries a usable slope and rating.
  const apiTees: { name: string; tee: GcaTeeBox }[] = [
    ...(api.tees?.male ?? []).map((t) => ({
      name: (t.tee_name ?? '').trim(),
      tee: t,
    })),
    ...(api.tees?.female ?? []).map((t) => ({
      name: (t.tee_name ?? '').trim(),
      tee: t,
    })),
  ].filter((t) => t.name.length > 0);

  const existing = await db
    .select()
    .from(courseTees)
    .where(eq(courseTees.courseId, courseId));

  // Tee names agree in substance but not in spelling: our scorecard
  // extraction stored "Medal", the API says "Medal Tees". Exact matching
  // filled nothing and returned silently, which looked exactly like a
  // broken button. Strip the trailing "tee(s)" and all punctuation before
  // comparing.
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s*tees?\s*$/, '')
      .replace(/[^a-z0-9]/g, '');

  let filled = 0;
  let unmatched = 0;

  for (const tee of existing) {
    // Only fill what is blank. An admin who typed a rating off the card in
    // their hand outranks anything an API says.
    if (tee.slope != null && tee.rating != null) continue;

    // Male tees are listed first, so `find` prefers them — the men's
    // rating is the right default for this app's use.
    const match = apiTees.find((t) => norm(t.name) === norm(tee.name));
    if (!match) {
      unmatched++;
      continue;
    }

    const slope = tee.slope ?? match.tee.slope_rating ?? null;
    const rating =
      tee.rating ??
      (match.tee.course_rating != null
        ? match.tee.course_rating.toFixed(1)
        : null);
    const totalYardage = tee.totalYardage ?? match.tee.total_yards ?? null;

    if (slope === tee.slope && rating === tee.rating && totalYardage === tee.totalYardage) {
      continue;
    }
    await db
      .update(courseTees)
      .set({ slope, rating, totalYardage })
      .where(eq(courseTees.id, tee.id));
    filled++;
  }

  // Stamp provenance so the dedupe above recognises this course from now
  // on, and so a future re-import updates rather than duplicates.
  if (!course.externalSource) {
    await db
      .update(courses)
      .set({ externalSource: SOURCE, externalId: apiCourseId })
      .where(eq(courses.id, courseId));
  }

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}`, 'layout');
  // Report the outcome. A merge that matched nothing is the single most
  // confusing thing this action can do, so it never returns silently.
  redirect(
    `/trips/${tripSlug}/courses?filled=${filled}&unmatched=${unmatched}`,
  );
}
