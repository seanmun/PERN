import 'server-only';
import { cache } from 'react';
import { and, eq, sql } from 'drizzle-orm';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/db/client';
import { trips, tripMembers, users } from '@/db/schema';
import { deriveUniqueUsername } from './username';
import { clerkEmails } from './clerk-emails';
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
 * Trip-scoped auth context. Unlike getGlobalAuthContext() (which returns the user's
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

    const allEmails = clerkEmails(clerkUser);
    const email = allEmails[0];
    if (!email) throw new Error('Clerk user has no email address');

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
        // Invited users land here FIRST (the invite email deep-links to
        // /trips/[slug]/schedule), so this creation path needs the same
        // username derivation + insert-race hardening as
        // getGlobalAuthContext — not a stripped-down copy.
        const username = await deriveUniqueUsername(email);
        [user] = await db
          .insert(users)
          .values({
            clerkId: clerkUserId,
            email,
            username,
            fullName: clerkUser.fullName ?? null,
            avatarUrl: clerkUser.imageUrl ?? null,
          })
          .onConflictDoNothing()
          .returning();
        if (!user) {
          [user] = await db
            .select()
            .from(users)
            .where(eq(users.clerkId, clerkUserId))
            .limit(1);
        }
        if (!user) {
          throw new Error('Could not create or find user row for this account');
        }
      }
    }

    // Sync users.email with the current Clerk primary — see
    // getGlobalAuthContext for why (explicit claim flows compare
    // against this column). Skipped on unique conflict.
    if (user.email.toLowerCase() !== email) {
      const [conflict] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email} AND ${users.id} <> ${user.id}`)
        .limit(1);
      if (!conflict) {
        [user] = await db
          .update(users)
          .set({ email, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
      }
    }

    // Membership by the durable userId link FIRST. Looking up by email
    // (the old behavior) locked claimed members out of their own trip
    // the moment the row's email drifted from their Clerk address —
    // e.g. the user changed emails, or an admin corrected the member
    // email after the claim.
    let [tripMember] = await db
      .select()
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
      .limit(1);

    // Fallback: unclaimed row matching any of the account's emails —
    // lazy-claim it now. (Matching all addresses, not just primary,
    // covers admins who added the user under a secondary email.)
    if (!tripMember) {
      const emailList = sql.join(
        allEmails.map((e) => sql`${e}`),
        sql`, `,
      );
      const [unclaimed] = await db
        .select()
        .from(tripMembers)
        .where(
          sql`${tripMembers.tripId} = ${tripId} AND lower(${tripMembers.email}) IN (${emailList}) AND ${tripMembers.userId} IS NULL`,
        )
        .limit(1);
      if (unclaimed) {
        [tripMember] = await db
          .update(tripMembers)
          .set({ userId: user.id })
          .where(eq(tripMembers.id, unclaimed.id))
          .returning();
      }
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
