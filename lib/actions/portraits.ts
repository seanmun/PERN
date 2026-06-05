'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers, users } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { generateArcadePortrait } from '@/lib/portraits/generate';

/**
 * Generate the calling user's arcade portrait from a source photo URL.
 * Source URL must already be hosted somewhere the OpenAI fetch can reach
 * (Vercel Blob, etc.) — the client passes whichever photo it's showing the
 * user right now (typically their current tripMember.avatarUrl).
 *
 * Stored at the user level (platform-wide). The same portrait shows on
 * every trip the user joins.
 */
export async function generateMyArcadePortrait(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();
  if (!sourceUrl) {
    throw new Error(
      'Upload a profile photo first — we need a source image to generate from.',
    );
  }

  const result = await generateArcadePortrait(sourceUrl);
  if (!result) {
    throw new Error(
      'Portrait generation failed. Try again in a minute, or use a clearer source photo.',
    );
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
): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripMemberId = String(formData.get('tripMemberId') ?? '').trim();
  if (!tripMemberId) throw new Error('tripMemberId required');

  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();
  if (!sourceUrl) {
    throw new Error(
      "Upload a profile photo for this player first — we need a source image to generate from.",
    );
  }

  const [member] = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.id, tripMemberId))
    .limit(1);
  if (!member) throw new Error('Player not found');

  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, member.tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  if (!member.userId) {
    throw new Error(
      "This player hasn't claimed their slot yet — they need to sign in once before a portrait can be saved to their account.",
    );
  }

  const result = await generateArcadePortrait(sourceUrl);
  if (!result) {
    throw new Error(
      'Portrait generation failed. Try again in a minute, or use a clearer source photo.',
    );
  }

  await db
    .update(users)
    .set({
      arcadePortraitUrl: result.url,
      arcadePortraitSourceUrl: sourceUrl,
      arcadePortraitGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, member.userId));

  const redirectTo = String(formData.get('redirectTo') ?? '').trim();
  if (redirectTo) revalidatePath(redirectTo);
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
