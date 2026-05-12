'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, tripMembers } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError, canEditTripMember, requireAuth } from '@/lib/auth/permissions';

// Trip is in EDT (-04:00) in August. Wall-time string → UTC.
const TRIP_TZ_OFFSET = '-04:00';

function parseFlightTime(v: FormDataEntryValue | null): Date | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(`${s}:00${TRIP_TZ_OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid flight time');
  return d;
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseHandicap(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n)) {
    throw new Error('Handicap must be a number');
  }
  if (n < -10 || n > 54) {
    throw new Error('Handicap must be between -10 and 54');
  }
  return n.toFixed(1);
}

export async function updateMyProfile(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  requireAuth(ctx);

  if (!ctx.tripMember) {
    throw new AuthorizationError('You are not on this trip\'s roster');
  }

  if (!canEditTripMember(ctx, ctx.tripMember)) {
    throw new AuthorizationError('You cannot edit this profile');
  }

  const fullName = trimOrNull(formData.get('fullName'));
  const avatarUrl = trimOrNull(formData.get('avatarUrl'));
  const ghinNumber = trimOrNull(formData.get('ghinNumber'));
  const tripHandicap = parseHandicap(formData.get('tripHandicap'));
  const flightArrivalAt = parseFlightTime(formData.get('flightArrivalAt'));
  const flightArrivalDetails = trimOrNull(formData.get('flightArrivalDetails'));
  const flightDepartureAt = parseFlightTime(formData.get('flightDepartureAt'));
  const flightDepartureDetails = trimOrNull(formData.get('flightDepartureDetails'));

  await db
    .update(users)
    .set({
      fullName,
      ghinNumber,
      updatedAt: new Date(),
    })
    .where(eq(users.id, ctx.user.id));

  await db
    .update(tripMembers)
    .set({
      tripHandicap,
      avatarUrl,
      flightArrivalAt,
      flightArrivalDetails,
      flightDepartureAt,
      flightDepartureDetails,
    })
    .where(eq(tripMembers.id, ctx.tripMember.id));

  revalidatePath('/me');
  redirect('/me');
}
