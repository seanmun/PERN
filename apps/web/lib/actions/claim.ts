'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { clerkEmails } from '@/lib/auth/clerk-emails';
import { AuthorizationError } from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';

/** Every email we'll accept as proof of ownership for a claim: all the
 * addresses on the Clerk account, plus the users-row email as a fallback
 * (covers the moment right after an email change before sync). */
async function claimantEmails(ctxEmail: string): Promise<string[]> {
  const clerkUser = await currentUser();
  const all = clerkUser ? clerkEmails(clerkUser) : [];
  return Array.from(new Set([...all, ctxEmail.toLowerCase()]));
}

/**
 * Explicit claim of a specific tripMember by id. The row's email must match
 * one of the calling user's emails (case-insensitive) — that's the security
 * check.
 *
 * Used when getGlobalAuthContext's lazy-claim missed a row (e.g. an admin set the
 * email AFTER the user's first sign-in, so the auto-claim never re-ran).
 */
export async function claimTripMember(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const tripMemberId = String(formData.get('tripMemberId') ?? '').trim();
  if (!tripMemberId) throw new Error('tripMemberId required');

  const [member] = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.id, tripMemberId))
    .limit(1);
  if (!member) throw new Error('Trip slot not found.');
  if (member.userId) throw new Error('That slot is already claimed.');
  if (!member.email) {
    throw new Error(
      "This slot has no email — ask the trip admin to set yours so you can claim it.",
    );
  }

  const myEmails = await claimantEmails(ctx.user.email);
  if (!myEmails.includes(member.email.toLowerCase())) {
    throw new AuthorizationError(
      "This slot's email doesn't match your account. Ask the trip admin to update it.",
    );
  }

  await db
    .update(tripMembers)
    .set({ userId: ctx.user.id })
    .where(eq(tripMembers.id, member.id));

  const tripSlug = await getTripSlugById(member.tripId);
  revalidatePath('/home');
  revalidatePath(`/trips/${tripSlug}`, 'layout');
}

export type ClaimableSlot = {
  tripMemberId: string;
  tripId: string;
  tripSlug: string;
  tripName: string;
  nickname: string;
};

/**
 * List every tripMember row matching any of the user's emails that hasn't
 * been claimed yet (userId IS NULL). The standard lazy-claim already claims
 * these on sign-in — this is a belt-and-suspenders read for the /me page
 * so we can render a "claim missed slot" CTA if any slip through.
 */
export async function listClaimableSlots(): Promise<ClaimableSlot[]> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) return [];

  const myEmails = await claimantEmails(ctx.user.email);
  const emailList = sql.join(
    myEmails.map((e) => sql`${e}`),
    sql`, `,
  );
  const rows = await db
    .select({
      tripMemberId: tripMembers.id,
      tripId: tripMembers.tripId,
      nickname: tripMembers.nickname,
      tripSlug: sql<string>`(SELECT slug FROM trips WHERE id = ${tripMembers.tripId})`,
      tripName: sql<string>`(SELECT name FROM trips WHERE id = ${tripMembers.tripId})`,
    })
    .from(tripMembers)
    .where(
      sql`lower(${tripMembers.email}) IN (${emailList}) AND ${tripMembers.userId} IS NULL`,
    );
  return rows;
}
