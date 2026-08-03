/**
 * Read-only inventory of every trip, with enough signal to tell a real
 * event from a throwaway test one. Writes nothing.
 *
 *   npx tsx --env-file=.env.local scripts/list-trips.ts
 */

import { db } from '../db/client';
import {
  matchParticipants,
  matches,
  rounds,
  teeTimes,
  tripMembers,
  trips,
  holeScores,
} from '../db/schema';
import { eq, inArray, sql } from 'drizzle-orm';

async function main() {
  const all = await db
    .select()
    .from(trips)
    .orderBy(trips.createdAt ?? trips.name);

  console.log(`\n${all.length} trips total\n`);

  for (const t of all) {
    const [memberCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tripMembers)
      .where(eq(tripMembers.tripId, t.id));

    const roundRows = await db
      .select({ id: rounds.id })
      .from(rounds)
      .where(eq(rounds.tripId, t.id));
    const roundIds = roundRows.map((r) => r.id);

    const matchRows = roundIds.length
      ? await db
          .select({ id: matches.id })
          .from(matches)
          .where(inArray(matches.roundId, roundIds))
      : [];
    const matchIds = matchRows.map((m) => m.id);

    const [scoreCount] = matchIds.length
      ? await db
          .select({ n: sql<number>`count(*)::int` })
          .from(holeScores)
          .where(inArray(holeScores.matchId, matchIds))
      : [{ n: 0 }];

    console.log(
      [
        t.archivedAt ? '[ARCHIVED]' : '[ active ]',
        `${t.slug}`.padEnd(28),
        `${t.kind}`.padEnd(7),
        `${memberCount?.n ?? 0}p`.padStart(4),
        `${roundIds.length}r`.padStart(4),
        `${matchIds.length}m`.padStart(4),
        `${scoreCount?.n ?? 0} scores`.padStart(11),
        t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : 'no-date',
        `"${t.name}"`,
      ].join('  '),
    );
  }
  console.log('');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
