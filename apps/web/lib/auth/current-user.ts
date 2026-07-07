import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, tripMembers } from '@/db/schema';
import { deriveUniqueUsername } from './username';
import { clerkEmails } from './clerk-emails';

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

  // Emails are matched case-insensitively. Store new rows lowercase.
  // `email` is the primary; `allEmails` includes every address on the
  // Clerk account — claim flows match all of them.
  const allEmails = clerkEmails(clerkUser);
  const email = allEmails[0];
  if (!email) {
    throw new Error('Clerk user has no email address');
  }

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
      // onConflictDoNothing + reselect: a first sign-in fires several RSC
      // requests concurrently, and two of them can race this insert. The
      // loser used to 500 on the unique(clerk_id) violation.
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

  // Keep users.email in sync when the Clerk primary changes — claim
  // comparisons (claimTripMember, listClaimableSlots) key off this
  // column, so a stale value breaks explicit claims after an email
  // change. Skipped if another account already owns the new address
  // (users.email is unique) — better a stale email than a 500.
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

  // Claim every unclaimed tripMember row matching ANY of this account's
  // emails — a user might be on multiple trips by the time they sign in
  // for the first time, and the admin may have used a secondary address
  // (work vs personal) when adding them.
  const emailList = sql.join(
    allEmails.map((e) => sql`${e}`),
    sql`, `,
  );
  await db
    .update(tripMembers)
    .set({ userId: user.id })
    .where(
      sql`lower(${tripMembers.email}) IN (${emailList}) AND ${tripMembers.userId} IS NULL`,
    );

  // Fetch a tripMember for the current auth context — by userId, NOT by
  // email. Claimed rows survive email drift (user changes their Clerk
  // address, or an admin edits the member email) only if this lookup
  // keys off the durable link. With multiple memberships, pick any —
  // callers that need a specific trip use getTripAuthContext(tripId).
  const [tripMember] = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.userId, user.id))
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
