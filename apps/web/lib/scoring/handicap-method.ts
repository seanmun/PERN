/**
 * Per-match handicap-method resolution. One place that turns a match's
 * `handicap_method` column into the engine inputs every compute site
 * uses, so match play / stableford / stroke play / 30-ball / the live
 * scoreboard all agree on strokes:
 *
 *   group_low : differential vs the lowest handicap in the FOURSOME
 *               (tee_time_participants roster; falls back to match
 *               participants for cross-foursome matches) — the original
 *               Cup convention and the column default.
 *   match_low : differential vs the lowest handicap in the MATCH — the
 *               engine's own default when no scratch override is passed.
 *   course    : full course handicap per player — trip handicap treated
 *               as an index, converted via the round tee's slope/rating
 *               (Index × Slope/113 + (Rating − Par)), scratch baseline 0.
 *               Falls back to the raw index when the tee has no
 *               slope/rating (`courseDataMissing` flags it for the UI).
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  courseHoles,
  courseTees,
  matchParticipants,
  rounds,
  teeTimeParticipants,
  tripMembers,
} from '@/db/schema';
import {
  computeTeamHandicap,
  type EnginePlayer,
  type EngineTeam,
  type TeamInputFormat,
} from '@buddycup/scoring/engine';
import {
  toCourseHandicap,
  hasCourseRating,
  type TeeRating,
} from '@buddycup/scoring/handicap';
import type { MatchScoringData } from '@/lib/data/match-scoring';

/** The round tee's slope/rating + course par in the shape
 * toCourseHandicap wants. Par = sum of the course's hole pars. */
export function teeRatingOf(
  data: Pick<MatchScoringData, 'tee' | 'courseHoles'>,
): TeeRating {
  return {
    slope: data.tee?.slope ?? null,
    rating: data.tee?.rating != null ? Number(data.tee.rating) : null,
    par: data.courseHoles.length
      ? data.courseHoles.reduce((sum, h) => sum + h.par, 0)
      : null,
  };
}

/**
 * The "scratch" baseline for group_low: lowest handicap on the SCORECARD
 * (the foursome), not just in the match. A 1v1 between a 20 and a 26
 * still gives BOTH strokes when an 8 sits in the same foursome. For
 * round-wide (cross-foursome) matches with no tee_time_id, falls back to
 * the lowest handicap among the match's own participants.
 */
export async function getScratchHandicap(
  matchId: string,
  teeTimeId: string | null,
): Promise<number | undefined> {
  let memberIds: string[] = [];
  if (teeTimeId) {
    const rows = await db
      .select({ tripMemberId: teeTimeParticipants.tripMemberId })
      .from(teeTimeParticipants)
      .where(eq(teeTimeParticipants.teeTimeId, teeTimeId));
    memberIds = rows.map((r) => r.tripMemberId);
  }
  if (memberIds.length === 0) {
    // No tee time / roster never set — fall back to match participants.
    const fb = await db
      .select({ tripMemberId: matchParticipants.tripMemberId })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId));
    memberIds = fb.map((r) => r.tripMemberId);
  }
  if (memberIds.length === 0) return undefined;
  const members = await db
    .select({ tripHandicap: tripMembers.tripHandicap })
    .from(tripMembers)
    .where(inArray(tripMembers.id, memberIds));
  const hcps = members
    .map((m) => (m.tripHandicap ? Number(m.tripHandicap) : null))
    .filter((n): n is number => n != null && Number.isFinite(n));
  if (hcps.length === 0) return undefined;
  return Math.min(...hcps);
}

/**
 * Whether a round can produce TRUE course handicaps: its tee (explicit
 * pick, else the course default) has slope + rating, and the course has
 * hole data (for par). Drives the match builder's "add slope/rating"
 * warning when the admin picks the course method.
 */
export async function roundTeeHasSlopeRating(roundId: string): Promise<boolean> {
  const [round] = await db
    .select({ courseId: rounds.courseId, courseTeeId: rounds.courseTeeId })
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!round) return false;
  const tees = await db
    .select()
    .from(courseTees)
    .where(eq(courseTees.courseId, round.courseId));
  const tee =
    tees.find((t) => t.id === round.courseTeeId) ??
    tees.find((t) => t.isDefault) ??
    null;
  if (!tee || tee.slope == null || tee.rating == null) return false;
  const holes = await db
    .select({ par: courseHoles.par })
    .from(courseHoles)
    .where(eq(courseHoles.courseId, round.courseId));
  return holes.length > 0;
}

export type ResolvedHandicaps = {
  enginePlayers: EnginePlayer[];
  engineTeams: EngineTeam[] | null;
  scratchHandicap: number | undefined;
  /** True when method is 'course' but the round's tee lacks slope/rating
   * (or the course has no par data) — strokes fell back to raw index. */
  courseDataMissing: boolean;
};

export async function resolveMatchHandicaps(
  data: MatchScoringData,
): Promise<ResolvedHandicaps> {
  const method = data.match.handicapMethod;

  if (method === 'match_low') {
    // Engine's built-in default: scratch floats to the match's lowest.
    return {
      enginePlayers: data.enginePlayers,
      engineTeams: data.engineTeams,
      scratchHandicap: undefined,
      courseDataMissing: false,
    };
  }

  if (method === 'course') {
    const tee = teeRatingOf(data);
    const enginePlayers = data.enginePlayers.map((p) => ({
      ...p,
      handicap: toCourseHandicap(p.handicap, tee),
    }));

    // Team-input formats: recompute the USGA team handicap from the
    // CONVERTED player handicaps so the team diff reflects the course.
    let engineTeams = data.engineTeams;
    if (engineTeams && engineTeams.length === 2) {
      const fmt = data.match.format as TeamInputFormat;
      engineTeams = engineTeams.map((et) => {
        const teammates = data.participants.filter((p) => p.team.id === et.id);
        const hcps = teammates.map((p) =>
          toCourseHandicap(
            p.participant.tripHandicap ? Number(p.participant.tripHandicap) : 18,
            tee,
          ),
        );
        let handicap: number;
        try {
          handicap = computeTeamHandicap(hcps, fmt);
        } catch {
          handicap = hcps[0] ?? 18;
        }
        return { ...et, handicap };
      });
    }

    return {
      enginePlayers,
      engineTeams,
      // Everyone plays off their full course handicap — scratch is 0,
      // so diff = the course handicap itself.
      scratchHandicap: 0,
      courseDataMissing: !hasCourseRating(tee),
    };
  }

  // group_low (default)
  return {
    enginePlayers: data.enginePlayers,
    engineTeams: data.engineTeams,
    scratchHandicap: await getScratchHandicap(
      data.match.id,
      data.match.teeTimeId,
    ),
    courseDataMissing: false,
  };
}
