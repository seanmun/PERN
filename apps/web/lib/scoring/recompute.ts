/**
 * Pure recompute-match-status logic. Lifted out of `lib/actions/scores.ts`
 * so non-action callers (scenario seeders, future cron jobs) can use it
 * without dragging in the auth / server-only chain that taints the
 * actions file.
 *
 * Reads everything it needs through getMatchScoringData + the engine,
 * writes back the four match columns:
 *   status / winning_team_id / is_halved / result_text / front_9_winning_team_id / back_9_winning_team_id
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  teeTimeParticipants,
  tripMembers,
} from '@/db/schema';
import { getMatchScoringData } from '@/lib/data/match-scoring';

/**
 * The "scratch" baseline for handicap allocation. Cup convention: strokes
 * are given vs the lowest handicap on the SCORECARD (the foursome), not
 * the lowest in the specific match. So a 1v1 between a 20 and a 26 still
 * gets BOTH strokes when an 8 sits in the same foursome.
 *
 * For round-wide (cross-foursome) matches with no tee_time_id, falls back
 * to the lowest handicap among that match's participants (no broader
 * scorecard exists).
 */
export async function getScratchHandicap(
  matchId: string,
  teeTimeId: string | null,
  roundId: string,
): Promise<number | undefined> {
  let memberIds: string[] = [];
  if (teeTimeId) {
    const rows = await db
      .select({ tripMemberId: teeTimeParticipants.tripMemberId })
      .from(teeTimeParticipants)
      .where(eq(teeTimeParticipants.teeTimeId, teeTimeId));
    memberIds = rows.map((r) => r.tripMemberId);
    if (memberIds.length === 0) {
      // Roster never set; fall back to match participants.
      const fb = await db
        .select({ tripMemberId: matchParticipants.tripMemberId })
        .from(matchParticipants)
        .where(eq(matchParticipants.matchId, matchId));
      memberIds = fb.map((r) => r.tripMemberId);
    }
  } else {
    const rows = await db
      .select({ tripMemberId: matchParticipants.tripMemberId })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId));
    memberIds = rows.map((r) => r.tripMemberId);
    void roundId; // reserved for future round-wide fallback if needed
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
import {
  computeMatch,
  computeStableford,
  computeStrokePlayMatch,
  computeTeamMatch,
  computeThirtyBallMatch,
  DEFAULT_STABLEFORD_POINTS,
  formatStatus,
  formatStrokePlayStatus,
  formatThirtyBallStatus,
  type PlayerInputFormat,
  type StablefordPoints,
} from '@buddycup/scoring/engine';

const PLAYER_INPUT_FORMATS: ReadonlySet<string> = new Set<PlayerInputFormat>([
  'best_ball',
  'singles',
  'two_man_aggregate',
]);

