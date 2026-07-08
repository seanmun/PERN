/**
 * Match-play scoring engine.
 *
 * Pure functions. No DB. Inputs come in, results come out — no side effects.
 *
 * Handles the player-input match-play formats:
 *   - 1v1 singles               (each side = 1 player, team net = that player's net)
 *   - 2v2 best ball (Four-Ball) (each side = 2 players, team net = LOWEST player net)
 *   - 2-man aggregate           (each side = 2 players, team net = SUM of player nets)
 *
 * Team-input formats (scramble, alternate shot) use a different engine because
 * the underlying data shape is "one team score per hole" rather than "one score
 * per player per hole." That lives in a sibling function.
 *
 * USGA stroke allocation: lowest handicap in the match plays as scratch; others
 * receive strokes on hardest-rated holes first, distributing extras at
 * handicap ≥ 18. For aggregate the calculation is identical (each player gets
 * their own stroke allocation; sums happen at net-comparison time, not earlier).
 */

export type PlayerInputFormat = 'best_ball' | 'singles' | 'two_man_aggregate';

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
  // "30 Ball" only — whether this specific score has been selected to
  // count toward the side's 30-score budget. Ignored by every other
  // format/engine function. See computeThirtyBallMatch.
  counted?: boolean;
};

export type HoleResult = {
  holeNumber: number;
  par: number;
  aBestNet: number | null;
  bBestNet: number | null;
  // Strokes given to the player whose net counts on this hole (max
  // strokes on the side for best-ball, the player's own for singles).
  // Used by the UI to render "+1" indicators next to the net.
  aStrokes: number;
  bStrokes: number;
  // Which player on the side posted the best net for the hole. Null
  // for team-input formats (scramble/alt-shot) and aggregate where
  // there isn't a single contributor. Lets the UI show "best ball by
  // Fister" under a 2v2 hole.
  aBestPlayerId: string | null;
  bBestPlayerId: string | null;
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
  holes: EngineHole[],
  // Optional override for the "scratch" baseline. Cup convention:
  // strokes are allocated against the FOURSOME's lowest handicap, not
  // the lowest of just the match's two players. Pass the foursome's
  // min handicap here so a 1v1 between a 20 and a 26 still gives BOTH
  // strokes when an 8 is sitting in the same foursome.
  scratchHandicap?: number,
): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>();
  if (players.length === 0) return result;

  const minH = scratchHandicap ?? Math.min(...players.map((p) => p.handicap));

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
 * Reduce one side's per-player nets on a hole to a single number, for
 * side-vs-side comparison. Shared between match-play (computeMatch) and
 * stroke-play (computeStrokePlayMatch) resolution — both must agree on
 * what a side "shot" on a given hole.
 *
 * two_man_aggregate sums ALL of the side's nets (needs every player
 * scored, else null); everything else takes the single lowest net,
 * best-ball style (needs at least one player scored).
 */
