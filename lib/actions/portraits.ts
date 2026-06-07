'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, users } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { generateArcadePortrait } from '@/lib/portraits/generate';
import type { PortraitActionResult } from '@/lib/portraits/types';

// PortraitActionResult lives in a separate types-only module because
// 'use server' files may only EXPORT async functions — exporting a type
// from this file made Next.js wrap action calls in the generic
// "Server Components render" error mask in production.

/**
 * Generate the calling user's arcade portrait from a source photo URL.
 * Source URL must already be hosted somewhere the OpenAI fetch can reach
 * (Vercel Blob, etc.) — the client passes whichever photo it's showing the
 * user right now (typically their current tripMember.avatarUrl).
 *
 * Stored at the user level (platform-wide). The same portrait shows on
 * every trip the user joins.
 */
export async function generateMyArcadePortrait(
  formData: FormData,
): Promise<PortraitActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { ok: false, error: 'You need to be signed in.' };

    const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();
    if (!sourceUrl) {
      return {
        ok: false,
        error: 'Upload a profile photo first — we need a source image to generate from.',
      };
    }

    const result = await generateArcadePortrait(sourceUrl);
    if (!result.ok) {
      return { ok: false, error: `[${result.reason}] ${result.detail}` };
    }

    await db
      .update(users)
      .set({
        arcadePortraitUrl: result.url,
        arcadePortraitSourceUrl: sourceUrl,
        arcadePortraitGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));

    const redirectTo = String(formData.get('redirectTo') ?? '').trim();
    if (redirectTo) revalidatePath(redirectTo);
    revalidatePath('/me');
    return { ok: true };
  } catch (err) {
    console.error('[portrait] generateMyArcadePortrait threw', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error.',
    };
  }
}

/**
 * Admin path: generate (or regenerate) an arcade portrait for some OTHER
 * trip member. Useful when the trip admin is prepping the roster before
 * players claim their slots — they upload a photo on the player's behalf
 * via the admin player-edit form, then hit Generate from the same screen.
 *
 * The portrait still lands on the `users` row (platform-wide), so the
 * target tripMember must already be linked to a user (lazy-claim done).
 */
export async function generateArcadePortraitForPlayer(
  formData: FormData,
): Promise<PortraitActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { ok: false, error: 'You need to be signed in.' };

    const tripMemberId = String(formData.get('tripMemberId') ?? '').trim();
    if (!tripMemberId) return { ok: false, error: 'Missing player id.' };

    const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();
    if (!sourceUrl) {
      return {
        ok: false,
        error: "Upload a profile photo for this player first — we need a source image to generate from.",
      };
    }

    const [member] = await db
      .select()
      .from(tripMembers)
      .where(eq(tripMembers.id, tripMemberId))
      .limit(1);
    if (!member) return { ok: false, error: 'Player not found.' };

    if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, member.tripId)) {
      return { ok: false, error: 'Trip admin required.' };
    }

    const userId = await ensurePortraitUser(member.id);

    const result = await generateArcadePortrait(sourceUrl);
    if (!result.ok) {
      return { ok: false, error: `[${result.reason}] ${result.detail}` };
    }

    await db
      .update(users)
      .set({
        arcadePortraitUrl: result.url,
        arcadePortraitSourceUrl: sourceUrl,
        arcadePortraitGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const redirectTo = String(formData.get('redirectTo') ?? '').trim();
    if (redirectTo) revalidatePath(redirectTo);
    return { ok: true };
  } catch (err) {
    console.error('[portrait] generateArcadePortraitForPlayer threw', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error.',
    };
  }
}

/**
 * Resolve (or create) the users row that owns this player's portrait. Used
 * by admin-side portrait actions so we can pre-bake portraits before the
 * player ever signs in.
 *
 * Cases:
 *  - tripMember.userId set: use it.
 *  - users row already exists for the email: link the tripMember and use it.
 *  - no users row: insert a stub (email only, null clerkId). On first
 *    sign-in, getAuthContext finds this row by email and attaches the
 *    clerkId via existing lazy-claim logic.
 */
async function ensurePortraitUser(tripMemberId: string): Promise<string> {
  const [member] = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.id, tripMemberId))
    .limit(1);
  if (!member) throw new Error('Player not found');

  if (member.userId) return member.userId;

  // Shell players (no email) can't be linked to a users row — users.email is
  // NOT NULL and unique. Admin needs to set the email first so we have a
  // stable key for the user row + lazy-claim later.
  if (!member.email) {
    throw new Error(
      "This player is a shell — set their email first so the portrait can attach to their (future) account.",
    );
  }

  const email = member.email.toLowerCase();

  let [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        fullName: member.nickname,
        avatarUrl: member.avatarUrl,
      })
      .returning();
  }

  await db
    .update(tripMembers)
    .set({ userId: user.id, email })
    .where(eq(tripMembers.id, member.id));

  return user.id;
}

export async function clearArcadePortraitForPlayer(
  formData: FormData,
): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripMemberId = String(formData.get('tripMemberId') ?? '').trim();
  if (!tripMemberId) throw new Error('tripMemberId required');

  const [member] = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.id, tripMemberId))
    .limit(1);
  if (!member) throw new Error('Player not found');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, member.tripId)) {
    throw new AuthorizationError('Trip admin required');
  }
  if (!member.userId) return;

  await db
    .update(users)
    .set({
      arcadePortraitUrl: null,
      arcadePortraitSourceUrl: null,
      arcadePortraitGeneratedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, member.userId));

  const redirectTo = String(formData.get('redirectTo') ?? '').trim();
  if (redirectTo) revalidatePath(redirectTo);
}

export async function clearMyArcadePortrait(): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  await db
    .update(users)
    .set({
      arcadePortraitUrl: null,
      arcadePortraitSourceUrl: null,
      arcadePortraitGeneratedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, ctx.user.id));

  revalidatePath('/me');
}
