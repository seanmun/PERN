'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  courses,
  courseHoles,
  courseTees,
  courseTeeYardages,
  rounds,
} from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
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
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripId = String(formData.get('tripId') ?? '').trim();
  if (!tripId) throw new Error('tripId is required');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, tripId)) {
    throw new AuthorizationError('Trip admin required');
  }
  return tripId;
}

// Common tee names roughly ordered longest -> shortest. Used to pick the
// "default" tee when the model returns multiple, and to order the tee list
// for display. Match is case-insensitive prefix.
const TEE_ORDER: ReadonlyArray<string> = [
  'tournament',
  'championship',
  'tips',
  'black',
  'blue',
  'gold',
  'white',
  'green',
  'silver',
  'yellow',
  'red',
  'forward',
  'senior',
  'junior',
];

function teeRank(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < TEE_ORDER.length; i++) {
    if (lower.includes(TEE_ORDER[i])) return i;
  }
  return TEE_ORDER.length; // unknown names fall to the bottom
}

// Pick a sensible default tee. Prefer "white" / "middle" / "regular" when
// present; otherwise fall back to the longest tee we recognize.
function pickDefaultTeeIndex(tees: { name: string }[]): number {
  if (tees.length === 0) return -1;
  const preferred = ['white', 'middle', 'regular', 'member'];
  for (const pref of preferred) {
    const idx = tees.findIndex((t) => t.name.toLowerCase().includes(pref));
    if (idx !== -1) return idx;
  }
  return 0; // first tee in ranked order
}

/**
 * Run Claude vision on the scorecard image, validate the output, and persist
 * the result. Wipes any existing course_holes / course_tees for this course
 * and writes a fresh set. Failures are non-fatal — the scorecard image URL
 * is already persisted before this runs, so admin can re-extract or enter
 * holes by hand.
 */