function aggregateSideNet(
  side: EnginePlayer[],
  holeNumber: number,
  scoreByPlayerHole: Map<string, Map<number, number>>,
  strokesByPlayer: Map<string, Map<number, number>>,
  format: PlayerInputFormat,
): number | null {
  const nets: number[] = [];
  for (const p of side) {
    const gross = scoreByPlayerHole.get(p.id)?.get(holeNumber);
    if (gross == null) {
      if (format === 'two_man_aggregate') return null;
      continue;
    }
    const strokes = strokesByPlayer.get(p.id)?.get(holeNumber) ?? 0;
    nets.push(gross - strokes);
  }
  if (nets.length === 0) return null;
  if (format === 'two_man_aggregate') {
    return nets.reduce((a, b) => a + b, 0);
  }
  return Math.min(...nets);
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
  format?: PlayerInputFormat;
  /** Foursome scratch baseline. See computeStrokes(scratchHandicap) docs. */
  scratchHandicap?: number;
}): ComputedMatch {
  const { players, holes } = input;
  const format = input.format ?? 'best_ball';
  const totalHoles = holes.length;
  const strokesByPlayer = computeStrokes(players, holes, input.scratchHandicap);

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

  /** Max strokes any player on the side is getting for that hole.
   * Drives the "+1" indicator on the scorecard. */
  function holeStrokes(side: EnginePlayer[], holeNumber: number): number {
    let max = 0;
    for (const p of side) {
      const n = strokesByPlayer.get(p.id)?.get(holeNumber) ?? 0;
      if (n > max) max = n;
    }
    return max;
  }

  function sideNetOnHole(side: EnginePlayer[], holeNumber: number): number | null {
    return aggregateSideNet(side, holeNumber, scoreByPlayerHole, strokesByPlayer, format);
  }

  /** For best-ball / singles, the player whose net was the side's best
   * on that hole. Null for aggregate (sum, no single contributor) or
   * when nobody on the side has a score yet. */
  function bestBallContributor(
    side: EnginePlayer[],
    holeNumber: number,
  ): string | null {
    if (format === 'two_man_aggregate') return null;
    let bestNet: number | null = null;
    let bestId: string | null = null;
    for (const p of side) {
      const gross = scoreByPlayerHole.get(p.id)?.get(holeNumber);
      if (gross == null) continue;
      const strokes = strokesByPlayer.get(p.id)?.get(holeNumber) ?? 0;
      const net = gross - strokes;
      if (bestNet == null || net < bestNet) {
        bestNet = net;
        bestId = p.id;
      }
    }
    return bestId;
  }

  let upA = 0;
  let upB = 0;
  let holesPlayed = 0;
  let closed: { winner: 'A' | 'B'; up: number; remaining: number } | null = null;

  const holeResults: HoleResult[] = [];

  for (const hole of sortedHoles) {
    const aNet = sideNetOnHole(sideA, hole.number);
    const bNet = sideNetOnHole(sideB, hole.number);

    let winner: HoleResult['winner'] = null;
    let countedThisHole = false;

    if (!closed && aNet != null && bNet != null) {
      if (aNet < bNet) {
        winner = 'A';
        upA += 1;
      } else if (bNet < aNet) {
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
    } else if (aNet != null && bNet != null && closed) {
      // After closure: scores can still be entered for completeness but they
      // don't change the result. Mark the hole as having scores but no winner
      // (we don't count post-closure holes).
      winner = null;
    }

    holeResults.push({
      holeNumber: hole.number,
      par: hole.par,
      aBestNet: aNet,
      bBestNet: bNet,
      aStrokes: holeStrokes(sideA, hole.number),
      bStrokes: holeStrokes(sideB, hole.number),
      aBestPlayerId: bestBallContributor(sideA, hole.number),
      bBestPlayerId: bestBallContributor(sideB, hole.number),
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
    // All holes played + a lead = match closed. Previously this
    // returned `in_progress` which meant the action layer never set
    // winningTeamId after the 18th hole.
    return {
      kind: 'closed',
      winner: lead > 0 ? 'A' : 'B',
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

/**
 * Human-readable status with the winning party prefixed. Falls back to
 * plain formatStatus when nothing's been decided yet. Pass the player
 * nickname for singles 1v1 and the team name for everything else.
 *
 *   closed   → "Seany 4 & 2"  /  "Mulligan Men 3 & 1"
 *   dormie   → "Seany DORMIE"
 *   in_progress with leader → "Seany 2 UP"
 */
export function formatStatusWithWinner(
  s: MatchStatus,
  sideAName: string | null,
  sideBName: string | null,
): string {
  const base = formatStatus(s);
  let leaderSide: 'A' | 'B' | null = null;
  if (s.kind === 'closed') leaderSide = s.winner;
  else if (s.kind === 'dormie') leaderSide = s.leader;
  else if (s.kind === 'in_progress' && s.leader) leaderSide = s.leader;
  if (!leaderSide) return base;
  const name = leaderSide === 'A' ? sideAName : sideBName;
  if (!name) return base;
  return `${name} ${base}`;
}

// ───────────────────────── STROKE PLAY ─────────────────────────
//
// "Low total wins" resolution — as opposed to match-play's hole-by-hole
// UP/DOWN with early closure. Per-hole side aggregation is IDENTICAL to
// computeMatch (shared via aggregateSideNet); what differs is how the
// per-hole numbers combine into a result: summed across all 18 holes and
// compared once, not decided hole-by-hole. Individual-input formats only
// (scramble/alternate_shot's team-scored gross isn't wired through here).

export type StrokePlayHoleResult = {
  holeNumber: number;
  par: number;
  // This hole's side aggregate (NOT a running total) — null until enough
  // of the side has scored to know it (see aggregateSideNet).
  aTotal: number | null;
  bTotal: number | null;
  aStrokes: number;
  bStrokes: number;
};

export type StrokePlayStatus =
  | { kind: 'not_started' }
  | { kind: 'in_progress'; totalA: number; totalB: number; holesPlayed: number }
  | { kind: 'final'; totalA: number; totalB: number; winner: 'A' | 'B' | 'halved' };

export type ComputedStrokePlay = {
  status: StrokePlayStatus;
  holesPlayed: number;
  totalHoles: number;
  totalA: number;
  totalB: number;
  holeResults: StrokePlayHoleResult[];
  strokesByPlayer: Map<string, Map<number, number>>;
};

export function computeStrokePlayMatch(input: {
  players: EnginePlayer[];
  holes: EngineHole[];
  scores: EngineScore[];
  format?: PlayerInputFormat;
  scratchHandicap?: number;
}): ComputedStrokePlay {
  const { players, holes } = input;
  const format = input.format ?? 'best_ball';
  const totalHoles = holes.length;
  const strokesByPlayer = computeStrokes(players, holes, input.scratchHandicap);

  const scoreByPlayerHole = new Map<string, Map<number, number>>();
  for (const s of input.scores) {
    const inner = scoreByPlayerHole.get(s.playerId) ?? new Map<number, number>();
    inner.set(s.holeNumber, s.gross);
    scoreByPlayerHole.set(s.playerId, inner);
  }

  const sideA = players.filter((p) => p.teamSide === 'A');
  const sideB = players.filter((p) => p.teamSide === 'B');
  const sortedHoles = [...holes].sort((a, b) => a.number - b.number);

  function holeStrokes(side: EnginePlayer[], holeNumber: number): number {
    let max = 0;
    for (const p of side) {
      const n = strokesByPlayer.get(p.id)?.get(holeNumber) ?? 0;
      if (n > max) max = n;
    }
    return max;
  }

  let totalA = 0;
  let totalB = 0;
  let holesPlayed = 0;
  const holeResults: StrokePlayHoleResult[] = [];

  for (const hole of sortedHoles) {
    const aTotal = aggregateSideNet(sideA, hole.number, scoreByPlayerHole, strokesByPlayer, format);
    const bTotal = aggregateSideNet(sideB, hole.number, scoreByPlayerHole, strokesByPlayer, format);
    // Only count holes where BOTH sides have a value — keeps the running
    // totals comparable instead of one side racing ahead just because
    // its players entered scores first.
    if (aTotal != null && bTotal != null) {
      totalA += aTotal;
      totalB += bTotal;
      holesPlayed += 1;
    }
    holeResults.push({
      holeNumber: hole.number,
      par: hole.par,
      aTotal,
      bTotal,
      aStrokes: holeStrokes(sideA, hole.number),
      bStrokes: holeStrokes(sideB, hole.number),
    });
  }

  let status: StrokePlayStatus;
  if (holesPlayed === 0) {
    status = { kind: 'not_started' };
  } else if (holesPlayed < totalHoles) {
    status = { kind: 'in_progress', totalA, totalB, holesPlayed };
  } else {
    // Stroke play: no early closure. Decided only once all 18 holes are
    // in for both sides — lower total wins.
    const winner: 'A' | 'B' | 'halved' =
      totalA < totalB ? 'A' : totalB < totalA ? 'B' : 'halved';
    status = { kind: 'final', totalA, totalB, winner };
  }

  return {
    status,
    holesPlayed,
    totalHoles,
    totalA,
    totalB,
    holeResults,
    strokesByPlayer,
  };
}

/** Human-readable stroke-play status: "58-61 thru 14", "58-61" (final),
 * "Halved 58-58". */
export function formatStrokePlayStatus(s: StrokePlayStatus): string {
  switch (s.kind) {
    case 'not_started':
      return '—';
    case 'in_progress':
      return `${s.totalA}-${s.totalB} thru ${s.holesPlayed}`;
    case 'final':
      return s.winner === 'halved'
        ? `Halved ${s.totalA}-${s.totalB}`
        : `${s.totalA}-${s.totalB}`;
  }
}

// ───────────────────────── "30 BALL" ─────────────────────────
//
// 3v3. All 6 players play their own ball, full round. Each side has a
// budget of THIRTY_BALL_BUDGET (30) scores they get to select — out of
// up to 3 players × 18 holes = 54 possible — to count toward their
// total. Per hole a side can select 0, 1, 2, or 3 of its players'
// scores; whichever gets selected gets SUMMED (not best-of). Decided by
// low 18-hole cumulative total, same as stroke play. The budget itself
// isn't engine-enforced (captains self-police hitting exactly 30 by
// hole 18) — the engine just sums whatever's marked counted and reports
// the running count so the UI can show "22/30 selected."

export const THIRTY_BALL_BUDGET = 30;

export type ThirtyBallHoleResult = {
  holeNumber: number;
  par: number;
  // Sum of counted nets on this side this hole. 0 if the side selected
  // nothing — a deliberate choice, not "unknown."
  aTotal: number;
  bTotal: number;
  // How many of the side's players were counted this hole (0-3).
  aSelectedCount: number;
  bSelectedCount: number;
  aStrokes: number;
  bStrokes: number;
};

export type ThirtyBallStatus =
  | { kind: 'not_started' }
  | { kind: 'in_progress'; totalA: number; totalB: number; holesPlayed: number }
  | { kind: 'final'; totalA: number; totalB: number; winner: 'A' | 'B' | 'halved' };

export type ComputedThirtyBall = {
  status: ThirtyBallStatus;
  holesPlayed: number;
  totalHoles: number;
  totalA: number;
  totalB: number;
  // Cumulative count of counted=true scores so far, per side — the "X
  // of 30" the UI displays. Not clamped; if a side over-selects past 30
  // that's visible here too (self-policing, per house rules).
  selectedCountA: number;
  selectedCountB: number;
  holeResults: ThirtyBallHoleResult[];
  strokesByPlayer: Map<string, Map<number, number>>;
};

export function computeThirtyBallMatch(input: {
  players: EnginePlayer[];
  holes: EngineHole[];
  scores: EngineScore[];
  scratchHandicap?: number;
}): ComputedThirtyBall {
  const { players, holes } = input;
  const totalHoles = holes.length;
  const strokesByPlayer = computeStrokes(players, holes, input.scratchHandicap);

  const scoreByPlayerHole = new Map<string, Map<number, number>>();
  const countedByPlayerHole = new Map<string, Map<number, boolean>>();
  for (const s of input.scores) {
    const inner = scoreByPlayerHole.get(s.playerId) ?? new Map<number, number>();
    inner.set(s.holeNumber, s.gross);
    scoreByPlayerHole.set(s.playerId, inner);

    const countedInner =
      countedByPlayerHole.get(s.playerId) ?? new Map<number, boolean>();
    countedInner.set(s.holeNumber, s.counted ?? false);
    countedByPlayerHole.set(s.playerId, countedInner);
  }

  const sideA = players.filter((p) => p.teamSide === 'A');
  const sideB = players.filter((p) => p.teamSide === 'B');
  const sortedHoles = [...holes].sort((a, b) => a.number - b.number);

  function holeStrokes(side: EnginePlayer[], holeNumber: number): number {
    let max = 0;
    for (const p of side) {
      const n = strokesByPlayer.get(p.id)?.get(holeNumber) ?? 0;
      if (n > max) max = n;
    }
    return max;
  }

  function selectedSideNet(
    side: EnginePlayer[],
    holeNumber: number,
  ): { total: number; count: number } {
    let total = 0;
    let count = 0;
    for (const p of side) {
      const counted = countedByPlayerHole.get(p.id)?.get(holeNumber) ?? false;
      if (!counted) continue;
      const gross = scoreByPlayerHole.get(p.id)?.get(holeNumber);
      if (gross == null) continue;
      const strokes = strokesByPlayer.get(p.id)?.get(holeNumber) ?? 0;
      total += gross - strokes;
      count += 1;
    }
    return { total, count };
  }

  // Round progress: a hole counts as "played" once ANY of the 6 players
  // has a recorded gross — independent of selection. A side validly
  // selecting zero scores on a hole doesn't make the hole "not played."
  const scoredHoles = new Set<number>();
  for (const s of input.scores) scoredHoles.add(s.holeNumber);

  let totalA = 0;
  let totalB = 0;
  let selectedCountA = 0;
  let selectedCountB = 0;
  const holeResults: ThirtyBallHoleResult[] = [];

  for (const hole of sortedHoles) {
    const a = selectedSideNet(sideA, hole.number);
    const b = selectedSideNet(sideB, hole.number);
    totalA += a.total;
    totalB += b.total;
    selectedCountA += a.count;
    selectedCountB += b.count;
    holeResults.push({
      holeNumber: hole.number,
      par: hole.par,
      aTotal: a.total,
      bTotal: b.total,
      aSelectedCount: a.count,
      bSelectedCount: b.count,
      aStrokes: holeStrokes(sideA, hole.number),
      bStrokes: holeStrokes(sideB, hole.number),
    });
  }

  const holesPlayed = scoredHoles.size;
  let status: ThirtyBallStatus;
  if (holesPlayed === 0) {
    status = { kind: 'not_started' };
  } else if (holesPlayed < totalHoles) {
    status = { kind: 'in_progress', totalA, totalB, holesPlayed };
  } else {
    const winner: 'A' | 'B' | 'halved' =
      totalA < totalB ? 'A' : totalB < totalA ? 'B' : 'halved';
    status = { kind: 'final', totalA, totalB, winner };
  }

  return {
    status,
    holesPlayed,
    totalHoles,
    totalA,
    totalB,
    selectedCountA,
    selectedCountB,
    holeResults,
    strokesByPlayer,
  };
}

/** Human-readable "30 Ball" status: "58-61 thru 14", "58-61" (final),
 * "Halved 58-58". */
export function formatThirtyBallStatus(s: ThirtyBallStatus): string {
  switch (s.kind) {
    case 'not_started':
      return '—';
    case 'in_progress':
      return `${s.totalA}-${s.totalB} thru ${s.holesPlayed}`;
    case 'final':
      return s.winner === 'halved'
        ? `Halved ${s.totalA}-${s.totalB}`
        : `${s.totalA}-${s.totalB}`;
  }
}

// ───────────────────────── TEAM-INPUT FORMATS ─────────────────────────
//
// Scramble and Alternate Shot: one ball per team, one gross per hole per team
// (not per player). The engine input shape collapses to two virtual "players"
// — one per team — each with a computed team handicap and a per-hole gross.

export type TeamInputFormat = 'scramble' | 'alternate_shot';

/**
 * USGA team-handicap calculations.
 *
 *  - **Scramble (2-person)**: 35% of low + 15% of high handicap.
 *    Heavily favors the better player; the worse player's handicap barely
 *    matters because in a scramble the team picks the best shot.
 *
 *  - **Scramble (4-person)**: 25% A + 20% B + 15% C + 10% D, where A is the
 *    lowest handicap and D is the highest. USGA standard for charity-outing
 *    scrambles.
 *
 *  - **Alternate Shot (Foursomes)**: 50% of (A + B) combined. Each player
 *    only hits half the shots, so the team handicap is the average of the
 *    two full handicaps. Always 2 players per side — there's no widely used
 *    multi-player alt-shot format.
 *
 * Rounds to one decimal at the end. Scramble accepts 2 or 4 player teams;
 * alternate_shot requires exactly 2. Anything else throws.
 */
export function computeTeamHandicap(
  playerHandicaps: number[],
  format: TeamInputFormat,
): number {
  if (format === 'alternate_shot') {
    if (playerHandicaps.length !== 2) {
      throw new Error(
        `Alternate shot requires exactly 2 players (got ${playerHandicaps.length}).`,
      );
    }
    const [a, b] = playerHandicaps;
    return Math.round(0.5 * (a + b) * 10) / 10;
  }
  // scramble
  const sorted = [...playerHandicaps].sort((a, b) => a - b);
  if (sorted.length === 2) {
    return Math.round((0.35 * sorted[0] + 0.15 * sorted[1]) * 10) / 10;
  }
  if (sorted.length === 4) {
    return Math.round(
      (0.25 * sorted[0] + 0.20 * sorted[1] + 0.15 * sorted[2] + 0.10 * sorted[3]) * 10,
    ) / 10;
  }
  throw new Error(
    `Scramble team handicap requires 2 or 4 players (got ${sorted.length}).`,
  );
}

export type EngineTeam = {
  id: string;          // team-side id (typically the team.id from the DB)
  side: 'A' | 'B';
  handicap: number;    // already computed via computeTeamHandicap
};

export type EngineTeamScore = {
  teamId: string;      // matches an EngineTeam.id
  holeNumber: number;
  gross: number;
};

/**
 * Compute a team-vs-team match. Mirrors computeMatch's shape so the caller
 * code (recompute / status display) treats both engines uniformly. The
 * difference is that strokes are allocated team-to-team (high handicap team
 * vs low handicap team) instead of player-to-player.
 *
 * Status / closure / dormie logic is identical to player-input matches.
 */
export function computeTeamMatch(input: {
  teams: [EngineTeam, EngineTeam];
  holes: EngineHole[];
  scores: EngineTeamScore[];
}): ComputedMatch {
  const { teams, holes } = input;
  const totalHoles = holes.length;

  const sideA = teams.find((t) => t.side === 'A');
  const sideB = teams.find((t) => t.side === 'B');
  if (!sideA || !sideB) {
    throw new Error('Team match needs one team per side (A and B).');
  }

  // Strokes go to the higher-handicap team. Diff is rounded so the math
  // matches the player-input path (computeStrokes uses Math.round too).
  const diff = Math.round(Math.abs(sideA.handicap - sideB.handicap));
  const higherSide = sideA.handicap > sideB.handicap ? 'A' : 'B';

  function strokesForSide(side: 'A' | 'B', holeIdx: number): number {
    if (side !== higherSide) return 0;
    const base = Math.floor(diff / 18);
    const extra = diff % 18 >= holeIdx ? 1 : 0;
    return base + extra;
  }

  // Index team scores: teamId -> holeNumber -> gross
  const scoreByTeamHole = new Map<string, Map<number, number>>();
  for (const s of input.scores) {
    const inner = scoreByTeamHole.get(s.teamId) ?? new Map<number, number>();
    inner.set(s.holeNumber, s.gross);
    scoreByTeamHole.set(s.teamId, inner);
  }

  function teamNetOnHole(team: EngineTeam, hole: EngineHole): number | null {
    const gross = scoreByTeamHole.get(team.id)?.get(hole.number);
    if (gross == null) return null;
    return gross - strokesForSide(team.side, hole.handicapIndex);
  }

  /** Team-mode shim so the same `holeStrokes(side, holeNumber)` call site
   * works for both engines. Just reads team-side allocation. */
  function holeStrokes(team: EngineTeam, holeNumber: number): number {
    const hole = holes.find((h) => h.number === holeNumber);
    if (!hole) return 0;
    return strokesForSide(team.side, hole.handicapIndex);
  }

  // Reuse the strokesByPlayer shape so consumers don't care which engine
  // produced the result. For team matches we expose strokes-per-team keyed
  // by the team id (callers can label these as "team strokes" in the UI).
  const strokesByPlayer = new Map<string, Map<number, number>>();
  for (const team of teams) {
    const per = new Map<number, number>();
    for (const hole of holes) {
      per.set(hole.number, strokesForSide(team.side, hole.handicapIndex));
    }
    strokesByPlayer.set(team.id, per);
  }

  const sortedHoles = [...holes].sort((a, b) => a.number - b.number);

  let upA = 0;
  let upB = 0;
  let holesPlayed = 0;
  let closed: { winner: 'A' | 'B'; up: number; remaining: number } | null = null;
  const holeResults: HoleResult[] = [];

  for (const hole of sortedHoles) {
    const aNet = teamNetOnHole(sideA, hole);
    const bNet = teamNetOnHole(sideB, hole);

    let winner: HoleResult['winner'] = null;
    let countedThisHole = false;

    if (!closed && aNet != null && bNet != null) {
      if (aNet < bNet) {
        winner = 'A';
        upA += 1;
      } else if (bNet < aNet) {
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
    }

    holeResults.push({
      holeNumber: hole.number,
      par: hole.par,
      aBestNet: aNet,
      bBestNet: bNet,
      aStrokes: holeStrokes(sideA, hole.number),
      bStrokes: holeStrokes(sideB, hole.number),
      aBestPlayerId: null, // team-input formats don't have a single contributor
      bBestPlayerId: null,
      winner: countedThisHole ? winner : null,
      statusAfter: { upA, upB },
    });
  }

  const status = buildStatus({ closed, upA, upB, holesPlayed, totalHoles });

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

// ───────────────────────── STABLEFORD ─────────────────────────
//
// Stableford = sum of per-hole points based on net score vs par:
//   net ≤ par-2  → eagle points       (default 4)
//   net = par-1  → birdie points      (default 3)
//   net = par    → par points         (default 2)
//   net = par+1  → bogey points       (default 1)
//   net ≥ par+2  → double+ points     (default 0)
//
// Modified Stableford (PGA Reno-Tahoe style) reaches via per-match
// override: 5 / 2 / 0 / -1 / -3. Any custom scale works too — we
// don't ship two distinct algorithms.

export type StablefordPoints = {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  doublePlus: number;
};

export const DEFAULT_STABLEFORD_POINTS: StablefordPoints = {
  eagle: 4,
  birdie: 3,
  par: 2,
  bogey: 1,
  doublePlus: 0,
};

/**
 * Map a net-vs-par differential to stableford points using the supplied
 * point scale. `diff` is `net - par`; -1 = birdie, +2 = double bogey.
 */
export function pointsForNetVsPar(
  diff: number,
  pts: StablefordPoints = DEFAULT_STABLEFORD_POINTS,
): number {
  if (diff <= -2) return pts.eagle;
  if (diff === -1) return pts.birdie;
  if (diff === 0) return pts.par;
  if (diff === 1) return pts.bogey;
  return pts.doublePlus;
}

export type StablefordPlayerTotal = {
  playerId: string;
  side: 'A' | 'B';
  pointsByHole: Map<number, number>;
  total: number;
};

export type StablefordStatus =
  | { kind: 'not_started' }
  | { kind: 'in_progress'; aPoints: number; bPoints: number; holesPlayed: number }
  | { kind: 'final'; winner: 'A' | 'B' | 'halved'; aPoints: number; bPoints: number };

export type ComputedStableford = {
  status: StablefordStatus;
  holesPlayed: number;
  totalHoles: number;
  aPoints: number;
  bPoints: number;
  players: StablefordPlayerTotal[];
  strokesByPlayer: Map<string, Map<number, number>>;
};

export function computeStableford(input: {
  players: EnginePlayer[];
  holes: EngineHole[];
  scores: EngineScore[];
  points?: StablefordPoints;
  /** Scratch baseline override — same semantics as computeMatch's.
   * Omitted = lowest handicap in the match (historic behavior). */
  scratchHandicap?: number;
}): ComputedStableford {
  const pts = input.points ?? DEFAULT_STABLEFORD_POINTS;
  const strokesByPlayer = computeStrokes(input.players, input.holes, input.scratchHandicap);

  const grossByPH = new Map<string, number>();
  for (const s of input.scores) {
    grossByPH.set(`${s.playerId}:${s.holeNumber}`, s.gross);
  }

  const players: StablefordPlayerTotal[] = input.players.map((p) => {
    const pointsByHole = new Map<number, number>();
    let total = 0;
    for (const h of input.holes) {
      const gross = grossByPH.get(`${p.id}:${h.number}`);
      if (gross == null) continue;
      const strokes = strokesByPlayer.get(p.id)?.get(h.number) ?? 0;
      const net = gross - strokes;
      const diff = net - h.par;
      const got = pointsForNetVsPar(diff, pts);
      pointsByHole.set(h.number, got);
      total += got;
    }
    return { playerId: p.id, side: p.teamSide, pointsByHole, total };
  });

  let aPoints = 0;
  let bPoints = 0;
  for (const p of players) {
    if (p.side === 'A') aPoints += p.total;
    else bPoints += p.total;
  }

  // Holes played = the count of unique holes that any player has
  // scored on. Used by the status branch so we know if the match is
  // finished or in flight.
  const scoredHoles = new Set<number>();
  for (const s of input.scores) scoredHoles.add(s.holeNumber);
  const holesPlayed = scoredHoles.size;
  const totalHoles = input.holes.length;

  let status: StablefordStatus;
  if (holesPlayed === 0) {
    status = { kind: 'not_started' };
  } else if (holesPlayed < totalHoles) {
    status = { kind: 'in_progress', aPoints, bPoints, holesPlayed };
  } else {
    const winner: 'A' | 'B' | 'halved' =
      aPoints > bPoints ? 'A' : bPoints > aPoints ? 'B' : 'halved';
    status = { kind: 'final', winner, aPoints, bPoints };
  }

  return {
    status,
    holesPlayed,
    totalHoles,
    aPoints,
    bPoints,
    players,
    strokesByPlayer,
  };
}
