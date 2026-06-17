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

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { matches } from '@/db/schema';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import {
  computeMatch,
  computeStableford,
  computeTeamMatch,
  DEFAULT_STABLEFORD_POINTS,
  formatStatus,
  type PlayerInputFormat,
  type StablefordPoints,
} from '@/lib/scoring/engine';

const PLAYER_INPUT_FORMATS: ReadonlySet<string> = new Set<PlayerInputFormat>([
  'best_ball',
  'singles',
  'two_man_aggregate',
]);

export async function recomputeMatchStatus(matchId: string): Promise<void> {
  const data = await getMatchScoringData(matchId);
  if (!data) return;

  // Map A/B back to the actual team IDs. data.participants carries the side.
  const teamIdByside = new Map<'A' | 'B', string>();
  for (const p of data.participants) {
    if (!teamIdByside.has(p.side)) teamIdByside.set(p.side, p.team.id);
  }

  let nextStatus: 'scheduled' | 'in_progress' | 'completed' = 'scheduled';
  let winningTeamId: string | null = null;
  let isHalved = false;
  let resultText: string | null = null;

  if (data.match.scoring === 'stableford') {
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
  let front9WinningTeamId: string | null = null;
  let back9WinningTeamId: string | null = null;
  if (data.match.scoring !== 'stableford' && data.engineHoles.length >= 18) {
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
