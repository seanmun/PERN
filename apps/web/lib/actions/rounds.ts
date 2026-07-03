'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { rounds, courses, courseTees, matches } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';
import type { AuthContext } from '@/lib/auth/current-user';
import { resolveRedirect } from '@/lib/actions/wizard-redirect';

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
  // Event-creation wizard's Groups step reuses this action and lands
  // back on its own round-setup page instead of the classic round-edit
  // page. The new round's id doesn't exist until after the insert above,
  // so the wizard passes a "{roundId}" placeholder for us to fill in.
  // Absent for every other caller — unchanged.
  const dest = resolveRedirect(
    formData,
    `/trips/${tripSlug}/admin/rounds/${created.id}/edit`,
  );
  if (dest) redirect(dest.replace('{roundId}', created.id));
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

/**
 * Update a single field on a round. Powers the inline-editable card on
 * the round-edit page — each tap-to-edit field posts just its own value
 * without resubmitting the whole form, and without redirecting.
 *
 * Form payload: `id`, `field` (one of label / date / courseId / courseTeeId
 * / format / friendly), `value`.
 */
export async function updateRoundField(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  const field = String(formData.get('field') ?? '').trim();
  const raw = formData.get('value');
  if (!id || !field) throw new Error('id and field required');

  const [existing] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, id))
    .limit(1);
  if (!existing) throw new Error('Round not found');

  requireRoundAdmin(ctx, existing.tripId);

  const patch: Partial<typeof rounds.$inferInsert> = {};
  switch (field) {
    case 'label':
      patch.label = trim(raw);
      break;
    case 'date':
      patch.date = parseDate(raw);
      break;
    case 'format':
      patch.format = readFormat(raw);
      break;
    case 'friendly':
      patch.countsTowardCup = String(raw) !== 'on';
      break;
    case 'courseId': {
      const courseId = String(raw ?? '').trim();
      if (!courseId) throw new Error('Course is required');
      patch.courseId = courseId;
      // Resetting course clears any tee selection — old tee may not exist
      // on the new course.
      patch.courseTeeId = null;
      break;
    }
    case 'courseTeeId':
      patch.courseTeeId = await resolveCourseTeeId(trim(raw), existing.courseId);
      break;
    default:
      throw new Error(`Unknown field "${field}"`);
  }

  await db.update(rounds).set(patch).where(eq(rounds.id, id));

  const tripSlug = await getTripSlugById(existing.tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  revalidatePath(`/trips/${tripSlug}/admin/rounds`);
  revalidatePath(`/trips/${tripSlug}/admin/rounds/${id}/edit`);
}

/**
 * Re-run recomputeMatchStatus for every match in a round. Use case:
 * matches scored before an engine fix have stale persisted status /
 * winningTeamId. Live views (cup tab, match detail) recompute on
 * read, so they look right, but the DB columns drive cup standings.
 * One tap on the round-edit page fixes the round in one shot.
 */
export async function recomputeRoundMatches(formData: FormData): Promise<void> {
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

  // Inline import so the actions file doesn't pull the scoring engine
  // for routes that don't need it. (Same module the score-upsert action
  // already imports.)
  const { recomputeMatchStatusById } = await import('@/lib/actions/scores');
  const matchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.roundId, id));
  for (const m of matchRows) {
    await recomputeMatchStatusById(m.id);
  }

  const tripSlug = await getTripSlugById(existing.tripId);
  revalidatePath(`/trips/${tripSlug}/schedule`);
  revalidatePath(`/trips/${tripSlug}/scoreboard`);
  revalidatePath(`/trips/${tripSlug}/admin/rounds/${id}/edit`);
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
