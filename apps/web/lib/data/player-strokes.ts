/**
 * Per-player stroke breakdown — the QA surface behind the profile page.
 *
 * Two different numbers exist for every player in every round, and until
 * you can see them side by side it is very hard to tell whether either is
 * right:
 *
 *   MATCH strokes  what this match resolved on. Baseline floats per
 *                  `matches.handicap_method` — the foursome's low
 *                  (group_low), the matchup's low (match_low), or scratch
 *                  (course). Two players in the same foursome playing
 *                  different matches can legitimately get different
 *                  numbers.
 *   BOARD strokes  what the individual leaderboard ranks on, per the
 *                  trip's Trip Scoring setting. One basis for everyone.
 *
 * Neither is computed here. `resolveMatchHandicaps` + `computeStrokes` are
 * the same pair `recomputeMatchStatus` runs, and `leaderboardBasis` is the
 * same function the leaderboard runs — so this page cannot report strokes
 * the app did not actually use. That is the entire point of it: a
 * breakdown with its own arithmetic would be a second opinion, and a
 * second opinion is worthless for cross-referencing against GHIN.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { matches, teeTimeParticipants, tripMembers, trips } from '@/db/schema';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import { resolveMatchHandicaps, teeRatingOf } from '@/lib/scoring/handicap-method';
import { leaderboardBasis } from '@/lib/scoring/leaderboard-basis';
import { computeStrokes } from '@buddycup/scoring/engine';
import { FORMAT_META, isTeamInput, type FormatId } from '@buddycup/scoring/formats';
import type { LeaderboardMethod } from '@/components/event-builder/state';

export type StrokeHole = {
  holeNumber: number;
  par: number;
  handicapIndex: number;
  /** Strokes this player gets on this hole in the match. */
  match: number;
  /** Strokes this player gets on this hole on the leaderboard. */
  board: number;
};

export type MatchStrokeBreakdown = {
  matchId: string;
  roundOrder: number;
  roundLabel: string | null;
  courseName: string;
  teeName: string | null;
  slope: number | null;
  rating: number | null;
  coursePar: number | null;
  format: FormatId;
  formatLabel: string;
  /** V1 team formats play gross — there is no per-player allocation. */
  teamFormat: boolean;

  /** The player's trip handicap, as an index. Null when unset. */
  index: number | null;

  // ---- Match basis ----
  handicapMethod: 'group_low' | 'match_low' | 'course';
  /** The handicap the match treated as scratch. Null for `course`. */
  scratch: number | null;
  /** Who holds that baseline, when it is somebody. */
  scratchHolder: string | null;
  /** Strokes received across the course's holes. */
  matchTotal: number;

  // ---- Leaderboard basis ----
  boardMethod: LeaderboardMethod;
  /** The handicap the board allocated off — the GHIN cross-reference. */
  boardPlayingHandicap: number;
  boardTotal: number;
  /** Course mode wanted slope/rating and the tee had none. */
  boardFellBack: boolean;

  holes: StrokeHole[];
};

export type PlayerStrokes = {
  boardMethod: LeaderboardMethod;
  matches: MatchStrokeBreakdown[];
};

