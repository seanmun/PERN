/**
 * Read-only dump of the Pinehurst Cup trip for documentation.
 *   npx tsx --env-file=.env.local scripts/dump-pinehurst.ts
 */

import { db } from '../db/client';
import {
  courses,
  matchParticipants,
  matches,
  rounds,
  teeTimeParticipants,
  teeTimes,
  teams,
  tripMembers,
  trips,
} from '../db/schema';
import { asc, eq, inArray } from 'drizzle-orm';

const SLUG = 'pcup26';

async function main() {
  const [trip] = await db.select().from(trips).where(eq(trips.slug, SLUG)).limit(1);
  if (!trip) throw new Error(`No trip with slug ${SLUG}`);

  console.log('## TRIP');
  console.log(JSON.stringify({
    name: trip.name, slug: trip.slug, kind: trip.kind,
    startDate: trip.startDate, endDate: trip.endDate,
    description: trip.description, archivedAt: trip.archivedAt,
  }, null, 2));

  const teamRows = await db.select().from(teams).where(eq(teams.tripId, trip.id));
  console.log('\n## TEAMS');
  for (const t of teamRows) console.log(`${t.id}\t${t.name}\t${t.color}`);

  const members = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, trip.id))
    .orderBy(asc(tripMembers.nickname));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  console.log('\n## PLAYERS');
  for (const m of members) {
    console.log(
      [m.nickname, m.tripHandicap ?? '-', m.teamId ? teamName.get(m.teamId) : 'NO TEAM',
       m.role, m.isCaptain ? 'CAPTAIN' : '', m.email ?? 'no-email',
       m.userId ? 'claimed' : 'unclaimed'].join('\t'),
    );
  }

  const roundRows = await db
    .select({ round: rounds, course: courses })
    .from(rounds)
    .leftJoin(courses, eq(rounds.courseId, courses.id))
    .where(eq(rounds.tripId, trip.id))
    .orderBy(asc(rounds.order));

  console.log('\n## ROUNDS');
  const memberName = new Map(members.map((m) => [m.id, m.nickname]));

  for (const { round: r, course: c } of roundRows) {
    console.log(
      `\nR${r.order} | ${r.label ?? ''} | ${c?.name ?? 'NO COURSE'} | format=${r.format} | date=${r.date} | hidden=${r.isHidden ?? false}`,
    );

    const tts = await db
      .select()
      .from(teeTimes)
      .where(eq(teeTimes.roundId, r.id))
      .orderBy(asc(teeTimes.groupNumber));

    for (const tt of tts) {
      const parts = await db
        .select({ id: teeTimeParticipants.tripMemberId })
        .from(teeTimeParticipants)
        .where(eq(teeTimeParticipants.teeTimeId, tt.id));
      console.log(
        `  Group ${tt.groupNumber} @ ${tt.time ? new Date(tt.time).toISOString() : 'TBD'}: ` +
          (parts.map((p) => memberName.get(p.id) ?? p.id).join(', ') || '(empty)'),
      );
    }

    const ms = await db.select().from(matches).where(eq(matches.roundId, r.id));
    for (const m of ms) {
      const mp = await db
        .select()
        .from(matchParticipants)
        .where(eq(matchParticipants.matchId, m.id));
      const bySide = new Map<string, string[]>();
      for (const p of mp) {
        const list = bySide.get(p.teamId) ?? [];
        list.push(memberName.get(p.tripMemberId) ?? p.tripMemberId);
        bySide.set(p.teamId, list);
      }
      const sides = [...bySide.entries()].map(
        ([tid, names]) => `${teamName.get(tid) ?? tid}: ${names.join(' + ')}`,
      );
      console.log(
        `  MATCH ${m.format} (${m.templateSizeA}v${m.templateSizeB}) scoring=${m.scoring} ` +
          `hcp=${m.handicapMethod} pts=${m.pointsOverall}/${m.pointsFront9}/${m.pointsBack9} ` +
          `status=${m.status} result="${m.resultText ?? ''}" teeTime=${m.teeTimeId ? 'set' : 'ROUND-WIDE'}`,
      );
      console.log(`    ${sides.join('  vs  ')}`);
    }
  }
  console.log('');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
