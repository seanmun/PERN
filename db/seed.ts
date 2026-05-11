import { db } from './client';
import {
  users,
  trips,
  teams,
  tripMembers,
  courses,
  courseHoles,
  rounds,
  teeTimes,
  matches,
  matchParticipants,
  holeScores,
  media,
  messages,
} from './schema';

async function seed() {
  console.log('🗑️  Clearing existing data...');
  await db.delete(holeScores);
  await db.delete(media);
  await db.delete(messages);
  await db.delete(matchParticipants);
  await db.delete(matches);
  await db.delete(teeTimes);
  await db.delete(rounds);
  await db.delete(tripMembers);
  await db.delete(teams);
  await db.delete(trips);
  await db.delete(courseHoles);
  await db.delete(courses);
  await db.delete(users);

  console.log('🌱 Seeding...');

  const [pineNeedles, tobaccoRoad, pinehurst2, pinehurst1] = await db
    .insert(courses)
    .values([
      { name: 'Pine Needles', location: 'Southern Pines, NC', totalPar: 72 },
      { name: 'Tobacco Road', location: 'Sanford, NC', totalPar: 71 },
      { name: 'Pinehurst No. 2', location: 'Pinehurst, NC', totalPar: 72 },
      { name: 'Pinehurst No. 1', location: 'Pinehurst, NC', totalPar: 70 },
    ])
    .returning();

  const allCourses = [pineNeedles, tobaccoRoad, pinehurst2, pinehurst1];
  for (const course of allCourses) {
    await db.insert(courseHoles).values(
      Array.from({ length: 18 }, (_, i) => ({
        courseId: course.id,
        holeNumber: i + 1,
        par: 4,
        yardage: 400,
        handicapIndex: i + 1,
      }))
    );
  }

  const [trip] = await db
    .insert(trips)
    .values({
      slug: 'pinehurst-cup-2026',
      name: 'Pinehurst Cup 2026',
      startDate: new Date('2026-08-19T00:00:00-04:00'),
      endDate: new Date('2026-08-22T23:59:59-04:00'),
      description: 'Ryder-Cup-style match-play competition at Pinehurst, NC.',
    })
    .returning();

  const [machIans, dbags] = await db
    .insert(teams)
    .values([
      { tripId: trip.id, name: 'MachIans', color: '#1d4ed8' },
      { tripId: trip.id, name: 'Douchebags', color: '#dc2626' },
    ])
    .returning();

  const memberData = [
    { team: machIans, nickname: 'Ian',    handicap: '10.4', isCaptain: true,  role: 'player'      as const, email: 'ian@trip.local' },
    { team: machIans, nickname: 'Munley', handicap: '24.5', isCaptain: false, role: 'player'      as const, email: 'smunley13@gmail.com' },
    { team: machIans, nickname: 'Andy',   handicap: '16.0', isCaptain: false, role: 'player'      as const, email: 'andy@trip.local' },
    { team: machIans, nickname: 'Carty',  handicap: '13.2', isCaptain: false, role: 'player'      as const, email: 'carty@trip.local' },
    { team: machIans, nickname: 'Truant', handicap: '16.9', isCaptain: false, role: 'player'      as const, email: 'truant@trip.local' },
    { team: machIans, nickname: 'Fran',   handicap: null,   isCaptain: false, role: 'player'      as const, email: 'fran@trip.local' },
    { team: dbags,    nickname: 'Dan',    handicap: '11.2', isCaptain: true,  role: 'trip_admin'  as const, email: 'dan@trip.local' },
    { team: dbags,    nickname: 'Lusty',  handicap: '16.2', isCaptain: false, role: 'player'      as const, email: 'lusty@trip.local' },
    { team: dbags,    nickname: 'Marino', handicap: '11.8', isCaptain: false, role: 'player'      as const, email: 'marino@trip.local' },
    { team: dbags,    nickname: 'Kyle',   handicap: '15.5', isCaptain: false, role: 'player'      as const, email: 'kyle@trip.local' },
    { team: dbags,    nickname: 'Musket', handicap: '22.1', isCaptain: false, role: 'player'      as const, email: 'musket@trip.local' },
    { team: dbags,    nickname: 'Mallon', handicap: '25.1', isCaptain: false, role: 'player'      as const, email: 'mallon@trip.local' },
  ];

  const insertedMembers = await db
    .insert(tripMembers)
    .values(
      memberData.map((m) => ({
        tripId: trip.id,
        teamId: m.team.id,
        email: m.email,
        nickname: m.nickname,
        role: m.role,
        isCaptain: m.isCaptain,
        tripHandicap: m.handicap,
      }))
    )
    .returning();

  const byNick = new Map(insertedMembers.map((m) => [m.nickname, m]));
  const M = (nick: string) => {
    const m = byNick.get(nick);
    if (!m) throw new Error(`No member: ${nick}`);
    return m;
  };

  const insertedRounds = await db
    .insert(rounds)
    .values([
      { tripId: trip.id, courseId: pineNeedles.id, date: new Date('2026-08-19T00:00:00-04:00'), format: 'match_play_2v2', order: 1, label: 'Wed PM — Pine Needles',                       countsTowardCup: true  },
      { tripId: trip.id, courseId: tobaccoRoad.id, date: new Date('2026-08-20T00:00:00-04:00'), format: 'match_play_2v2', order: 2, label: 'Thu AM — Tobacco Road',                       countsTowardCup: true  },
      { tripId: trip.id, courseId: pinehurst2.id,  date: new Date('2026-08-21T00:00:00-04:00'), format: 'match_play_2v2', order: 3, label: 'Fri AM — Pinehurst No. 2',                    countsTowardCup: true  },
      { tripId: trip.id, courseId: pinehurst2.id,  date: new Date('2026-08-22T00:00:00-04:00'), format: 'singles',        order: 4, label: 'Sat AM — Singles',                            countsTowardCup: true  },
      { tripId: trip.id, courseId: pinehurst2.id,  date: new Date('2026-08-22T00:00:00-04:00'), format: 'singles',        order: 5, label: 'Sat PM — Singles (captains pick matchups)',   countsTowardCup: true  },
      { tripId: trip.id, courseId: pinehurst1.id,  date: new Date('2026-08-22T00:00:00-04:00'), format: 'scramble',       order: 6, label: 'Sat — Fun Scramble (Pinehurst No. 1)',        countsTowardCup: false },
    ])
    .returning();

  const [r1, r2, r3, r4, r5, r6] = insertedRounds;

  const teeTimeData = [
    { round: r1, group: 1, hh: 14, mm: 30 },
    { round: r1, group: 2, hh: 14, mm: 40 },
    { round: r1, group: 3, hh: 14, mm: 50 },
    { round: r2, group: 1, hh:  8, mm:  0 },
    { round: r2, group: 2, hh:  8, mm: 12 },
    { round: r2, group: 3, hh:  8, mm: 25 },
    { round: r3, group: 1, hh:  7, mm:  0 },
    { round: r3, group: 2, hh:  7, mm: 10 },
    { round: r3, group: 3, hh:  7, mm: 20 },
    { round: r4, group: 1, hh:  7, mm: 24 },
    { round: r4, group: 2, hh:  7, mm: 36 },
    { round: r4, group: 3, hh:  7, mm: 48 },
    { round: r5, group: 1, hh: 14, mm:  0 },
    { round: r5, group: 2, hh: 14, mm: 10 },
    { round: r5, group: 3, hh: 14, mm: 20 },
    { round: r6, group: 1, hh: 10, mm:  0 },
  ];

  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  const insertedTeeTimes = await db
    .insert(teeTimes)
    .values(
      teeTimeData.map((tt) => {
        const d = isoDate(tt.round.date!);
        const h = tt.hh.toString().padStart(2, '0');
        const mm = tt.mm.toString().padStart(2, '0');
        return {
          roundId: tt.round.id,
          time: new Date(`${d}T${h}:${mm}:00-04:00`),
          groupNumber: tt.group,
        };
      })
    )
    .returning();

  const teeTimeMap = new Map<string, (typeof insertedTeeTimes)[number]>();
  insertedTeeTimes.forEach((tt) =>
    teeTimeMap.set(`${tt.roundId}:${tt.groupNumber}`, tt)
  );

  type MatchDef = {
    round: (typeof insertedRounds)[number];
    group: number;
    machIans: string[];
    dbags: string[];
  };

  const matchDefs: MatchDef[] = [
    { round: r1, group: 1, machIans: ['Andy', 'Carty'],    dbags: ['Mallon', 'Musket'] },
    { round: r1, group: 2, machIans: ['Truant', 'Fran'],   dbags: ['Marino', 'Dan']    },
    { round: r1, group: 3, machIans: ['Ian', 'Munley'],    dbags: ['Lusty', 'Kyle']    },
    { round: r2, group: 1, machIans: ['Ian', 'Carty'],     dbags: ['Mallon', 'Dan']    },
    { round: r2, group: 2, machIans: ['Truant', 'Munley'], dbags: ['Marino', 'Kyle']   },
    { round: r2, group: 3, machIans: ['Andy', 'Fran'],     dbags: ['Musket', 'Lusty']  },
    { round: r3, group: 1, machIans: ['Carty', 'Munley'],  dbags: ['Kyle', 'Dan']      },
    { round: r3, group: 2, machIans: ['Truant', 'Andy'],   dbags: ['Musket', 'Marino'] },
    { round: r3, group: 3, machIans: ['Ian', 'Fran'],      dbags: ['Mallon', 'Lusty']  },
    { round: r4, group: 1, machIans: ['Truant'],           dbags: ['Dan']              },
    { round: r4, group: 1, machIans: ['Munley'],           dbags: ['Musket']           },
    { round: r4, group: 2, machIans: ['Carty'],            dbags: ['Kyle']             },
    { round: r4, group: 2, machIans: ['Fran'],             dbags: ['Mallon']           },
    { round: r4, group: 3, machIans: ['Ian'],              dbags: ['Lusty']            },
    { round: r4, group: 3, machIans: ['Andy'],             dbags: ['Marino']           },
  ];

  const insertedMatches = await db
    .insert(matches)
    .values(
      matchDefs.map((md) => ({
        roundId: md.round.id,
        teeTimeId: teeTimeMap.get(`${md.round.id}:${md.group}`)!.id,
        status: 'scheduled' as const,
      }))
    )
    .returning();

  const participantRows: {
    matchId: string;
    tripMemberId: string;
    teamId: string;
  }[] = [];

  matchDefs.forEach((md, i) => {
    const match = insertedMatches[i];
    md.machIans.forEach((nick) => {
      participantRows.push({
        matchId: match.id,
        tripMemberId: M(nick).id,
        teamId: machIans.id,
      });
    });
    md.dbags.forEach((nick) => {
      participantRows.push({
        matchId: match.id,
        tripMemberId: M(nick).id,
        teamId: dbags.id,
      });
    });
  });

  await db.insert(matchParticipants).values(participantRows);

  console.log('✅ Seed complete.');
  console.log(`   - 1 trip: ${trip.name} (Aug 19–22, 2026)`);
  console.log(`   - 2 teams: ${machIans.name}, ${dbags.name}`);
  console.log(`   - ${insertedMembers.length} trip members`);
  console.log(`   - ${allCourses.length} courses × 18 placeholder holes each`);
  console.log(`   - ${insertedRounds.length} rounds`);
  console.log(`   - ${insertedTeeTimes.length} tee times`);
  console.log(`   - ${insertedMatches.length} matches (R5 captain-pick + R6 scramble left empty)`);
  console.log(`   - ${participantRows.length} match participants`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
