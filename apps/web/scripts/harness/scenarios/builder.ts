/**
 * §6 round-builder — the atom, its three wrappers, and edit mode.
 *
 * These drive `saveEvent`, the single write path that replaces
 * `createEventFromForm`. They are what closes the harness's long-standing
 * blocked case: "a second round through the round-builder".
 *
 * Edit-mode cases exist to pin down the §2 layering rule, which is the
 * rule most likely to be broken by a future convenience: a round that
 * already has scores may have its course and label changed, but not its
 * lineup, because groups and matchups are a layer ON TOP of strokes and a
 * layer may never rewrite its own foundation.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { matches, rounds, trips } from '@/db/schema';
import { saveEvent, type EventBuilderPayload } from '@/lib/actions/save-event';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { loadEventForBuilder } from '@/lib/data/event-builder';
import type { LeaderboardMethod } from '@/components/event-builder/state';
import { deriveLineup } from '@buddycup/scoring/lineup';
import type { FormatId } from '@buddycup/scoring/formats';
import {
  assert,
  assertEq,
  note,
  runAs,
  scenario,
  type HarnessActor,
} from '../core';
import { TRIP_PREFIX, loadEvent, makeCourse, type RosterEntry } from '../world';
import { enterScore } from '../scoring';

type RoundSpec = {
  roundId?: string | null;
  courseId: string;
  label: string;
  date?: string | null;
  formats: FormatId[];
  countsTowardCup?: boolean;
  /** §4.3 override. Null/absent inherits the trip default. */
  handicapMethod?: 'group_low' | 'match_low' | 'course' | null;
};

/**
 * Build the payload the builder posts. Groups and matchups come out of
 * `deriveLineup` per round — the same derivation the UI previews — so the
 * harness exercises the real §6.1 "what" step rather than hand-written
 * lineups.
 */
function payloadFor(input: {
  tripId?: string | null;
  name: string;
  roster: (RosterEntry & { memberId?: string | null })[];
  rounds: RoundSpec[];
  startDate?: string | null;
  leaderboardMethod?: LeaderboardMethod;
}): EventBuilderPayload {
  return {
    tripId: input.tripId ?? null,
    name: `${TRIP_PREFIX}${input.name}`,
    startDate: input.startDate ?? '2026-08-19',
    endDate: '2026-08-22',
    teamA: { name: 'MachIans', color: '#16a34a' },
    teamB: { name: 'Douchebags', color: '#eab308' },
    handicapMethod: 'group_low',
    leaderboardMethod: input.leaderboardMethod ?? 'net_course_handicap',
    players: input.roster.map((p) => ({
      memberId: p.memberId ?? null,
      userId: p.userId ?? null,
      email: p.email ?? null,
      nickname: p.nickname,
      handicap: p.handicap,
      team: p.team,
    })),
    rounds: input.rounds.map((r) => {
      // A shell round asks no game, so it derives no groups and no
      // matchups — course and tee times only (§6.2).
      if (r.formats.length === 0) {
        return {
          roundId: r.roundId ?? null,
          courseId: r.courseId,
          courseTeeId: null,
          date: r.date ?? null,
          label: r.label,
          countsTowardCup: r.countsTowardCup !== false,
          handicapMethod: r.handicapMethod ?? null,
          groups: [],
          matches: [],
        };
      }
      const lineup = deriveLineup({
        players: input.roster.map((p, i) => ({
          id: String(i),
          handicap: Number(p.handicap),
          teamId: p.team,
        })),
        formats: r.formats,
        teamAId: 'A',
        teamBId: 'B',
        respectExistingTeams: true,
      });
      return {
        roundId: r.roundId ?? null,
        courseId: r.courseId,
        courseTeeId: null,
        date: r.date ?? null,
        label: r.label,
        countsTowardCup: r.countsTowardCup !== false,
        handicapMethod: r.handicapMethod ?? null,
        groups: lineup.groups.map((g) => g.map(Number)),
        matches: lineup.matches.map((m) => ({
          format: m.format,
          sideSize: m.sideSize,
          sideA: m.sideAPlayerIds.map(Number),
          sideB: m.sideBPlayerIds.map(Number),
        })),
      };
    }),
  };
}

