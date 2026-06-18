import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, tripMembers } from '@/db/schema';
import { deriveUniqueUsername } from './username';

export type AuthContext = {
  user: typeof users.$inferSelect;
  tripMember: typeof tripMembers.$inferSelect | null;
  isPlatformAdmin: boolean;
};

export async function getGlobalAuthContext(): Promise<AuthContext | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const emailRaw = clerkUser.primaryEmailAddress?.emailAddress
    ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!emailRaw) {
    throw new Error('Clerk user has no email address');
  }
  // Emails are matched case-insensitively. Store new rows lowercase.
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
      // Auto-pick a username from the email's local part. Future @mentions /
      // social features assume every user has one; deriving up-front avoids
      // a null state. User can change it on /me whenever.
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
        .returning();
    }
  }

  // Backfill: if an existing user row predates the auto-username (or somehow
  // landed without one), assign one quietly on this sign-in.
  if (!user.username) {
    const username = await deriveUniqueUsername(email);
    [user] = await db
      .update(users)
      .set({ username, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
  }

  // Claim every unclaimed tripMember row matching this email — a user might
  // be on multiple trips by the time they sign in for the first time. The
  // single-row stitch only claimed one and silently left the rest dangling.
  await db
    .update(tripMembers)
    .set({ userId: user.id, email })
    .where(
      sql`lower(${tripMembers.email}) = ${email} AND ${tripMembers.userId} IS NULL`,
    );

  // Now fetch a tripMember for the current auth context. With multiple
  // memberships, pick any — callers that need a specific trip use
  // getTripAuthContext(tripId) instead. The "first by id" is arbitrary but
  // stable across requests.
  const [tripMember] = await db
    .select()
    .from(tripMembers)
    .where(sql`lower(${tripMembers.email}) = ${email}`)
    .limit(1);

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
