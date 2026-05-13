// Idempotent: adds a "Round 0" used for live testing.
// - Friendly (does not count toward Cup)
// - Singles format with multiple 1v1 matches at the same tee time
//
// Run: npx tsx --env-file=.env.local scripts/add-round-0.ts

import { db } from '../db/client';
import {
  trips,
  courses,
  rounds,
  teeTimes,
  matches,
  matchParticipants,
  tripMembers,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';

const TEST_MATCHUPS: [string, string][] = [
  ['Munley', 'DS'],
  ['Ian', 'Lusty'],
  ['Andy', 'Marino'],
];

async function main() {
  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.slug, 'pinehurst-cup-2026'))
    .limit(1);
  if (!trip) throw new Error('Trip not found');

  // Skip if Round 0 already exists
  const [existing] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tripId, trip.id), eq(rounds.order, 0)))
    .limit(1);
  if (existing) {
    console.log('Round 0 already exists — skipping insert.');
    return;
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.name, 'Pinehurst No. 2'))
    .limit(1);
  if (!course) throw new Error('Pinehurst No. 2 course not found');

  const allMembers = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, trip.id));
  const byNickname = new Map(allMembers.map((m) => [m.nickname, m]));

  const matchups = TEST_MATCHUPS.map(([a, b]) => {
    const aMember = byNickname.get(a);
    const bMember = byNickname.get(b);
    if (!aMember || !bMember) {
      throw new Error(`Missing player: ${!aMember ? a : b}`);
    }
    if (!aMember.teamId || !bMember.teamId) {
      throw new Error(`Player has no team: ${!aMember.teamId ? a : b}`);
    }
    return { a: aMember, b: bMember };
  });

  const [round] = await db
    .insert(rounds)
    .values({
      tripId: trip.id,
      courseId: course.id,
      date: new Date('2026-05-12T00:00:00-04:00'),
      format: 'singles',
      order: 0,
      label: 'Round 0 — Test',
      countsTowardCup: false,
      isHidden: true,
    })
    .returning();

  const [teeTime] = await db
    .insert(teeTimes)
    .values({
      roundId: round.id,
      time: new Date('2026-05-12T10:00:00-04:00'),
      groupNumber: 1,
    })
    .returning();

  for (const m of matchups) {
    const [match] = await db
      .insert(matches)
      .values({
        roundId: round.id,
        teeTimeId: teeTime.id,
        status: 'scheduled',
      })
      .returning();

    await db.insert(matchParticipants).values([
      { matchId: match.id, tripMemberId: m.a.id, teamId: m.a.teamId! },
      { matchId: match.id, tripMemberId: m.b.id, teamId: m.b.teamId! },
    ]);

    console.log(`  ✓ ${m.a.nickname} (${m.a.tripHandicap}) vs ${m.b.nickname} (${m.b.tripHandicap})`);
  }

  console.log(`\n✓ Round 0 added with ${matchups.length} matchups.`);
  console.log(`   round.id = ${round.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
