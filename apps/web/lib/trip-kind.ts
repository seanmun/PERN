/**
 * Event kind — derived from structure, never asked (§6.3).
 *
 *   one group, one round      → match
 *   2+ groups, one round      → outing
 *   2+ rounds                 → trip
 *
 * `trips.kind` used to be written once at creation and never revisited,
 * so the moment a round was added the column disagreed with the event it
 * described: a two-round trip still reporting `match`. This module is the
 * single place the rule lives, and `syncTripKind` re-derives the column
 * from the rows that actually determine it.
 *
 * The column survives because §12 keeps migrations additive and several
 * screens read it. It is now a cache of `deriveTripKind`, not an
 * independent fact — nothing should ever set `trips.kind` directly. When
 * §6.2's trip wrapper lands and the reader count is known, the honest end
 * state is to drop the column and derive at read time; that change touches
 * UI, so it is deliberately not made here.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { rounds, teeTimes, trips } from '@/db/schema';
import type { TripKind } from '@/lib/trip-provision';

/** Pure rule. The only definition of what makes an event a trip. */
export function deriveTripKind(input: {
  roundCount: number;
  /** Groups in the single round. Ignored when roundCount !== 1. */
  groupCount: number;
}): TripKind {
  if (input.roundCount > 1) return 'trip';
  return input.groupCount > 1 ? 'outing' : 'match';
}

/**
 * Re-derive `trips.kind` from the event's current rounds and groups.
 *
 * Call after anything that adds or removes a round or a group. Cheap
 * (two counts) and idempotent, so calling it more often than strictly
 * necessary is the safe failure mode.
 */
export async function syncTripKind(tripId: string): Promise<TripKind> {
  const roundRows = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(eq(rounds.tripId, tripId), eq(rounds.isHidden, false)));

  let groupCount = 0;
  if (roundRows.length === 1) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teeTimes)
      .where(eq(teeTimes.roundId, roundRows[0].id));
    groupCount = row?.n ?? 0;
  }

  const kind = deriveTripKind({ roundCount: roundRows.length, groupCount });
  await db.update(trips).set({ kind }).where(eq(trips.id, tripId));
  return kind;
}
