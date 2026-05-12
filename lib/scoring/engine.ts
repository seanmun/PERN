/**
 * Match-play scoring engine.
 *
 * Pure functions. No DB. Inputs come in, results come out — no side effects.
 *
 * Handles 1v1 singles and 2v2 best-ball (where a team's hole score is the
 * lowest net among its players for that hole). USGA stroke allocation: lowest
 * handicap in the match plays as scratch; others receive strokes on hardest-
 * rated holes first, distributing extras at handicap ≥ 18.
 */

export type EnginePlayer = {
  id: string;
  handicap: number;     // numeric, e.g. 24.5
  teamSide: 'A' | 'B';  // which side of the match they play on
};

export type EngineHole = {
  number: number;       // 1..18
  par: number;
  handicapIndex: number; // 1..18; 1 = hardest
};

export type EngineScore = {
  playerId: string;
  holeNumber: number;
  gross: number;
};

export type HoleResult = {
  holeNumber: number;
  par: number;
  aBestNet: number | null;
  bBestNet: number | null;
  winner: 'A' | 'B' | 'halved' | null; // null if hole not yet scored on at least one side
  statusAfter: { upA: number; upB: number };
};

export type MatchStatus =
  | { kind: 'not_started' }
  | { kind: 'in_progress'; leader: 'A' | 'B' | null; up: number; remaining: number }
  | { kind: 'dormie'; leader: 'A' | 'B'; up: number }
  | { kind: 'closed'; winner: 'A' | 'B'; up: number; remaining: number }
  | { kind: 'halved' }; // all holes played, AS

export type ComputedMatch = {
  status: MatchStatus;
  holesPlayed: number;
  totalHoles: number;
  upA: number;
  upB: number;
  holeResults: HoleResult[];
  strokesByPlayer: Map<string, Map<number, number>>; // playerId -> (holeNumber -> strokes)
};

/**
 * USGA-style stroke allocation. Lowest handicap in the match plays scratch.
 * Others receive strokes per hole based on their differential vs the lowest:
 *   strokes(hole) = floor(diff / 18) + (diff % 18 >= holeSI ? 1 : 0)
 */
export function computeStrokes(
  players: EnginePlayer[],
  holes: EngineHole[]
): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>();
  if (players.length === 0) return result;

  const minH = Math.min(...players.map((p) => p.handicap));

  for (const p of players) {
    const diff = Math.max(0, Math.round(p.handicap - minH));
    const perHole = new Map<number, number>();
    for (const hole of holes) {
      const base = Math.floor(diff / 18);
      const extra = diff % 18 >= hole.handicapIndex ? 1 : 0;
      perHole.set(hole.number, base + extra);
    }
    result.set(p.id, perHole);
  }

  return result;
}

/**
 * Compute the running state of a match from gross scores. Stops "playing" once
 * the match is mathematically decided — extra scores past closure are ignored
 * (matches the real-world rule).
 */
