'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { courseFavorites } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError } from '@/lib/auth/permissions';

/**
 * Toggle a starred course for the signed-in user. Favorites are personal
 * and platform-level (keyed to users, not trip_members), so any signed-in
 * user can star any course — no admin gate.
 *
 * Returns the new state so client star buttons can settle without a
 * round-trip re-fetch.
 */
export async function toggleCourseFavorite(
  courseId: string,
  revalidate?: string,
): Promise<{ favorited: boolean }> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');
  if (!courseId) throw new Error('courseId required');

  const [existing] = await db
    .select({ id: courseFavorites.id })
    .from(courseFavorites)
    .where(
      and(
        eq(courseFavorites.userId, ctx.user.id),
        eq(courseFavorites.courseId, courseId),
      ),
    )
    .limit(1);

  let favorited: boolean;
  if (existing) {
    await db.delete(courseFavorites).where(eq(courseFavorites.id, existing.id));
    favorited = false;
  } else {
    // Racing double-taps hit the (user, course) unique constraint; treat
    // "already starred" as success.
    await db
      .insert(courseFavorites)
      .values({ userId: ctx.user.id, courseId })
      .onConflictDoNothing();
    favorited = true;
  }

  if (revalidate) revalidatePath(revalidate);
  return { favorited };
}