async function save(
  who: HarnessActor,
  payload: EventBuilderPayload,
): Promise<string> {
  const fd = new FormData();
  fd.set('payload', JSON.stringify(payload));
  const { slug } = await runAs(who, () => saveEvent(fd));
  return slug;
}

async function saveExpectingFailure(
  who: HarnessActor,
  payload: EventBuilderPayload,
): Promise<Error> {
  const fd = new FormData();
  fd.set('payload', JSON.stringify(payload));
  return runAs(who, async () => {
    try {
      await saveEvent(fd);
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
    throw new Error('expected the save to fail, but it succeeded');
  });
}

function roster(prefix: string, perTeam: number): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (let i = 0; i < perTeam; i++) {
    out.push({ nickname: `${prefix}-A${i + 1}`, team: 'A', handicap: '0.0' });
  }
  for (let i = 0; i < perTeam; i++) {
    out.push({ nickname: `${prefix}-B${i + 1}`, team: 'B', handicap: '0.0' });
  }
  return out;
}

export async function runBuilder(admin: HarnessActor): Promise<void> {
  // ───────── §6.2 · Trip: many rounds, roster asked once ─────────
  await scenario('§6.2 · Trip — three rounds, one roster, kind derived', async () => {
    const c1 = await makeCourse('trip-r1');
    const c2 = await makeCourse('trip-r2');
    const c3 = await makeCourse('trip-r3');
    const people = roster('trip', 2);

    const slug = await save(
      admin,
      payloadFor({
        name: 'builder-trip',
        roster: people,
        rounds: [
          { courseId: c1.courseId, label: 'Wed PM', formats: ['best_ball'] },
          { courseId: c2.courseId, label: 'Thu AM', formats: ['singles'] },
          // A SHELL: course and tee times now, matchups later (§6.2).
          { courseId: c3.courseId, label: 'Fri AM — captains pick', formats: [] },
        ],
      }),
    );

    const ev = await loadEvent(slug);
    assertEq(ev.rounds.length, 3, 'three rounds written');
    assertEq(ev.trip.kind, 'trip', '2+ rounds → kind derived as trip');
    assertEq(ev.members.length, people.length + 1, 'roster written once (+ creator)');
    assertEq(ev.teams.length, 2, 'two teams');

    const byLabel = new Map(ev.rounds.map((r) => [r.label, r]));
    assert(byLabel.has('Wed PM'), 'round 1 label');
    assert(byLabel.has('Fri AM — captains pick'), 'shell round label');
    assertEq(
      ev.rounds.map((r) => r.order).sort().join(','),
      '1,2,3',
      'rounds ordered',
    );

    // Round 1: best ball 2v2. Round 2: two singles. Shell: nothing.
    const shell = byLabel.get('Fri AM — captains pick')!;
    const shellMatches = ev.matches.filter((m) => m.match.roundId === shell.id);
    assertEq(shellMatches.length, 0, 'shell round has no matches');
    const shellGroups = ev.groups.filter((g) => g.teeTime.roundId === shell.id);
    assertEq(shellGroups.length, 0, 'shell round has no groups yet');
    assertEq(ev.matches.length, 3, 'one best ball + two singles across the played rounds');

    // §6.2 — the scoreboard omits a round with no resolved matches rather
    // than rendering it as zeros.
    const board = await getLeaderboard(ev.trip.id);
    assertEq(board.matchesTotal, 3, 'scoreboard counts only real matches');
    assertEq(board.pointsContested, 0, 'nothing awarded yet');
  });

  // ───────── §6.2 · Match and Outing come from the same atom ─────────
  await scenario('§6.2 · One atom — match and outing differ only in roster size', async () => {
    const course = await makeCourse('atom');

    const matchSlug = await save(
      admin,
      payloadFor({
        name: 'builder-match',
        roster: roster('atm', 2),
        rounds: [{ courseId: course.courseId, label: 'Only round', formats: ['best_ball'] }],
      }),
    );
    const matchEv = await loadEvent(matchSlug);
    assertEq(matchEv.trip.kind, 'match', 'one group, one round → match');
    assertEq(matchEv.groups.length, 1, 'one group');

    const outingSlug = await save(
      admin,
      payloadFor({
        name: 'builder-outing',
        roster: roster('otg', 4),
        rounds: [{ courseId: course.courseId, label: 'Only round', formats: ['best_ball'] }],
      }),
    );
    const outingEv = await loadEvent(outingSlug);
    assertEq(outingEv.trip.kind, 'outing', '2+ groups, one round → outing');
    assertEq(outingEv.groups.length, 2, 'two groups');
    assertEq(outingEv.matches.length, 2, 'one 2v2 per group');
  });

  // ───────── §6.2 · Promoting a shell through the same builder ─────────
  await scenario('§6.2 · Edit — a shell round is promoted, touching nothing else', async () => {
    const c1 = await makeCourse('promote-r1');
    const c2 = await makeCourse('promote-r2');
    const people = roster('pro', 2);

    const slug = await save(
      admin,
      payloadFor({
        name: 'builder-promote',
        roster: people,
        rounds: [
          { courseId: c1.courseId, label: 'Round 1', formats: ['best_ball'] },
          { courseId: c2.courseId, label: 'Round 2', formats: [] },
        ],
      }),
    );
    const before = await loadEvent(slug);
    const r1 = before.rounds.find((r) => r.label === 'Round 1')!;
    const r2 = before.rounds.find((r) => r.label === 'Round 2')!;
    const r1MatchIds = before.matches
      .filter((m) => m.match.roundId === r1.id)
      .map((m) => m.match.id)
      .sort();
    assertEq(r1MatchIds.length, 1, 'round 1 starts with one match');

    // Re-post the SAME state with the shell now carrying a game. Existing
    // members are addressed by memberId, so nothing is recreated.
    const withIds = people.map((p) => ({
      ...p,
      memberId: before.byNickname.get(p.nickname)!.id,
    }));
    await save(
      admin,
      payloadFor({
        tripId: before.trip.id,
        name: 'builder-promote',
        roster: withIds,
        rounds: [
          { roundId: r1.id, courseId: c1.courseId, label: 'Round 1', formats: ['best_ball'] },
          { roundId: r2.id, courseId: c2.courseId, label: 'Round 2', formats: ['singles'] },
        ],
      }),
    );

    const after = await loadEvent(slug);
    assertEq(after.rounds.length, 2, 'still two rounds');
    assertEq(after.members.length, before.members.length, 'no duplicate members');
    const afterR1Ids = after.matches
      .filter((m) => m.match.roundId === r1.id)
      .map((m) => m.match.id)
      .sort();
    assertEq(
      afterR1Ids.join(','),
      r1MatchIds.join(','),
      'round 1 matches untouched (unchanged lineup is not rewritten)',
    );
    const afterR2 = after.matches.filter((m) => m.match.roundId === r2.id);
    assertEq(afterR2.length, 2, 'promoted shell now carries two singles');
    assertEq(after.trip.kind, 'trip', 'still a trip');
  });

  // ───────── §2 · A scored round's lineup is frozen ─────────
  await scenario('§2 · Edit — a scored round locks its lineup, not its metadata', async () => {
    const c1 = await makeCourse('locked-r1');
    const c2 = await makeCourse('locked-r2');
    const people = roster('lck', 2);

    const slug = await save(
      admin,
      payloadFor({
        name: 'builder-locked',
        roster: people,
        rounds: [{ courseId: c1.courseId, label: 'Round 1', formats: ['best_ball'] }],
      }),
    );
    const ev = await loadEvent(slug);
    const round = ev.rounds[0];
    const match = ev.matches[0];
    const withIds = people.map((p) => ({
      ...p,
      memberId: ev.byNickname.get(p.nickname)!.id,
    }));

    await enterScore(admin, {
      matchId: match.match.id,
      tripMemberId: withIds[0].memberId!,
      holeNumber: 1,
      gross: 4,
    });

    // Metadata-only edit: allowed even with scores on the board.
    await save(
      admin,
      payloadFor({
        tripId: ev.trip.id,
        name: 'builder-locked',
        roster: withIds,
        rounds: [
          {
            roundId: round.id,
            courseId: c2.courseId,
            label: 'Round 1 — moved',
            formats: ['best_ball'],
          },
        ],
      }),
    );
    const [movedRound] = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, round.id));
    assertEq(movedRound.label, 'Round 1 — moved', 'label edited on a scored round');
    assertEq(movedRound.courseId, c2.courseId, 'course edited on a scored round');

    // Lineup change: refused, and the message says why.
    const err = await saveExpectingFailure(
      admin,
      payloadFor({
        tripId: ev.trip.id,
        name: 'builder-locked',
        roster: withIds,
        rounds: [
          {
            roundId: round.id,
            courseId: c2.courseId,
            label: 'Round 1 — moved',
            formats: ['singles'],
          },
        ],
      }),
    );
    assert(
      err.message.includes('already has scores'),
      `lineup change on a scored round is refused (${err.message})`,
    );
    const stillThere = await loadEvent(slug);
    assertEq(
      stillThere.matches.length,
      1,
      'the refused edit changed nothing',
    );
    assertEq(
      stillThere.matches[0].match.id,
      match.match.id,
      'the original match survives',
    );
  });

  // ───────── §2 · Removing a scored player is refused ─────────
  await scenario('§2 · Edit — a player with scores cannot be dropped', async () => {
    const course = await makeCourse('drop');
    const people = roster('drp', 2);
    const slug = await save(
      admin,
      payloadFor({
        name: 'builder-drop',
        roster: people,
        rounds: [{ courseId: course.courseId, label: 'Round 1', formats: ['best_ball'] }],
      }),
    );
    const ev = await loadEvent(slug);
    const withIds = people.map((p) => ({
      ...p,
      memberId: ev.byNickname.get(p.nickname)!.id,
    }));
    await enterScore(admin, {
      matchId: ev.matches[0].match.id,
      tripMemberId: withIds[0].memberId!,
      holeNumber: 1,
      gross: 5,
    });

    const err = await saveExpectingFailure(
      admin,
      payloadFor({
        tripId: ev.trip.id,
        name: 'builder-drop',
        roster: withIds.slice(1),
        rounds: [
          {
            roundId: ev.rounds[0].id,
            courseId: course.courseId,
            label: 'Round 1',
            formats: ['best_ball'],
          },
        ],
      }),
    );
    assert(
      err.message.includes('scores recorded'),
      `dropping a scored player is refused (${err.message})`,
    );
    const after = await loadEvent(slug);
    assertEq(after.members.length, ev.members.length, 'roster unchanged');
  });

  // ───────── §4.3 · A round's handicap rule changes on its own ─────────
  await scenario(
    "§4.3 · Edit — a round's handicap rule changes with the lineup untouched",
    async () => {
      const course = await makeCourse('hcp-rule');
      const people = roster('hcp', 2);

      const slug = await save(
        admin,
        payloadFor({
          name: 'builder-hcp-rule',
          roster: people,
          rounds: [{ courseId: course.courseId, label: 'Round 1', formats: ['singles'] }],
        }),
      );
      const ev = await loadEvent(slug);
      const round = ev.rounds[0];
      const withIds = people.map((p) => ({
        ...p,
        memberId: ev.byNickname.get(p.nickname)!.id,
      }));

      const methodsOf = async (roundId: string): Promise<string[]> => {
        const rows = await db
          .select({ id: matches.id, handicapMethod: matches.handicapMethod })
          .from(matches)
          .where(eq(matches.roundId, roundId));
        return rows.map((r) => r.handicapMethod as string).sort();
      };

      assertEq(
        (await methodsOf(round.id)).join(','),
        'group_low,group_low',
        'matches start on the trip default',
      );

      const matchIdsBefore = (
        await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, round.id))
      )
        .map((m) => m.id)
        .sort();

      // The ONLY change is the rule. Same roster, same games, so the
      // lineup signature is identical — which is exactly the path that
      // used to swallow this edit entirely.
      await save(
        admin,
        payloadFor({
          tripId: ev.trip.id,
          name: 'builder-hcp-rule',
          roster: withIds,
          rounds: [
            {
              roundId: round.id,
              courseId: course.courseId,
              label: 'Round 1',
              formats: ['singles'],
              handicapMethod: 'match_low',
            },
          ],
        }),
      );

      assertEq(
        (await methodsOf(round.id)).join(','),
        'match_low,match_low',
        'a rule-only edit persists (the unchanged-lineup short circuit no longer eats it)',
      );

      const matchIdsAfter = (
        await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, round.id))
      )
        .map((m) => m.id)
        .sort();
      assertEq(
        matchIdsAfter.join(','),
        matchIdsBefore.join(','),
        'the lineup was not rebuilt to carry the change',
      );

      // §2: the builder must read back what it wrote, or the next save
      // silently reverts it.
      const reloaded = await loadEventForBuilder(slug);
      assertEq(
        reloaded?.rounds[0].handicapMethod ?? null,
        'match_low',
        'the rule round-trips into the builder',
      );

      // And back again, so this is not one-way.
      await save(
        admin,
        payloadFor({
          tripId: ev.trip.id,
          name: 'builder-hcp-rule',
          roster: withIds,
          rounds: [
            {
              roundId: round.id,
              courseId: course.courseId,
              label: 'Round 1',
              formats: ['singles'],
              handicapMethod: 'group_low',
            },
          ],
        }),
      );
      assertEq(
        (await methodsOf(round.id)).join(','),
        'group_low,group_low',
        'and reverts just as cleanly',
      );
    },
  );

  // ───────── Trip Scoring · the setting round-trips ─────────
  await scenario('Trip Scoring — the leaderboard method round-trips', async () => {
    const course = await makeCourse('ts-roundtrip');
    const people = roster('tsr', 2);

    const slug = await save(
      admin,
      payloadFor({
        name: 'builder-ts-roundtrip',
        roster: people,
        rounds: [{ courseId: course.courseId, label: 'Round 1', formats: ['best_ball'] }],
        leaderboardMethod: 'gross',
      }),
    );
    const ev = await loadEvent(slug);
    const [tripRow] = await db.select().from(trips).where(eq(trips.id, ev.trip.id));
    assertEq(tripRow.leaderboardMethod, 'gross', 'the setting is written on create');
    assertEq(
      (await loadEventForBuilder(slug))?.leaderboardMethod ?? null,
      'gross',
      'and loads back into the builder',
    );

    const withIds = people.map((p) => ({
      ...p,
      memberId: ev.byNickname.get(p.nickname)!.id,
    }));
    await save(
      admin,
      payloadFor({
        tripId: ev.trip.id,
        name: 'builder-ts-roundtrip',
        roster: withIds,
        rounds: [
          {
            roundId: ev.rounds[0].id,
            courseId: course.courseId,
            label: 'Round 1',
            formats: ['best_ball'],
          },
        ],
        leaderboardMethod: 'net_trip_handicap',
      }),
    );
    const [after] = await db.select().from(trips).where(eq(trips.id, ev.trip.id));
    assertEq(after.leaderboardMethod, 'net_trip_handicap', 'and changes on edit');
  });

  // ───────── Trip Scoring · the leaderboard actually moves ─────────
  await scenario('Trip Scoring — the leaderboard changes basis with the setting', async () => {
    // A SLOPED course: 130/74.5 on a par 72 means a course handicap is
    // meaningfully different from the raw index, which is the only way to
    // tell the two net bases apart. The default 113/72 fixture cannot.
    const course = await makeCourse('ts-sloped', { slope: 130, rating: '74.5' });
    const people: RosterEntry[] = [
      { nickname: 'ts-A1', team: 'A', handicap: '4.0' },
      { nickname: 'ts-A2', team: 'A', handicap: '18.0' },
      { nickname: 'ts-B1', team: 'B', handicap: '4.0' },
      { nickname: 'ts-B2', team: 'B', handicap: '18.0' },
    ];

    const slug = await save(
      admin,
      payloadFor({
        name: 'builder-ts-basis',
        roster: people,
        rounds: [{ courseId: course.courseId, label: 'Round 1', formats: ['best_ball'] }],
        leaderboardMethod: 'gross',
      }),
    );
    const ev = await loadEvent(slug);
    const withIds = people.map((p) => ({
      ...p,
      memberId: ev.byNickname.get(p.nickname)!.id,
    }));
    const match = ev.matches[0];

    // Everyone plays the first six holes in 5s. Gross is identical for
    // all four, so any spread on the board is the handicap basis alone.
    for (const p of withIds) {
      for (let hole = 1; hole <= 6; hole++) {
        await enterScore(admin, {
          matchId: match.match.id,
          tripMemberId: p.memberId!,
          holeNumber: hole,
          gross: 5,
        });
      }
    }

    const boardFor = async (method: LeaderboardMethod) => {
      await save(
        admin,
        payloadFor({
          tripId: ev.trip.id,
          name: 'builder-ts-basis',
          roster: withIds,
          rounds: [
            {
              roundId: ev.rounds[0].id,
              courseId: course.courseId,
              label: 'Round 1',
              formats: ['best_ball'],
            },
          ],
          leaderboardMethod: method,
        }),
      );
      const board = await getLeaderboard(ev.trip.id);
      const row = (nick: string) =>
        board.playerTotals.find((x) => x.nickname === nick)!;
      return { board, row };
    };

    const gross = await boardFor('gross');
    assertEq(gross.board.method, 'gross', 'board reports the basis it used');
    assertEq(gross.row('ts-A1').strokesGiven, 0, 'gross gives nobody strokes');
    assertEq(
      gross.row('ts-A2').net,
      gross.row('ts-A2').gross,
      'gross: net equals gross',
    );
    assertEq(
      gross.row('ts-A1').net - gross.row('ts-A2').net,
      0,
      'gross: a 4 and an 18 shooting the same score are level',
    );

    const tripH = await boardFor('net_trip_handicap');
    // 18 handicap over stroke indexes 1-6 => one stroke on each.
    assertEq(tripH.row('ts-A2').strokesGiven, 6, 'trip handicap: the 18 gets 6 strokes');
    assertEq(tripH.row('ts-A1').strokesGiven, 4, 'trip handicap: the 4 gets 4 strokes');
    assert(
      tripH.row('ts-A2').net < tripH.row('ts-A1').net,
      'trip handicap: the higher handicap now leads on the same gross',
    );

    const courseH = await boardFor('net_course_handicap');
    assertEq(
      courseH.board.courseHandicapFallbacks.length,
      0,
      'a rated tee needs no fallback',
    );
    // 18 x 130/113 + 2.5 = 23.2 -> 23, so all six holes still get a
    // stroke, but the 4 converts to 4 x 130/113 + 2.5 = 7.1 -> 7 and now
    // takes a stroke on all six too.
    assertEq(
      courseH.row('ts-A1').strokesGiven,
      6,
      'course handicap: the 4 plays off 7 on a 130-slope course, so 6 strokes',
    );
    assert(
      courseH.row('ts-A1').strokesGiven !== tripH.row('ts-A1').strokesGiven,
      'course handicap and trip handicap are genuinely different bases',
    );
  });

  // ───────── Trip Scoring · the fallback is taken AND reported ─────────
  await scenario('Trip Scoring — course mode falls back and says so', async () => {
    // No tee at all, so there is no slope/rating to convert with.
    const course = await makeCourse('ts-unrated', { noTee: true });
    const people: RosterEntry[] = [
      { nickname: 'fb-A1', team: 'A', handicap: '4.0' },
      { nickname: 'fb-A2', team: 'A', handicap: '18.0' },
      { nickname: 'fb-B1', team: 'B', handicap: '4.0' },
      { nickname: 'fb-B2', team: 'B', handicap: '18.0' },
    ];

    const slug = await save(
      admin,
      payloadFor({
        name: 'builder-ts-fallback',
        roster: people,
        rounds: [{ courseId: course.courseId, label: 'Unrated Muni', formats: ['best_ball'] }],
        leaderboardMethod: 'net_course_handicap',
      }),
    );
    const ev = await loadEvent(slug);
    const withIds = people.map((p) => ({
      ...p,
      memberId: ev.byNickname.get(p.nickname)!.id,
    }));
    for (const p of withIds) {
      for (let hole = 1; hole <= 6; hole++) {
        await enterScore(admin, {
          matchId: ev.matches[0].match.id,
          tripMemberId: p.memberId!,
          holeNumber: hole,
          gross: 5,
        });
      }
    }

    const board = await getLeaderboard(ev.trip.id);
    assertEq(board.method, 'net_course_handicap', 'the setting is still what was asked for');
    assertEq(
      board.courseHandicapFallbacks.join(','),
      'Unrated Muni',
      'the round that fell back is named, not swallowed',
    );
    // Falling back means "the trip handicap, as-is" — the same allocation
    // net_trip_handicap would have produced.
    const row = (nick: string) => board.playerTotals.find((x) => x.nickname === nick)!;
    assertEq(row('fb-A1').strokesGiven, 4, 'fallback allocates off the raw trip handicap');
    assertEq(row('fb-A2').strokesGiven, 6, 'and the 18 still gets its 6');
  });

  // ───────── §6.3 · Nothing writes until submit ─────────
  await scenario('§6.3 · An invalid payload writes nothing at all', async () => {
    const course = await makeCourse('atomic');
    const people = roster('atc', 2);
    const bad = payloadFor({
      name: 'builder-atomic',
      roster: people,
      rounds: [{ courseId: course.courseId, label: 'Round 1', formats: ['best_ball'] }],
    });
    // A scramble whose sides straddle two groups — clears every field-level
    // check and can only be caught by validateBuilderState at write time.
    bad.rounds.push({
      roundId: null,
      courseId: course.courseId,
      courseTeeId: null,
      date: null,
      label: 'Round 2',
      countsTowardCup: true,
      handicapMethod: null,
      groups: [
        [0, 2],
        [1, 3],
      ],
      matches: [{ format: 'scramble', sideSize: 2, sideA: [0, 1], sideB: [2, 3] }],
    });

    const err = await saveExpectingFailure(admin, bad);
    assert(
      err.message.includes('round 2'),
      `the failure names the round it died on (${err.message})`,
    );
    note('round 1 is still written — §6.3 orders writes so a partial failure stays editable');

    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.name, `${TRIP_PREFIX}builder-atomic`));
    if (!trip) return void assert(false, 'the trip from stage 1 survives');
    const ev = await loadEvent(trip.slug);
    assertEq(ev.rounds.length, 2, 'round 2 exists as a shell, editable');
    assertEq(ev.matches.length, 1, 'only the valid round produced matches');
  });
}
