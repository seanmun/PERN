'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError } from '@/lib/auth/permissions';
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
