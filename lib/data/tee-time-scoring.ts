/**
 * Tee-time-keyed score-entry data loader.
 *
 * Step 3 of docs/match-template-spec.md — the new route at
 * /trips/[slug]/tee-times/[id]/score replaces the match-keyed entry
 * surface. For now this proxies through the existing match-scoring
 * loader (resolves teeTimeId → widest match in that tee time) so the
 * UI ships behind a stable interface without disturbing the legacy
 * read path. Step 4 replaces this with a real foursome-roster loader.
 *
 * Picking the widest match is deliberate: when a tee time has stacked
 * matches (e.g. a 2v2 best ball + a 1v1 singles side bet), the widest
 * match includes every player who needs to enter a score for the group.
 * Fan-out (lib/actions/scores.ts) propagates each gross to the other
 * stacked matches automatically, so we only need to surface one.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { matches, matchParticipants, teeTimes } from '@/db/schema';
import {
  getMatchScoringData,
  type MatchScoringData,
} from '@/lib/data/match-scoring';

export type TeeTimeScoringData = MatchScoringData & {
  /** The tee time the scorecard is keyed by. Same value as data.teeTime — re-exposed so callers don't have to null-check the legacy field. */
  resolvedTeeTimeId: string;
};

export async function getTeeTimeScoringData(
  teeTimeId: string,
): Promise<TeeTimeScoringData | null> {
  const [teeTime] = await db
    .select()
    .from(teeTimes)
    .where(eq(teeTimes.id, teeTimeId))
    .limit(1);
  if (!teeTime) return null;

  // Widest match wins — most participants = covers every player in the
  // group. Tie-break on match.id for stable ordering across reads.
  const candidates = await db
    .select({
      matchId: matches.id,
      participantCount: matchParticipants.tripMemberId,
    })
    .from(matches)
    .leftJoin(
      matchParticipants,
      eq(matchParticipants.matchId, matches.id),
    )
    .where(eq(matches.teeTimeId, teeTimeId));

  const counts = new Map<string, number>();
  for (const row of candidates) {
    counts.set(row.matchId, (counts.get(row.matchId) ?? 0) + (row.participantCount ? 1 : 0));
  }
  const widestMatchId = [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : 1;
    })[0]?.[0];

  if (!widestMatchId) return null;

  const data = await getMatchScoringData(widestMatchId);
  if (!data) return null;

  return {
    ...data,
    resolvedTeeTimeId: teeTimeId,
  };
}
