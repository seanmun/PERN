/**
 * "Buddies" — anyone the current user has been a match participant
 * with, ranked by how often. Derived from existing data (no new table)
 * so signing up doesn't create empty state; the list grows organically
 * as you play.
 *
 * Used by the players-admin page so building rosters for a new trip is
 * one tap per buddy instead of re-typing nicknames + emails.
 */

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matchParticipants,
  tripMembers,
  users,
} from '@/db/schema';

export type Buddy = {
  userId: string;
  displayName: string | null;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  arcadePortraitUrl: string | null;
  /** Most-recent nickname this buddy used across any trip — pre-fills the
   * "Add player" form so admin doesn't have to remember it. */
  recentNickname: string;
  /** Last trip-handicap value we have for them — also pre-filled. */
  recentHandicap: string | null;
  matchesPlayedTogether: number;
};

/**
 * Buddies of `currentUserId`, ranked by overlap count.
 *
 * Optional `excludeUserIds` filters out users already on the current
 * trip (their user_ids) so the chip list only shows people not yet
 * added.
 */
export async function getBuddies(
  currentUserId: string,
  excludeUserIds: string[] = [],
): Promise<Buddy[]> {
  // First, every trip_member row tied to the current user.
  const myMemberships = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(eq(tripMembers.userId, currentUserId));
  const myMemberIds = myMemberships.map((m) => m.id);
  if (myMemberIds.length === 0) return [];

  // Match IDs the current user has been a participant in.
  const myMatchRows = await db
    .select({ matchId: matchParticipants.matchId })
    .from(matchParticipants)
    .where(inArray(matchParticipants.tripMemberId, myMemberIds));
  const myMatchIds = Array.from(new Set(myMatchRows.map((r) => r.matchId)));
  if (myMatchIds.length === 0) return [];

  // Other participants of those matches, grouped by their user_id.
  // matches_played_together = how many shared matches per other user.
  // We aggregate at the user level so the same buddy with multiple
  // trip_member rows (different trips) rolls up into one chip.
  const candidates = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      fullName: users.fullName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      arcadePortraitUrl: users.arcadePortraitUrl,
      matchesPlayedTogether: sql<number>`COUNT(DISTINCT ${matchParticipants.matchId})::int`,
    })
    .from(matchParticipants)
    .innerJoin(tripMembers, eq(tripMembers.id, matchParticipants.tripMemberId))
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(
      and(
        inArray(matchParticipants.matchId, myMatchIds),
        ne(users.id, currentUserId),
      ),
    )
    .groupBy(
      users.id,
      users.displayName,
      users.fullName,
      users.email,
      users.avatarUrl,
      users.arcadePortraitUrl,
    );

  // Pull the most recent nickname + handicap per buddy from any
  // trip_member row of theirs. Quick second query keeps the main one
  // grouped without needing a window function.
  const buddyUserIds = candidates.map((c) => c.userId);
  const recentByUser = new Map<
    string,
    { nickname: string; handicap: string | null }
  >();
  if (buddyUserIds.length) {
    const memberRows = await db
      .select({
        userId: tripMembers.userId,
        nickname: tripMembers.nickname,
        tripHandicap: tripMembers.tripHandicap,
      })
      .from(tripMembers)
      .where(inArray(tripMembers.userId, buddyUserIds));
    for (const r of memberRows) {
      if (!r.userId) continue;
      const existing = recentByUser.get(r.userId);
      if (!existing) {
        recentByUser.set(r.userId, {
          nickname: r.nickname,
          handicap: r.tripHandicap,
        });
      } else if (!existing.handicap && r.tripHandicap) {
        // Prefer any row with a handicap set over one without.
        recentByUser.set(r.userId, {
          nickname: existing.nickname,
          handicap: r.tripHandicap,
        });
      }
    }
  }

  const excludeSet = new Set(excludeUserIds);
  return candidates
    .filter((c) => !excludeSet.has(c.userId))
    .map((c) => ({
      userId: c.userId,
      displayName: c.displayName,
      fullName: c.fullName,
      email: c.email,
      avatarUrl: c.avatarUrl,
      arcadePortraitUrl: c.arcadePortraitUrl,
      recentNickname:
        recentByUser.get(c.userId)?.nickname ??
        c.displayName ??
        c.fullName ??
        c.email.split('@')[0],
      recentHandicap: recentByUser.get(c.userId)?.handicap ?? null,
      matchesPlayedTogether: c.matchesPlayedTogether,
    }))
    .sort(
      (a, b) =>
        b.matchesPlayedTogether - a.matchesPlayedTogether ||
        a.recentNickname.localeCompare(b.recentNickname),
    );
}
