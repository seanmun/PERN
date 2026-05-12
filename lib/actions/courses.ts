'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { courses, trips, rounds } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';

export async function updateCourse(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('id required');

  // Authz: a course is global (no tripId), so we gate on any-trip-admin OR platform-admin.
  // In v1 there's a single trip, so this is effectively "this trip's admin or platform admin."
  const [trip] = await db.select().from(trips).limit(1);
  if (!trip) throw new Error('No trip configured');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, trip.id)) {
    throw new AuthorizationError('Trip admin required');
  }

  const trim = (v: FormDataEntryValue | null): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Name is required');

  await db
    .update(courses)
    .set({
      name,
      location: trim(formData.get('location')),
      imageUrl: trim(formData.get('imageUrl')),
    })
    .where(eq(courses.id, id));

  // Course changes can affect any round, so revalidate the schedule + any match.
  revalidatePath('/schedule');
  revalidatePath('/admin/courses');
  redirect('/admin/courses');
}
