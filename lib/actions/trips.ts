'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams, tripMembers, trips, users } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { getTripAuthContext } from '@/lib/auth/trip-context';
import { AuthorizationError, canEditTrip } from '@/lib/auth/permissions';
import { slugifyTripName } from '@/lib/slug';

const TRIP_TZ_OFFSET = '-04:00';

// Slugs that would collide with our route structure or other reserved paths.
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'new',
  'edit',
  'admin',
  'api',
  'me',
  'join',
  'sign-in',
  'sign-up',
  'privacy',
  'brand',
]);

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
  const d = new Date(`${s}T00:00:00${TRIP_TZ_OFFSET}`);
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

  const slugInput = trim(formData.get('slug')) ?? name;
  const slug = slugifyTripName(slugInput);
  if (!slug) throw new Error('Slug is required');
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`Slug "${slug}" is reserved. Pick a different one.`);
  }

  const [existing] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.slug, slug))
    .limit(1);
  if (existing) {
    throw new Error(`Slug "${slug}" is already taken.`);
  }

  const startDate = parseDate(formData.get('startDate'));
  const endDate = parseDate(formData.get('endDate'));
  if (startDate && endDate && endDate < startDate) {
    throw new Error('End date must be on or after the start date.');
  }
  const description = trim(formData.get('description'));
  const imageUrl = trim(formData.get('imageUrl'));

  const team1Name = trim(formData.get('team1Name')) ?? 'Team A';
  const team1Color = readColor(formData.get('team1Color'), '#16a34a');
  const team2Name = trim(formData.get('team2Name')) ?? 'Team B';
  const team2Color = readColor(formData.get('team2Color'), '#eab308');

  const [trip] = await db
    .insert(trips)
    .values({
      slug,
      name,
      startDate,
      endDate,
      description,
      imageUrl,
      createdBy: ctx.user.id,
    })
    .returning();

  await db.insert(teams).values([
    { tripId: trip.id, name: team1Name, color: team1Color },
    { tripId: trip.id, name: team2Name, color: team2Color },
  ]);

  const creatorEmail = ctx.user.email.toLowerCase();
  const creatorNickname =
    ctx.user.displayName ??
    ctx.user.fullName ??
    creatorEmail.split('@')[0];
  await db.insert(tripMembers).values({
    tripId: trip.id,
    userId: ctx.user.id,
    email: creatorEmail,
    nickname: creatorNickname,
    role: 'trip_admin',
    isCaptain: false,
  });

  await db
    .update(users)
    .set({ defaultTripId: trip.id, updatedAt: new Date() })
    .where(eq(users.id, ctx.user.id));

  revalidatePath('/me');
  redirect(`/trips/${slug}/admin/players`);
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

  await db
    .update(trips)
    .set({ name, startDate, endDate, description, imageUrl })
    .where(eq(trips.id, id));

  revalidatePath('/me');
  revalidatePath(`/trips/${existing.slug}`, 'layout');
  redirect(`/trips/${existing.slug}/admin/details`);
}
