'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { rounds, trips } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { getTripAuthContext, getTripSlugById } from '@/lib/auth/trip-context';
import { AuthorizationError, canEditTrip, requireAuth } from '@/lib/auth/permissions';
import {
  isRoundFormat,
  provisionTrip,
  resolveUniqueTripSlug,
} from '@/lib/trip-provision';
import { resolveRedirect } from '@/lib/actions/wizard-redirect';
import { tripWallTimeToDate } from '@/lib/trip-time';

function trim(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Date input gives YYYY-MM-DD; pin to local midnight in trip TZ.
  const d = tripWallTimeToDate(s);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  return d;
}

function readColor(v: FormDataEntryValue | null, fallback: string): string {
  const s = trim(v);
  if (!s) return fallback;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`Invalid color "${s}". Use a #RRGGBB hex value.`);
  }
  return s.toLowerCase();
}

export async function createTrip(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const name = trim(formData.get('name'));
  if (!name) throw new Error('Trip name is required');

  const kindRaw = trim(formData.get('kind'));
  const kind: 'trip' | 'outing' | 'match' =
    kindRaw === 'outing' || kindRaw === 'match' ? kindRaw : 'trip';

  const slugInput = trim(formData.get('slug')) ?? name;
  const customized = trim(formData.get('slugCustomized')) === '1';
  const slug = await resolveUniqueTripSlug(slugInput, customized);

  const startDate = parseDate(formData.get('startDate'));
  // Single-day kinds: the form only shows one date input. End date defaults to
  // the start so all our existing date-range queries (current/past trips,
  // schedule day grouping) keep working without special-casing on kind.
  const singleDay = kind === 'outing' || kind === 'match';
  const endDate = singleDay ? startDate : parseDate(formData.get('endDate'));
  if (startDate && endDate && endDate < startDate) {
    throw new Error('End date must be on or after the start date.');
  }
  const description = trim(formData.get('description'));
  const imageUrl = trim(formData.get('imageUrl'));

  const team1Name = trim(formData.get('team1Name')) ?? 'Team A';
  const team1Color = readColor(formData.get('team1Color'), '#16a34a');
  const team2Name = trim(formData.get('team2Name')) ?? 'Team B';
  const team2Color = readColor(formData.get('team2Color'), '#eab308');

  // Single-day kinds picked their course in the wizard's Course step, so
  // round 1 is created on it here — a match never touches rounds
  // plumbing and an outing starts with its first round in place.
  const rawFormat = trim(formData.get('roundFormat'));
  await provisionTrip({
    creator: {
      id: ctx.user.id,
      email: ctx.user.email,
      displayName: ctx.user.displayName,
      fullName: ctx.user.fullName,
    },
    name,
    kind,
    slug,
    startDate,
    endDate,
    description,
    imageUrl,
    teamA: { name: team1Name, color: team1Color },
    teamB: { name: team2Name, color: team2Color },
    courseId: singleDay ? trim(formData.get('courseId')) : null,
    roundFormat: isRoundFormat(rawFormat) ? rawFormat : null,
  });

  revalidatePath('/home');
  // Optional override so the event-creation wizard can land the admin on
  // its own next step instead of the classic admin/players page. Absent
  // for every existing caller — default behavior is unchanged.
  // The wizard can't know the final slug (it may have been suffixed), so
  // it asks for its next step by name and the redirect is built HERE from
  // the slug that actually exists. A client-computed path 404'd the moment
  // the server changed the slug.
  if (trim(formData.get('next')) === 'setup-players') {
    redirect(`/trips/${slug}/setup/players`);
  }
  const dest = resolveRedirect(formData, `/trips/${slug}/admin/players`);
  if (dest) redirect(dest);
}

export async function updateTrip(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [existing] = await db
    .select()
    .from(trips)
    .where(eq(trips.id, id))
    .limit(1);
  if (!existing) throw new Error('Trip not found');

  // Scope auth to THIS trip — global getAuthContext can't tell if the caller's
  // trip_admin role is for this trip or some other one.
  const ctx = await getTripAuthContext(id);
  if (!ctx) throw new AuthorizationError('Authentication required');
  if (!canEditTrip(ctx, id)) {
    throw new AuthorizationError('Trip admin required');
  }

  const name = trim(formData.get('name'));
  if (!name) throw new Error('Trip name is required');

  const startDate = parseDate(formData.get('startDate'));
  const endDate = parseDate(formData.get('endDate'));
  if (startDate && endDate && endDate < startDate) {
    throw new Error('End date must be on or after the start date.');
  }
  const description = trim(formData.get('description'));
  const imageUrl = trim(formData.get('imageUrl'));

  const methodRaw = trim(formData.get('defaultHandicapMethod'));
  const defaultHandicapMethod: 'group_low' | 'match_low' | 'course' =
    methodRaw === 'match_low' || methodRaw === 'course'
      ? methodRaw
      : 'group_low';

  // Kind is editable post-creation (it only drives how the cup tab
  // renders — no data depends on it). Absent from the form → unchanged.
  const kindRaw = trim(formData.get('kind'));
  const kind: 'trip' | 'outing' | 'match' =
    kindRaw === 'outing' || kindRaw === 'match'
      ? kindRaw
      : kindRaw === 'trip'
        ? 'trip'
        : existing.kind;

  await db
    .update(trips)
    .set({ name, kind, startDate, endDate, description, imageUrl, defaultHandicapMethod })
    .where(eq(trips.id, id));

  revalidatePath('/home');
  revalidatePath(`/trips/${existing.slug}`, 'layout');
  redirect(`/trips/${existing.slug}/setup/details`);
}

/**
 * Archive: hide the event from home without deleting anything — scores,
 * roster and history all stay, and unarchive restores it as it was.
 * Allowed for the trip's admins (the creator is one) and platform admins.
 */
export async function archiveTrip(formData: FormData): Promise<void> {
  await setArchived(formData, new Date());
  redirect('/home');
}

export async function unarchiveTrip(formData: FormData): Promise<void> {
  await setArchived(formData, null);
}

async function setArchived(formData: FormData, value: Date | null): Promise<void> {
  const id = trim(formData.get('tripId'));
  if (!id) throw new Error('tripId required');

  const ctx = await getTripAuthContext(id);
  requireAuth(ctx);
  if (!canEditTrip(ctx, id)) {
    throw new AuthorizationError('Trip admin required');
  }

  await db
    .update(trips)
    .set({ archivedAt: value })
    .where(eq(trips.id, id));

  const tripSlug = await getTripSlugById(id);
  revalidatePath('/home');
  revalidatePath(`/trips/${tripSlug}`, 'layout');
}
