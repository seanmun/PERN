'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, tripMembers } from '@/db/schema';
import { AuthorizationError, requireAuth } from '@/lib/auth/permissions';
import { getTripAuthContext, getTripSlugById } from '@/lib/auth/trip-context';

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseHandicap(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n)) {
    throw new Error('Handicap must be a number');
  }
  if (n < -10 || n > 54) {
    throw new Error('Handicap must be between -10 and 54');
  }
  return n.toFixed(1);
}

export async function updateMyProfile(formData: FormData): Promise<void> {
  // The trip whose roster row this edits MUST come from the form. Reading
  // it off a global auth context meant a user on more than one trip could
  // edit their profile on trip B and have the handicap/avatar land on
  // trip A's row — whichever membership the unordered lookup returned.
  const tripId = String(formData.get('tripId') ?? '').trim();
  if (!tripId) throw new Error('tripId required');

  const ctx = await getTripAuthContext(tripId);
  requireAuth(ctx);

  if (!ctx.tripMember) {
    throw new AuthorizationError('You are not on this trip\'s roster');
  }

  const fullName = trimOrNull(formData.get('fullName'));
  const avatarUrl = trimOrNull(formData.get('avatarUrl'));
  const ghinNumber = trimOrNull(formData.get('ghinNumber'));
  const tripHandicap = parseHandicap(formData.get('tripHandicap'));

  await db
    .update(users)
    .set({
      fullName,
      ghinNumber,
      updatedAt: new Date(),
    })
    .where(eq(users.id, ctx.user.id));

  await db
    .update(tripMembers)
    .set({
      tripHandicap,
      avatarUrl,
    })
    .where(eq(tripMembers.id, ctx.tripMember.id));

  const tripSlug = await getTripSlugById(ctx.tripMember.tripId);
  revalidatePath(`/trips/${tripSlug}/me`);
  redirect(`/trips/${tripSlug}/me`);
}
