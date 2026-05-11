import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, tripMembers } from '@/db/schema';

export type AuthContext = {
  user: typeof users.$inferSelect;
  tripMember: typeof tripMembers.$inferSelect | null;
  isPlatformAdmin: boolean;
};

export async function getAuthContext(): Promise<AuthContext | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.primaryEmailAddress?.emailAddress
    ?? clerkUser.emailAddresses[0]?.emailAddress;
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
      .where(eq(users.email, email))
      .limit(1);

    if (existingByEmail) {
      [user] = await db
        .update(users)
        .set({ clerkId: clerkUserId, updatedAt: new Date() })
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
    .where(eq(tripMembers.email, email))
    .limit(1);

  if (tripMember && !tripMember.userId) {
    [tripMember] = await db
      .update(tripMembers)
      .set({ userId: user.id })
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
    isPlatformAdmin: adminEmails.includes(email.toLowerCase()),
  };
}
