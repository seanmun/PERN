/**
 * §11.4 — the acceptance criterion: `pcup26` still renders.
 *
 * A Neon branch is a copy of production, so the flagship trip is present
 * and can be read exactly as the app reads it. Every query here is a
 * SELECT through the real data loaders; this scenario writes nothing,
 * on the branch or anywhere else.
 *
 * If the branch predates the trip, that is reported as blocked — a
 * missing fixture is not the same claim as a broken one.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matchParticipants,
  matches,
  rounds,
  teams,
  teeTimeParticipants,
  teeTimes,
  trips,
} from '@/db/schema';
import { getScheduleByDay } from '@/lib/data/schedule';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { loadEventForBuilder } from '@/lib/data/event-builder';
import { stateFromEvent, toPayload } from '@/components/event-builder/state';
import { assert, assertEq, blocked, note, scenario } from '../core';

const SLUG = 'pcup26';
const EXPECTED_MATCHES = 15;

/** Real events on the branch that the edit route must not damage. */
const REAL_SLUGS = [SLUG, 'freedom-fairways-invitational'];

export async function runAcceptance(): Promise<void> {
  await scenario('§11.4 · pcup26 renders — schedule, matches, result, scoreboard', async () => {
    const [trip] = await db.select().from(trips).where(eq(trips.slug, SLUG)).limit(1);
    if (!trip) {
      blocked(
        `trip "${SLUG}" not on this branch`,
        'the acceptance criterion needs a Neon branch taken from production; nothing was asserted',
      );
      return;
    }

    // ---- Schedule --------------------------------------------------------
    const days = await getScheduleByDay(trip.id);
    assert(days.length > 0, `schedule renders ${days.length} day(s)`);
    assert(
      days.every((d) => typeof d.date === 'string' && d.date.length === 10),
      'every schedule day carries a date key',
    );
    const golfItems = days.flatMap((d) => d.items).filter((i) => i.kind === 'golf');
    assert(golfItems.length > 0, `schedule renders ${golfItems.length} golf item(s)`);

    // ---- Matches ---------------------------------------------------------
    // The 15 are the CUP matches — R1–R4. The trip also carries a hidden,
    // non-cup "Round 0 — Test", which by design renders nowhere and
    // counts toward nothing; including it in the total would be asserting
    // the wrong number.
    const allRows = await db
      .select({ match: matches, round: rounds })
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(eq(rounds.tripId, trip.id));
    const matchRows = allRows.filter(
      (r) => !r.round.isHidden && r.round.countsTowardCup,
    );
    assertEq(matchRows.length, EXPECTED_MATCHES, 'pcup26 cup match count');
    const excluded = allRows.length - matchRows.length;
    if (excluded > 0) {
      note(`${excluded} further match(es) sit in hidden or non-cup rounds and render nowhere`);
    }

    // ---- The one completed result ---------------------------------------
    const completed = matchRows.filter((r) => r.match.status === 'completed');
    assertEq(completed.length, 1, 'exactly one completed match');
    const result = completed[0]?.match.resultText ?? null;
    assert(
      result != null && /4\s*&\s*3/.test(result),
      `the completed match reads 4 & 3 (${result})`,
    );
    assert(
      completed[0]?.match.winningTeamId != null,
      'the completed match records a winning side',
    );

    // ---- Scoreboard ------------------------------------------------------
    const board = await getLeaderboard(trip.id);
    assertEq(board.teamTotals.length, 2, 'scoreboard shows both teams');
    assertEq(board.matchesContested, 1, 'scoreboard counts one contested match');
    assertEq(board.matchesTotal, EXPECTED_MATCHES, 'scoreboard counts every cup match');
    assert(
      board.playerTotals.length > 0,
      `individual leaderboard lists ${board.playerTotals.length} players`,
    );
    note(
      `team totals: ${board.teamTotals.map((t) => `${t.teamName} ${t.points}`).join(' · ')}`,
    );
  });

  await runEditRoundTrip();
}

/**
 * §11.4, second half: opening a real event in `/trips/[slug]/edit` and
 * saving without touching anything must change NOTHING.
 *
 * This is the same failure shape §11 exists for — a client and a server
 * disagreeing — and it is not hypothetical. The first version of
 * `loadEventForBuilder` filtered the roster to `role = 'player'`, which
 * silently dropped Pinehurst's three playing captains/admins. The payload
 * it produced described three rounds of matchups missing a man each, and
 * `saveEvent` would have seen a changed lineup on every unscored round
 * and rewritten them. Nothing else in the suite could have caught it,
 * because it is a defect in the READ side of a write path.
 *
 * Read-only: the payload is compared against the stored rows using the
 * same canonical signature `saveEvent` compares with. Nothing is written.
 */
