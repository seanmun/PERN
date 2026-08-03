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

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { matches, rounds, trips } from '@/db/schema';
import { getScheduleByDay } from '@/lib/data/schedule';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { assert, assertEq, blocked, note, scenario } from '../core';

const SLUG = 'pcup26';
const EXPECTED_MATCHES = 15;

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
}