export async function getPlayerStrokes(
  tripId: string,
  tripMemberId: string,
  matchIds: string[],
): Promise<PlayerStrokes> {
  const [trip] = await db
    .select({ leaderboardMethod: trips.leaderboardMethod })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const boardMethod =
    (trip?.leaderboardMethod as LeaderboardMethod) ?? 'net_course_handicap';

  const out: MatchStrokeBreakdown[] = [];

  for (const matchId of matchIds) {
    const data = await getMatchScoringData(matchId);
    if (!data) continue;

    const me = data.participants.find(
      (p) => p.participant.id === tripMemberId,
    );
    if (!me) continue;

    const index = me.participant.tripHandicap
      ? Number(me.participant.tripHandicap)
      : null;

    const format = data.match.format as FormatId;
    const teamFormat = isTeamInput(format);

    // ---- Match basis: exactly what recomputeMatchStatus resolves on ----
    const resolved = await resolveMatchHandicaps(data);
    const matchStrokes = teamFormat
      ? new Map<number, number>()
      : computeStrokes(
          resolved.enginePlayers,
          data.engineHoles,
          resolved.scratchHandicap,
        ).get(tripMemberId) ?? new Map<number, number>();

    let matchTotal = 0;
    for (const n of matchStrokes.values()) matchTotal += n;

    // ---- Leaderboard basis: exactly what getLeaderboard ranks on ----
    const tee = teeRatingOf(data);
    const board = leaderboardBasis({
      method: boardMethod,
      index: index ?? 18,
      tee,
      holes: data.courseHoles.map((h) => ({
        holeNumber: h.holeNumber,
        handicapIndex: h.handicapIndex,
      })),
    });

    out.push({
      matchId,
      roundOrder: data.round.order,
      roundLabel: data.round.label,
      courseName: data.course.name,
      teeName: data.tee?.name ?? null,
      slope: data.tee?.slope ?? null,
      rating: data.tee?.rating != null ? Number(data.tee.rating) : null,
      coursePar: tee.par,
      format,
      formatLabel: FORMAT_META[format]?.label ?? format,
      teamFormat,
      index,
      handicapMethod: data.match.handicapMethod as MatchStrokeBreakdown['handicapMethod'],
      scratch: resolved.scratchHandicap ?? null,
      scratchHolder: null,
      matchTotal,
      boardMethod,
      boardPlayingHandicap: board.playingHandicap,
      boardTotal: board.total,
      boardFellBack: board.fellBack,
      holes: data.courseHoles
        .slice()
        .sort((a, b) => a.holeNumber - b.holeNumber)
        .map((h) => ({
          holeNumber: h.holeNumber,
          par: h.par,
          handicapIndex: h.handicapIndex,
          match: matchStrokes.get(h.holeNumber) ?? 0,
          board: board.strokes.get(h.holeNumber) ?? 0,
        })),
    });
  }

  await nameScratchHolders(out, matchIds);
  return { boardMethod, matches: out };
}

/**
 * Put a name to each match's scratch baseline.
 *
 * "13.0" on its own is hard to check; "13.0 (DS)" can be verified against
 * the foursome at a glance, which is the whole job of this page. Done in
 * one pass over every relevant foursome rather than per match.
 */
async function nameScratchHolders(
  rows: MatchStrokeBreakdown[],
  matchIds: string[],
): Promise<void> {
  const needing = rows.filter((r) => r.scratch != null);
  if (!needing.length || !matchIds.length) return;

  // The baseline comes from the foursome under group_low and from the
  // match under match_low; both are covered by looking at everyone who
  // rides in the tee times these matches belong to, plus their opponents.
  const matchRows = await db
    .select({ id: matches.id, teeTimeId: matches.teeTimeId })
    .from(matches)
    .where(inArray(matches.id, matchIds));
  const teeTimeIds = matchRows
    .map((m) => m.teeTimeId)
    .filter((x): x is string => !!x);
  if (!teeTimeIds.length) return;

  const seats = await db
    .select({
      teeTimeId: teeTimeParticipants.teeTimeId,
      nickname: tripMembers.nickname,
      handicap: tripMembers.tripHandicap,
    })
    .from(teeTimeParticipants)
    .innerJoin(tripMembers, eq(teeTimeParticipants.tripMemberId, tripMembers.id))
    .where(inArray(teeTimeParticipants.teeTimeId, teeTimeIds));

  const teeTimeByMatch = new Map(matchRows.map((m) => [m.id, m.teeTimeId]));
  for (const row of needing) {
    const ttId = teeTimeByMatch.get(row.matchId);
    if (!ttId) continue;
    const holder = seats.find(
      (s) =>
        s.teeTimeId === ttId &&
        s.handicap != null &&
        Number(s.handicap) === row.scratch,
    );
    row.scratchHolder = holder?.nickname ?? null;
  }
}
