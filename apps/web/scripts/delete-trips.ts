/**
 * Delete an explicit list of trips and everything under them.
 *
 * Slugs are hardcoded below — approved by the owner on 2026-07-30. The
 * script refuses to touch anything not in the list.
 *
 * Deletes children explicitly, deepest first, rather than relying on
 * cascade: match_participants.trip_member_id and hole_scores.trip_member_id
 * have no ON DELETE CASCADE, and media.match_id / media.round_id don't
 * either, so a bare `DELETE FROM trips` can trip an FK violation.
 *
 * Runs one trip at a time and stops on the first error.
 *
 *   npx tsx --env-file=.env.local scripts/delete-trips.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/delete-trips.ts --commit # for real
 */

import { db } from '../db/client';
import {
  bbbHolePoints,
  holeScores,
  matchParticipants,
  matches,
  media,
  messages,
  rounds,
  teeTimeParticipants,
  teeTimes,
  teams,
  tripEvents,
  tripInvites,
  tripMembers,
  trips,
} from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

const SLUGS = [
  'testing',
  'rivercrest-test',
  'testing-form',
  'ravens-claw',
  '30-ball-test',
  'curry-test',
  'claude-verify-test',
  'curry-ball',
  'claude-30ball-repro',
  '30-ball-curry',
  'claude-30ball-clean',
  'claude-30ball-final',
  'mx-bestball',
  'mx-singles',
  'mx-2man',
  'mx-scramble',
  'mx-stroke',
  'mx-30ball',
  'mx-bbb',
  'm2-bestball',
  'm2-singles',
  'm2-2man',
  'm2-scramble',
  'm2-stroke',
  'm2-30ball',
  'm2-bbb',
  'chef-curry-ball',
  'test',
];

/** Never delete these, whatever the list says. */
const PROTECTED = new Set([
  'pcup26',
  'bellewood-battle',
  'dry-run',
  'freedom-fairways-invitational',
  'gilbert-grape',
  'win-coat',
]);

const COMMIT = process.argv.includes('--commit');

async function deleteTrip(tripId: string, slug: string) {
  const roundRows = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(eq(rounds.tripId, tripId));
  const roundIds = roundRows.map((r) => r.id);

  const matchRows = roundIds.length
    ? await db.select({ id: matches.id }).from(matches).where(inArray(matches.roundId, roundIds))
    : [];
  const matchIds = matchRows.map((m) => m.id);

  const teeRows = roundIds.length
    ? await db.select({ id: teeTimes.id }).from(teeTimes).where(inArray(teeTimes.roundId, roundIds))
    : [];
  const teeIds = teeRows.map((t) => t.id);

  // media references match_id / round_id without cascade — must go first.
  await db.delete(media).where(eq(media.tripId, tripId));

  if (matchIds.length) {
    await db.delete(bbbHolePoints).where(inArray(bbbHolePoints.matchId, matchIds));
    await db.delete(holeScores).where(inArray(holeScores.matchId, matchIds));
    await db.delete(matchParticipants).where(inArray(matchParticipants.matchId, matchIds));
    await db.delete(matches).where(inArray(matches.id, matchIds));
  }
  if (teeIds.length) {
    await db.delete(teeTimeParticipants).where(inArray(teeTimeParticipants.teeTimeId, teeIds));
    await db.delete(teeTimes).where(inArray(teeTimes.id, teeIds));
  }
  if (roundIds.length) {
    await db.delete(rounds).where(inArray(rounds.id, roundIds));
  }

  await db.delete(tripEvents).where(eq(tripEvents.tripId, tripId));
  await db.delete(tripInvites).where(eq(tripInvites.tripId, tripId));
  await db.delete(messages).where(eq(messages.tripId, tripId));
  // trip_members before teams (members reference team_id).
  await db.delete(tripMembers).where(eq(tripMembers.tripId, tripId));
  await db.delete(teams).where(eq(teams.tripId, tripId));
  await db.delete(trips).where(eq(trips.id, tripId));

  console.log(
    `deleted ${slug}  (${roundIds.length} rounds, ${matchIds.length} matches, ${teeIds.length} groups)`,
  );
}

async function main() {
  const overlap = SLUGS.filter((s) => PROTECTED.has(s));
  if (overlap.length) throw new Error(`Refusing: protected slug in list: ${overlap.join(', ')}`);

  const found = await db
    .select({ id: trips.id, slug: trips.slug, name: trips.name })
    .from(trips)
    .where(inArray(trips.slug, SLUGS));

  const missing = SLUGS.filter((s) => !found.some((f) => f.slug === s));
  if (missing.length) console.log(`not found (skipping): ${missing.join(', ')}`);

  console.log(`${found.length} trips matched.${COMMIT ? '' : '  DRY RUN — pass --commit to delete.'}`);
  if (!COMMIT) {
    for (const t of found) console.log(`  would delete  ${t.slug}  "${t.name}"`);
    return;
  }

  for (const t of found) {
    await deleteTrip(t.id, t.slug);
  }

  const remaining = await db.select({ slug: trips.slug, name: trips.name }).from(trips);
  console.log(`\n${remaining.length} trips remain:`);
  for (const r of remaining) console.log(`  ${r.slug}  "${r.name}"`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
