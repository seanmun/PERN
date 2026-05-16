import 'server-only';
import { cache } from 'react';
import { eq, sql } from 'drizzle-orm';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/db/client';
import { trips, tripMembers, users } from '@/db/schema';
import type { AuthContext } from './current-user';

export type Trip = typeof trips.$inferSelect;

export const getTripBySlug = cache(async (slug: string): Promise<Trip | null> => {
  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.slug, slug))
    .limit(1);
  return trip ?? null;
});

/**
 * Server-action helper. Looks up the slug for a trip ID so we can build
 * trip-scoped redirect/revalidate paths without threading the slug through
 * every form submission.
 */
export const getTripSlugById = cache(async (tripId: string): Promise<string> => {
  const [trip] = await db
    .select({ slug: trips.slug })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) throw new Error(`Trip ${tripId} not found`);
  return trip.slug;
});

/**
 * Trip-scoped auth context. Unlike getAuthContext() (which returns the user's
 * first matching tripMember), this returns the tripMember for the *given* trip
 * — or null if the user isn't on it. Platform admins still get null for
 * tripMember; their access flows through ctx.isPlatformAdmin in the cascade.
 */
export const getTripAuthContext = cache(
  async (tripId: string): Promise<AuthContext | null> => {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return null;

    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const emailRaw =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;
    if (!emailRaw) throw new Error('Clerk user has no email address');
    const email = emailRaw.toLowerCase();

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      const [existingByEmail] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);

      if (existingByEmail) {
        [user] = await db
          .update(users)
          .set({ clerkId: clerkUserId, email, updatedAt: new Date() })
          .where(eq(users.id, existingByEmail.id))
          .returning();
      } else {
        [user] = await db
          .insert(users)
          .values({
            clerkId: clerkUserId,
            email,
            fullName: clerkUser.fullName ?? null,
            avatarUrl: clerkUser.imageUrl ?? null,
          })
          .returning();
      }
    }

    let [tripMember] = await db
      .select()
      .from(tripMembers)
      .where(
        sql`${tripMembers.tripId} = ${tripId} AND lower(${tripMembers.email}) = ${email}`
      )
      .limit(1);

    if (tripMember && !tripMember.userId) {
      [tripMember] = await db
        .update(tripMembers)
        .set({ userId: user.id, email })
        .where(eq(tripMembers.id, tripMember.id))
        .returning();
    }

    const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    return {
      user,
      tripMember: tripMember ?? null,
      isPlatformAdmin: adminEmails.includes(email),
    };
  }
);