export async function recomputeMatchStatus(matchId: string): Promise<void> {
  const data = await getMatchScoringData(matchId);
  if (!data) return;

  // Cup convention: scratch = foursome's lowest handicap. Without this,
  // a 1v1 between a 20 and a 26 would compute strokes vs each other
  // (Seany +6) instead of vs the 8 sitting in the same foursome
  // (Seany 18, Fister 12). Wrong baseline → wrong hole-by-hole match status.
  const scratchHandicap = await getScratchHandicap(
    matchId,
    data.match.teeTimeId,
    data.round.id,
  );

  // Map A/B back to the actual team IDs. data.participants carries the side.
  const teamIdByside = new Map<'A' | 'B', string>();
  for (const p of data.participants) {
    if (!teamIdByside.has(p.side)) teamIdByside.set(p.side, p.team.id);
  }

  let nextStatus: 'scheduled' | 'in_progress' | 'completed' = 'scheduled';
  let winningTeamId: string | null = null;
  let isHalved = false;
  let resultText: string | null = null;

  if (data.match.format === 'thirty_ball') {
    // Bespoke resolution regardless of the `scoring` field — this format
    // is always "sum of selected nets, low 18-hole total wins." See
    // computeThirtyBallMatch.
    const tb = computeThirtyBallMatch({
      players: data.enginePlayers,
      holes: data.engineHoles,
      scores: data.engineScores,
      scratchHandicap,
    });
    switch (tb.status.kind) {
      case 'not_started':
        nextStatus = 'scheduled';
        break;
      case 'in_progress':
        nextStatus = 'in_progress';
        resultText = formatThirtyBallStatus(tb.status);
        break;
      case 'final':
        nextStatus = 'completed';
        if (tb.status.winner === 'halved') {
          isHalved = true;
        } else {
          winningTeamId = teamIdByside.get(tb.status.winner) ?? null;
        }
        resultText = formatThirtyBallStatus(tb.status);
        break;
    }
  } else if (data.match.scoring === 'stableford') {
    const pts: StablefordPoints = {
      eagle: data.match.ptsEagle ?? DEFAULT_STABLEFORD_POINTS.eagle,
      birdie: data.match.ptsBirdie ?? DEFAULT_STABLEFORD_POINTS.birdie,
      par: data.match.ptsPar ?? DEFAULT_STABLEFORD_POINTS.par,
      bogey: data.match.ptsBogey ?? DEFAULT_STABLEFORD_POINTS.bogey,
      doublePlus: data.match.ptsDoublePlus ?? DEFAULT_STABLEFORD_POINTS.doublePlus,
    };
    const sb = computeStableford({
      players: data.enginePlayers,
      holes: data.engineHoles,
      scores: data.engineScores,
      points: pts,
    });
    switch (sb.status.kind) {
      case 'not_started':
        nextStatus = 'scheduled';
        break;
      case 'in_progress':
        nextStatus = 'in_progress';
        resultText = `${sb.aPoints}–${sb.bPoints} pts · thru ${sb.holesPlayed}`;
        break;
      case 'final':
        nextStatus = 'completed';
        if (sb.status.winner === 'halved') {
          isHalved = true;
          resultText = `Halved · ${sb.aPoints}–${sb.bPoints} pts`;
        } else {
          winningTeamId = teamIdByside.get(sb.status.winner) ?? null;
          resultText = `${sb.aPoints}–${sb.bPoints} pts`;
        }
        break;
    }
  } else if (
    data.match.scoring === 'stroke' &&
    data.inputMode !== 'team'
  ) {
    // Stroke play ("low total wins"). Team-input formats
    // (scramble/alt-shot) fall through to match-play below; stroke
    // resolution for those isn't built yet.
    const fmt = PLAYER_INPUT_FORMATS.has(data.match.format)
      ? (data.match.format as PlayerInputFormat)
      : 'best_ball';
    const sp = computeStrokePlayMatch({
      players: data.enginePlayers,
      holes: data.engineHoles,
      scores: data.engineScores,
      format: fmt,
      scratchHandicap,
    });
    switch (sp.status.kind) {
      case 'not_started':
        nextStatus = 'scheduled';
        break;
      case 'in_progress':
        nextStatus = 'in_progress';
        resultText = formatStrokePlayStatus(sp.status);
        break;
      case 'final':
        nextStatus = 'completed';
        if (sp.status.winner === 'halved') {
          isHalved = true;
        } else {
          winningTeamId = teamIdByside.get(sp.status.winner) ?? null;
        }
        resultText = formatStrokePlayStatus(sp.status);
        break;
    }
  } else {
    let computed;
    if (
      data.inputMode === 'team' &&
      data.engineTeams &&
      data.engineTeams.length === 2
    ) {
      computed = computeTeamMatch({
        teams: [data.engineTeams[0], data.engineTeams[1]],
        holes: data.engineHoles,
        scores: data.engineTeamScores ?? [],
      });
    } else {
      const fmt = PLAYER_INPUT_FORMATS.has(data.match.format)
        ? (data.match.format as PlayerInputFormat)
        : 'best_ball';
      computed = computeMatch({
        players: data.enginePlayers,
        holes: data.engineHoles,
        scores: data.engineScores,
        format: fmt,
        scratchHandicap,
      });
    }

    switch (computed.status.kind) {
      case 'not_started':
        nextStatus = 'scheduled';
        break;
      case 'in_progress':
      case 'dormie':
        nextStatus = 'in_progress';
        resultText = formatStatus(computed.status);
        break;
      case 'closed':
        nextStatus = 'completed';
        winningTeamId = teamIdByside.get(computed.status.winner) ?? null;
        resultText = formatStatus(computed.status);
        break;
      case 'halved':
        nextStatus = 'completed';
        isHalved = true;
        resultText = formatStatus(computed.status);
        break;
    }
  }

  // Segment winners — front 9 + back 9 run the engine on their own slice.
  // Stroke-scored and 30 Ball matches are overall-only — no front/back
  // split semantics wired up for either yet.
  let front9WinningTeamId: string | null = null;
  let back9WinningTeamId: string | null = null;
  if (
    data.match.scoring === 'match_play' &&
    data.match.format !== 'thirty_ball' &&
    data.engineHoles.length >= 18
  ) {
    const fmt = PLAYER_INPUT_FORMATS.has(data.match.format)
      ? (data.match.format as PlayerInputFormat)
      : 'best_ball';
    const runSegment = (from: number, to: number): string | null => {
      const holes = data.engineHoles.filter(
        (h) => h.number >= from && h.number <= to,
      );
      if (holes.length === 0) return null;
      if (data.inputMode === 'team' && data.engineTeams && data.engineTeams.length === 2) {
        const seg = computeTeamMatch({
          teams: [data.engineTeams[0], data.engineTeams[1]],
          holes,
          scores: (data.engineTeamScores ?? []).filter(
            (s) => s.holeNumber >= from && s.holeNumber <= to,
          ),
        });
        if (seg.status.kind === 'closed') {
          return teamIdByside.get(seg.status.winner) ?? null;
        }
        return null;
      }
      const seg = computeMatch({
        players: data.enginePlayers,
        holes,
        scores: data.engineScores.filter(
          (s) => s.holeNumber >= from && s.holeNumber <= to,
        ),
        format: fmt,
        scratchHandicap,
      });
      if (seg.status.kind === 'closed') {
        return teamIdByside.get(seg.status.winner) ?? null;
      }
      // 9-hole segment played out with a lead but didn't close early —
      // treat as segment-closed.
      if (seg.holesPlayed === holes.length && seg.upA !== seg.upB) {
        return teamIdByside.get(seg.upA > seg.upB ? 'A' : 'B') ?? null;
      }
      return null;
    };
    front9WinningTeamId = runSegment(1, 9);
    back9WinningTeamId = runSegment(10, 18);
  }

  await db
    .update(matches)
    .set({
      status: nextStatus,
      winningTeamId,
      isHalved,
      resultText,
      front9WinningTeamId,
      back9WinningTeamId,
    })
    .where(eq(matches.id, matchId));
}
