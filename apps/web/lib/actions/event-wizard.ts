'use server';

/**
 * Small reads/writes that are genuinely new for the event-creation
 * wizard — everything else in the wizard reuses existing actions
 * (see lib/actions/wizard-redirect.ts for how those stay on their own
 * step page instead of navigating away).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trips, tripMembers } from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import { AuthorizationError, isPlatformAdmin, isTripAdminOf } from '@/lib/auth/permissions';
import { searchPlatformUsers, type Buddy } from '@/lib/data/buddies';

/**
 * Type-ahead search for the Players step — every platform user, not
 * just buddies. Server Action invoked directly from client code
 * (no <form>, no FormData) since it's a read, not a mutation.
 */
export async function searchWizardPlayers(
  tripId: string,
  query: string,
): Promise<Buddy[]> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');
  if (!isPlatformAdmin(ctx) && !isTripAdminOf(ctx, tripId)) {
    throw new AuthorizationError('Trip admin required');
  }

  const [trip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new Error('Trip not found');

  const existing = await db
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  const excludeUserIds = existing
    .map((m) => m.userId)
    .filter((id): id is string => !!id);

  return searchPlatformUsers(query, excludeUserIds);
}
