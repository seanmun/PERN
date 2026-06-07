'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tripMembers } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError } from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';

/**
 * Explicit claim of a specific tripMember by id. The row's email must match
 * the calling user's email (case-insensitive) — that's the security check.
 *
 * Used when getAuthContext's lazy-claim missed a row (e.g. an admin set the
 * email AFTER the user's first sign-in, so the auto-claim never re-ran).
 */
export async function claimTripMember(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
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

  const userEmail = ctx.user.email.toLowerCase();
  if (member.email.toLowerCase() !== userEmail) {
    throw new AuthorizationError(
      "This slot's email doesn't match your account. Ask the trip admin to update it.",
    );
  }

  await db
    .update(tripMembers)
    .set({ userId: ctx.user.id, email: userEmail })
    .where(eq(tripMembers.id, member.id));

  const tripSlug = await getTripSlugById(member.tripId);
  revalidatePath('/me');
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
 * List every tripMember row matching the user's email that hasn't been
 * claimed yet (userId IS NULL). The standard lazy-claim already claims
 * these on sign-in — this is a belt-and-suspenders read for the /me page
 * so we can render a "claim missed slot" CTA if any slip through.
 */
export async function listClaimableSlots(): Promise<ClaimableSlot[]> {
  const ctx = await getAuthContext();
  if (!ctx) return [];

  const email = ctx.user.email.toLowerCase();
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
      sql`lower(${tripMembers.email}) = ${email} AND ${tripMembers.userId} IS NULL`,
    );
  return rows;
}
