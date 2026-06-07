'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError } from '@/lib/auth/permissions';

function trim(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseHandicap(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error('Handicap must be a number');
  if (n < -10 || n > 54) {
    throw new Error('Handicap must be between -10 and 54');
  }
  return n.toFixed(1);
}

/**
 * Update the platform-wide user profile. Distinct from updateMyProfile
 * which only touches the *trip-scoped* fields. The handicap saved here is
 * the user's "default" handicap — when they join a new trip, their trip
 * handicap is initialized from this value. Trip admins can override the
 * per-trip handicap without touching this field.
 */
export async function updateMyUserProfile(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const fullName = trim(formData.get('fullName'));
  const ghinNumber = trim(formData.get('ghinNumber'));
  const handicap = parseHandicap(formData.get('handicap'));
  const avatarUrl = trim(formData.get('avatarUrl'));

  await db
    .update(users)
    .set({
      fullName,
      ghinNumber,
      handicap,
      avatarUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, ctx.user.id));

  revalidatePath('/me');
  redirect('/me');
}
