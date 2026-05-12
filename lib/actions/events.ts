'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripEvents } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import type { AuthContext } from '@/lib/auth/current-user';

type EventType =
  | 'flight'
  | 'shuttle'
  | 'meal'
  | 'social'
  | 'hotel_checkin'
  | 'hotel_checkout'
  | 'other';

const EVENT_TYPES: ReadonlySet<EventType> = new Set([
  'flight',
  'shuttle',
  'meal',
  'social',
  'hotel_checkin',
  'hotel_checkout',
  'other',
]);

// Trip is in Eastern Time (DST → EDT/-04:00 in Aug). For trips outside DST,
// revisit this; for the 2026 Pinehurst trip it's correct as a constant.
const TRIP_TZ_OFFSET = '-04:00';

function requireEventAdmin(ctx: AuthContext, tripId: string): void {
  if (isPlatformAdmin(ctx)) return;
  if (isTripAdminOf(ctx, tripId)) return;
  throw new AuthorizationError('Trip admin required to edit the schedule');
}

function parseWallTime(s: FormDataEntryValue | null): Date | null {
  if (s == null) return null;
  const raw = String(s).trim();
  if (!raw) return null;
  const d = new Date(`${raw}:00${TRIP_TZ_OFFSET}`);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date/time');
  }
  return d;
}

function trimOrNull(s: FormDataEntryValue | null): string | null {
  if (s == null) return null;
  const v = String(s).trim();
  return v.length ? v : null;
}

function readType(s: FormDataEntryValue | null): EventType {
  const v = String(s ?? '').trim();
  if (!EVENT_TYPES.has(v as EventType)) {
    throw new Error('Invalid event type');
  }
  return v as EventType;
}

export async function createEvent(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripId = String(formData.get('tripId') ?? '').trim();
  if (!tripId) throw new Error('tripId required');
  requireEventAdmin(ctx, tripId);

  const title = String(formData.get('title') ?? '').trim();
  if (!title) throw new Error('Title is required');

  const startTime = parseWallTime(formData.get('startTime'));
  if (!startTime) throw new Error('Start time is required');

  await db.insert(tripEvents).values({
    tripId,
    type: readType(formData.get('type')),
    title,
    description: trimOrNull(formData.get('description')),
    location: trimOrNull(formData.get('location')),
    address: trimOrNull(formData.get('address')),
    startTime,
    endTime: parseWallTime(formData.get('endTime')),
  });

  revalidatePath('/schedule');
  redirect('/schedule');
}

export async function updateEvent(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [existing] = await db
    .select()
    .from(tripEvents)
    .where(eq(tripEvents.id, id))
    .limit(1);
  if (!existing) throw new Error('Event not found');

  requireEventAdmin(ctx, existing.tripId);

  const title = String(formData.get('title') ?? '').trim();
  if (!title) throw new Error('Title is required');

  const startTime = parseWallTime(formData.get('startTime'));
  if (!startTime) throw new Error('Start time is required');

  await db
    .update(tripEvents)
    .set({
      type: readType(formData.get('type')),
      title,
      description: trimOrNull(formData.get('description')),
      location: trimOrNull(formData.get('location')),
      address: trimOrNull(formData.get('address')),
      startTime,
      endTime: parseWallTime(formData.get('endTime')),
      updatedAt: new Date(),
    })
    .where(eq(tripEvents.id, id));

  revalidatePath('/schedule');
  revalidatePath(`/events/${id}`);
  redirect(`/events/${id}`);
}

export async function deleteEvent(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  const [existing] = await db
    .select()
    .from(tripEvents)
    .where(eq(tripEvents.id, id))
    .limit(1);
  if (!existing) throw new Error('Event not found');

  requireEventAdmin(ctx, existing.tripId);

  await db.delete(tripEvents).where(eq(tripEvents.id, id));

  revalidatePath('/schedule');
  redirect('/schedule');
}