async function extractAndPopulateScorecard(
  courseId: string,
  scorecardImageUrl: string,
): Promise<void> {
  const extracted = await extractScorecardFromUrl(scorecardImageUrl);
  if (!extracted || extracted.holes.length !== 18) {
    console.warn(
      `[scorecard] extraction returned invalid result for course ${courseId} — admin must enter holes manually`,
    );
    return;
  }

  // Order tees longest -> shortest, with known names ranked first.
  const orderedTees = [...extracted.tees].sort(
    (a, b) => teeRank(a.name) - teeRank(b.name),
  );
  const defaultIdx = pickDefaultTeeIndex(orderedTees);
  const defaultTee = defaultIdx >= 0 ? orderedTees[defaultIdx] : null;

  // Wipe existing state for this course and rebuild. Cascade on course_tees
  // takes course_tee_yardages with it.
  await db.delete(courseTees).where(eq(courseTees.courseId, courseId));
  await db.delete(courseHoles).where(eq(courseHoles.courseId, courseId));

  // Insert tees + yardages
  for (let i = 0; i < orderedTees.length; i++) {
    const tee = orderedTees[i];
    const [created] = await db
      .insert(courseTees)
      .values({
        courseId,
        name: tee.name,
        color: tee.color,
        rating: tee.rating != null ? String(tee.rating) : null,
        slope: tee.slope,
        totalYardage: tee.totalYardage,
        displayOrder: i,
        isDefault: i === defaultIdx,
      })
      .returning({ id: courseTees.id });

    const yardageRows = Object.entries(tee.yardages)
      .map(([hole, y]) => ({
        courseTeeId: created.id,
        holeNumber: Number(hole),
        yardage: y,
      }))
      .filter((r) => Number.isInteger(r.holeNumber));
    if (yardageRows.length > 0) {
      await db.insert(courseTeeYardages).values(yardageRows);
    }
  }

  // Insert course_holes (par + SI), with the default tee's yardage
  // denormalized into course_holes.yardage so legacy callers Just Work.
  const defaultYardages = defaultTee?.yardages ?? {};
  for (const h of extracted.holes) {
    await db.insert(courseHoles).values({
      courseId,
      holeNumber: h.holeNumber,
      par: h.par,
      handicapIndex: h.handicapIndex,
      yardage: defaultYardages[h.holeNumber] ?? null,
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
 * Promote one tee to the course's default. Clears isDefault on all sibling
 * tees, sets it on the chosen one, and rewrites course_holes.yardage with
 * the new default tee's per-hole yardages so legacy callers stay correct.
 */
export async function setDefaultTee(formData: FormData): Promise<void> {
  const tripId = await ensureCourseAdmin(formData);

  const courseId = String(formData.get('courseId') ?? '').trim();
  const teeId = String(formData.get('teeId') ?? '').trim();
  if (!courseId || !teeId) throw new Error('courseId and teeId required');

  // Sanity: tee must belong to the named course.
  const [tee] = await db
    .select()
    .from(courseTees)
    .where(eq(courseTees.id, teeId))
    .limit(1);
  if (!tee || tee.courseId !== courseId) {
    throw new Error('Tee does not belong to this course');
  }

  // Flip the default flag.
  await db
    .update(courseTees)
    .set({ isDefault: false })
    .where(eq(courseTees.courseId, courseId));
  await db
    .update(courseTees)
    .set({ isDefault: true })
    .where(eq(courseTees.id, teeId));

  // Re-denormalize course_holes.yardage from the new default tee.
  const teeYardages = await db
    .select()
    .from(courseTeeYardages)
    .where(eq(courseTeeYardages.courseTeeId, teeId));
  const yByHole = new Map(teeYardages.map((r) => [r.holeNumber, r.yardage]));
  const holes = await db
    .select()
    .from(courseHoles)
    .where(eq(courseHoles.courseId, courseId));
  for (const h of holes) {
    const newY = yByHole.get(h.holeNumber) ?? null;
    if (newY !== h.yardage) {
      await db
        .update(courseHoles)
        .set({ yardage: newY })
        .where(eq(courseHoles.id, h.id));
    }
  }

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/admin/courses/${courseId}/edit`);
  revalidatePath(`/trips/${tripSlug}/admin/courses`);
}

/**
 * Manually set a tee's slope + rating. The scorecard extraction fills
 * these when the photo shows them, but plenty of cards don't — and the
 * course-handicap method needs them. Bounds mirror the extractor's
 * validation (rating 50–100, slope 55–200). Blank clears the value.
 */
export async function updateTeeRating(formData: FormData): Promise<void> {
  const tripId = await ensureCourseAdmin(formData);

  const courseId = String(formData.get('courseId') ?? '').trim();
  const teeId = String(formData.get('teeId') ?? '').trim();
  if (!courseId || !teeId) throw new Error('courseId and teeId required');

  const [tee] = await db
    .select()
    .from(courseTees)
    .where(eq(courseTees.id, teeId))
    .limit(1);
  if (!tee || tee.courseId !== courseId) {
    throw new Error('Tee does not belong to this course');
  }

  const ratingRaw = String(formData.get('rating') ?? '').trim();
  const slopeRaw = String(formData.get('slope') ?? '').trim();

  let rating: string | null = null;
  if (ratingRaw) {
    const n = Number(ratingRaw);
    if (!Number.isFinite(n) || n < 50 || n > 100) {
      throw new Error('Rating must be between 50 and 100 (e.g. 72.5)');
    }
    rating = n.toFixed(1);
  }
  let slope: number | null = null;
  if (slopeRaw) {
    const n = Number(slopeRaw);
    if (!Number.isFinite(n) || n < 55 || n > 200) {
      throw new Error('Slope must be between 55 and 200 (e.g. 130)');
    }
    slope = Math.round(n);
  }

  await db
    .update(courseTees)
    .set({ rating, slope })
    .where(eq(courseTees.id, teeId));

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/admin/courses/${courseId}/edit`);
  revalidatePath(`/trips/${tripSlug}/admin/courses`);
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

/**
 * Manually correct a single hole's par / handicap index / yardage. The
 * scorecard OCR isn't always right — this is the patch-up surface so an
 * admin can fix bad holes during a round without re-running the whole
 * extraction. Stats downstream (match-play stroke allocation, leaderboard
 * vs-par) all read from courseHoles so this is enough to repair them.
 */
export async function updateCourseHole(formData: FormData): Promise<void> {
  const tripId = await ensureCourseAdmin(formData);

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const par = intOrNull(formData.get('par'));
  const handicapIndex = intOrNull(formData.get('handicapIndex'));
  const yardage = intOrNull(formData.get('yardage'));

  if (par == null || par < 3 || par > 6) {
    throw new Error('Par must be between 3 and 6.');
  }
  if (handicapIndex == null || handicapIndex < 1 || handicapIndex > 18) {
    throw new Error('Handicap index must be between 1 and 18.');
  }
  if (yardage != null && (yardage < 50 || yardage > 800)) {
    throw new Error('Yardage looks off (50–800 yds).');
  }

  const [hole] = await db
    .select({ id: courseHoles.id, courseId: courseHoles.courseId })
    .from(courseHoles)
    .where(eq(courseHoles.id, id))
    .limit(1);
  if (!hole) throw new Error('Hole not found');

  await db
    .update(courseHoles)
    .set({ par, handicapIndex, yardage })
    .where(eq(courseHoles.id, id));

  const tripSlug = await getTripSlugById(tripId);
  revalidatePath(`/trips/${tripSlug}/admin/courses/${hole.courseId}/edit`);
  // Score-entry pages embed courseHoles snapshot data; bump the schedule and
  // any in-progress match pages so they re-render with the corrected par.
  revalidatePath(`/trips/${tripSlug}/schedule`, 'layout');
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
}
