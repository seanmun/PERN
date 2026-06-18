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

// Reserved usernames — these collide with route segments or would be
// confusing/abusive if anyone could claim them.
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'me', 'api', 'new', 'edit', 'sign-in', 'sign-up',
  'trips', 'documentation', 'brand', 'privacy', 'cup', 'buddycup',
  'support', 'help', 'root', 'system',
]);

function parseUsername(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s.length < 3 || s.length > 20) {
    throw new Error('Username must be 3–20 characters.');
  }
  if (!/^[a-z0-9_-]+$/.test(s)) {
    throw new Error('Username can only use lowercase letters, numbers, hyphens, and underscores.');
  }
  if (RESERVED_USERNAMES.has(s)) {
    throw new Error(`"${s}" is reserved. Pick another.`);
  }
  return s;
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
  const username = parseUsername(formData.get('username'));
  const city = trim(formData.get('city'));
  const state = trim(formData.get('state'));
  const clubName = trim(formData.get('clubName'));

  try {
    await db
      .update(users)
      .set({
        fullName,
        ghinNumber,
        handicap,
        avatarUrl,
        username,
        city,
        state,
        clubName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));
  } catch (err) {
    // Surface the unique-constraint case so the user knows to pick another.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('users_username_unique') || msg.toLowerCase().includes('unique')) {
      throw new Error('That username is already taken.');
    }
    throw err;
  }

  revalidatePath('/me');
  redirect('/me');
}