export function computeMatch(input: {
  players: EnginePlayer[];
  holes: EngineHole[];
  scores: EngineScore[];
}): ComputedMatch {
  const { players, holes } = input;
  const totalHoles = holes.length;
  const strokesByPlayer = computeStrokes(players, holes);

  // Index scores: playerId -> holeNumber -> gross
  const scoreByPlayerHole = new Map<string, Map<number, number>>();
  for (const s of input.scores) {
    const inner = scoreByPlayerHole.get(s.playerId) ?? new Map<number, number>();
    inner.set(s.holeNumber, s.gross);
    scoreByPlayerHole.set(s.playerId, inner);
  }

  const sideA = players.filter((p) => p.teamSide === 'A');
  const sideB = players.filter((p) => p.teamSide === 'B');

  const sortedHoles = [...holes].sort((a, b) => a.number - b.number);

  function bestNetOnSide(side: EnginePlayer[], holeNumber: number): number | null {
    const nets: number[] = [];
    for (const p of side) {
      const gross = scoreByPlayerHole.get(p.id)?.get(holeNumber);
      if (gross == null) continue;
      const strokes = strokesByPlayer.get(p.id)?.get(holeNumber) ?? 0;
      nets.push(gross - strokes);
    }
    return nets.length > 0 ? Math.min(...nets) : null;
  }

  let upA = 0;
  let upB = 0;
  let holesPlayed = 0;
  let closed: { winner: 'A' | 'B'; up: number; remaining: number } | null = null;

  const holeResults: HoleResult[] = [];

  for (const hole of sortedHoles) {
    const aBest = bestNetOnSide(sideA, hole.number);
    const bBest = bestNetOnSide(sideB, hole.number);

    let winner: HoleResult['winner'] = null;
    let countedThisHole = false;

    if (!closed && aBest != null && bBest != null) {
      if (aBest < bBest) {
        winner = 'A';
        upA += 1;
      } else if (bBest < aBest) {
        winner = 'B';
        upB += 1;
      } else {
        winner = 'halved';
      }
      holesPlayed += 1;
      countedThisHole = true;

      const lead = upA - upB;
      const remaining = totalHoles - holesPlayed;
      if (Math.abs(lead) > remaining) {
        closed = {
          winner: lead > 0 ? 'A' : 'B',
          up: Math.abs(lead),
          remaining,
        };
      }
    } else if (aBest != null && bBest != null && closed) {
      // After closure: scores can still be entered for completeness but they
      // don't change the result. Mark the hole as having scores but no winner
      // (we don't count post-closure holes).
      winner = null;
    }

    holeResults.push({
      holeNumber: hole.number,
      par: hole.par,
      aBestNet: aBest,
      bBestNet: bBest,
      winner: countedThisHole ? winner : null,
      statusAfter: { upA, upB },
    });
  }

  const status = buildStatus({
    closed,
    upA,
    upB,
    holesPlayed,
    totalHoles,
  });

  return {
    status,
    holesPlayed,
    totalHoles,
    upA,
    upB,
    holeResults,
    strokesByPlayer,
  };
}

function buildStatus(args: {
  closed: { winner: 'A' | 'B'; up: number; remaining: number } | null;
  upA: number;
  upB: number;
  holesPlayed: number;
  totalHoles: number;
}): MatchStatus {
  const { closed, upA, upB, holesPlayed, totalHoles } = args;

  if (closed) {
    return {
      kind: 'closed',
      winner: closed.winner,
      up: closed.up,
      remaining: closed.remaining,
    };
  }

  if (holesPlayed === 0) {
    return { kind: 'not_started' };
  }

  const lead = upA - upB;
  const remaining = totalHoles - holesPlayed;

  if (holesPlayed === totalHoles) {
    if (lead === 0) return { kind: 'halved' };
    return {
      kind: 'in_progress',
      leader: lead > 0 ? 'A' : 'B',
      up: Math.abs(lead),
      remaining: 0,
    };
  }

  if (Math.abs(lead) === remaining && remaining > 0) {
    return { kind: 'dormie', leader: lead > 0 ? 'A' : 'B', up: Math.abs(lead) };
  }

  if (lead === 0) {
    return { kind: 'in_progress', leader: null, up: 0, remaining };
  }

  return {
    kind: 'in_progress',
    leader: lead > 0 ? 'A' : 'B',
    up: Math.abs(lead),
    remaining,
  };
}

/**
 * Human-readable status. Match-play conventions:
 *   "X UP", "AS", "DORMIE", "X & Y" (closed), "Halved" (after 18 tied).
 */
export function formatStatus(s: MatchStatus): string {
  switch (s.kind) {
    case 'not_started':
      return '—';
    case 'in_progress':
      return s.leader == null ? 'AS' : `${s.up} UP`;
    case 'dormie':
      return 'DORMIE';
    case 'closed':
      return `${s.up} & ${s.remaining}`;
    case 'halved':
      return 'AS';
  }
}

/** Convenience: which side won the match (or null if not yet decided). */
export function winnerSide(s: MatchStatus): 'A' | 'B' | 'halved' | null {
  if (s.kind === 'closed') return s.winner;
  if (s.kind === 'halved') return 'halved';
  return null;
}