async function runEditRoundTrip(): Promise<void> {
  await scenario(
    '§11.4 · edit route — opening a real event and saving is a no-op',
    async () => {
      for (const slug of REAL_SLUGS) {
        const [trip] = await db.select().from(trips).where(eq(trips.slug, slug)).limit(1);
        if (!trip) {
          blocked(
            `trip "${slug}" not on this branch`,
            'needs a Neon branch taken from production; nothing was asserted',
          );
          continue;
        }

        const loaded = await loadEventForBuilder(slug);
        if (!loaded) {
          assert(false, `${slug}: the builder can load it`);
          continue;
        }
        // Exactly what the browser would post if nobody touched a field.
        const payload = toPayload(stateFromEvent(loaded));
        const memberIdAt = (i: number) => loaded.players[i].memberId;

        const teamRows = await db.select().from(teams).where(eq(teams.tripId, trip.id));
        const [teamA, teamB] = teamRows;
        const roundRows = await db
          .select()
          .from(rounds)
          .where(and(eq(rounds.tripId, trip.id), eq(rounds.isHidden, false)))
          .orderBy(asc(rounds.order));
        const roundIds = roundRows.map((r) => r.id);
        const matchRows = roundIds.length
          ? await db.select().from(matches).where(inArray(matches.roundId, roundIds))
          : [];
        const matchIds = matchRows.map((m) => m.id);
        const partRows = matchIds.length
          ? await db
              .select()
              .from(matchParticipants)
              .where(inArray(matchParticipants.matchId, matchIds))
          : [];
        const ttRows = roundIds.length
          ? await db
              .select()
              .from(teeTimes)
              .where(inArray(teeTimes.roundId, roundIds))
              .orderBy(asc(teeTimes.groupNumber))
          : [];
        const ttIds = ttRows.map((t) => t.id);
        const ttpRows = ttIds.length
          ? await db
              .select()
              .from(teeTimeParticipants)
              .where(inArray(teeTimeParticipants.teeTimeId, ttIds))
          : [];

        assertEq(payload.rounds.length, roundRows.length, `${slug}: every round loads`);
        assertEq(payload.name, trip.name, `${slug}: name survives the round trip`);

        // Nobody may go missing. A player the payload forgets is a player
        // `saveEvent` deletes.
        const seated = new Set<string>([
          ...ttpRows.map((p) => p.tripMemberId),
          ...partRows.map((p) => p.tripMemberId),
        ]);
        const rostered = new Set(payload.players.map((p) => p.memberId));
        const missing = [...seated].filter((id) => !rostered.has(id));
        assertEq(
          missing.length,
          0,
          `${slug}: every player who is seated or in a matchup is on the roster`,
        );

        for (const pr of payload.rounds) {
          const stored = roundRows.find((r) => r.id === pr.roundId);
          if (!stored) {
            assert(false, `${slug}: a posted round has no stored counterpart`);
            continue;
          }
          const label = stored.label ?? `Round ${stored.order}`;

          const storedGroups = ttRows
            .filter((t) => t.roundId === stored.id)
            .map((t) =>
              ttpRows
                .filter((x) => x.teeTimeId === t.id && rostered.has(x.tripMemberId))
                .map((x) => x.tripMemberId),
            );
          const storedMatches = matchRows
            .filter((m) => m.roundId === stored.id)
            .map((m) => ({
              format: m.format as string,
              sideA: partRows
                .filter((x) => x.matchId === m.id && x.teamId === teamA.id)
                .map((x) => x.tripMemberId),
              sideB: partRows
                .filter((x) => x.matchId === m.id && x.teamId === teamB.id)
                .map((x) => x.tripMemberId),
            }));

          const posted = lineupSignature(
            pr.groups.map((g) => g.map(memberIdAt)),
            pr.matches.map((m) => ({
              format: m.format as string,
              sideA: m.sideA.map(memberIdAt),
              sideB: m.sideB.map(memberIdAt),
            })),
          );
          assertEq(
            posted,
            lineupSignature(storedGroups, storedMatches),
            `${slug} · ${label}: posted lineup is byte-identical to the stored one`,
          );
          assertEq(
            pr.courseId,
            stored.courseId,
            `${slug} · ${label}: course survives the round trip`,
          );
        }
      }
    },
  );
}

/** Copy of the canonical form `saveEvent` compares lineups with. */
function lineupSignature(
  groups: string[][],
  ms: { format: string; sideA: string[]; sideB: string[] }[],
): string {
  const g = groups
    .map((x) => [...x].sort().join(','))
    .sort()
    .join('|');
  const m = ms
    .map(
      (x) =>
        `${x.format}:${[...x.sideA].sort().join(',')}:${[...x.sideB].sort().join(',')}`,
    )
    .sort()
    .join('|');
  return `${g}#${m}`;
}
