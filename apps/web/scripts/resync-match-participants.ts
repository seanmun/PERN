/**
 * One-off repair: re-syncs matchParticipants.teamId for one match so each
 * participant's team matches their CURRENT tripMembers.teamId.
 *
 * Use when a completed match has stale team assignments (e.g. an admin
 * swapped a player's team after the match was finalized).
 *
 * Run:  npx tsx scripts/resync-match-participants.ts <matchId>
 */

import { db } from '../db/client';
import { matchParticipants, tripMembers } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

async function main() {
  const matchId = process.argv[2]?.trim();
  if (!matchId) {
    console.error('Usage: npx tsx scripts/resync-match-participants.ts <matchId>');
    process.exit(1);
  }

  const participants = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  if (participants.length === 0) {
    console.log(`No matchParticipants found for match ${matchId}`);
    return;
  }

  const memberIds = participants.map((p) => p.tripMemberId);
  const members = await db
    .select()
    .from(tripMembers)
    .where(inArray(tripMembers.id, memberIds));
  const memberById = new Map(members.map((m) => [m.id, m] as const));

  let updates = 0;
  let unchanged = 0;
  for (const p of participants) {
    const member = memberById.get(p.tripMemberId);
    if (!member) {
      console.warn(`  skipping ${p.tripMemberId}: tripMember not found`);
      continue;
    }
    if (!member.teamId) {
      console.warn(`  skipping ${member.nickname}: no current team assignment`);
      continue;
    }
    if (member.teamId === p.teamId) {
      console.log(`  ${member.nickname}: already in sync (${p.teamId})`);
      unchanged += 1;
      continue;
    }
    await db
      .update(matchParticipants)
      .set({ teamId: member.teamId })
      .where(
        and(
          eq(matchParticipants.matchId, p.matchId),
          eq(matchParticipants.tripMemberId, p.tripMemberId),
        ),
      );
    console.log(
      `  ${member.nickname}: ${p.teamId} -> ${member.teamId}`
    );
    updates += 1;
  }

  console.log(
    `\nDone. ${updates} row${updates === 1 ? '' : 's'} rewritten, ${unchanged} unchanged.`
  );
}

main().then(() => process.exit(0));
