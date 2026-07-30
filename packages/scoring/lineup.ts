/**
 * Derive teams, foursomes and matches from a roster plus the games the
 * admin picked. Pure function — no DB, no React.
 *
 * This is the "obvious" inference the setup form is built on: once you
 * know the roster and the game, who plays whom and who rides in which
 * cart is mostly determined. Making an admin re-state it by hand is the
 * redundancy the single-page setup form exists to delete.
 *
 * The rules all come out of FORMAT_META, which already knows each
 * format's legal side sizes and its foursome constraints:
 *
 *   30 Ball      allowedSideSizes [3], per-side foursome  -> 3 v 3, each
 *                side rides in its own group (6 > 4 seats)
 *   Scramble     allowedSideSizes [2,3,4], per-side       -> 2 v 2 in one
 *                group by default
 *   Best Ball    allowedSideSizes [2,3,4], unconstrained  -> 2 v 2
 *   BBB          requiresSingleFoursome                   -> everyone in
 *                ONE group; it cannot be played split up
 *   Singles      allowedSideSizes [1]                     -> 1 v 1, two
 *                matches share a foursome
 *
 * Nothing here is silent: anything the roster can't support lands in
 * `notes` for the UI to show, rather than quietly producing a lineup the
 * match-builder validator will reject later.
 *
 * See packages/scoring/formats.ts for the flags and
 * validation/match-builder.ts for the rules this must not violate.
 */

import { FORMAT_META, type FormatId } from './formats';
import { autoSplitByHandicap } from './team-split';

/** Seats in a golf group. `updateTeeTimeRoster` enforces the same cap. */
export const FOURSOME_MAX = 4;

export type LineupPlayer = {
  id: string;
  /** Numeric handicap used only to balance the auto team split. */
  handicap: number;
  /** Existing team, when the admin has already assigned one. */
  teamId: string | null;
};

export type DerivedMatch = {
  format: FormatId;
  sideSize: number;
  sideAPlayerIds: string[];
  sideBPlayerIds: string[];
};

export type DerivedLineup = {
  /** playerId -> teamId. Every player in the roster gets exactly one. */
  teamByPlayer: Record<string, string>;
  /** Foursomes in group order. Each holds at most FOURSOME_MAX players. */
  groups: string[][];
  matches: DerivedMatch[];
  /**
   * Which format drove the group shape. Groups have to satisfy every
   * selected game at once, so the tightest constraint wins.
   */
  governingFormat: FormatId | null;
  /** Anything the admin needs to know. Never swallowed. */
  notes: string[];
};

/**
 * Preferred side size for a format given how many players each team can
 * actually field.
 *
 * Preference is "fill one foursome": the largest legal size where both
 * sides still fit in a single group (2 x size <= 4). A foursome is the
 * physical unit of golf, so 8 players on Best Ball should become two
 * 2v2 matches in two groups — not one 4v4 spread across two groups.
 * Formats whose smallest legal side already overflows a group (30 Ball
 * at 3 a side) fall through to their smallest size.
 */
export function preferredSideSize(
  format: FormatId,
  perTeamAvailable: number,
): number {
  const allowed = [...FORMAT_META[format].allowedSideSizes].sort(
    (a, b) => a - b,
  );
  const fieldable = allowed.filter((s) => s <= perTeamAvailable);
  // Nothing fits the roster — report the smallest legal size so the
  // caller can say "you need N per side" instead of guessing.
  const pool = fieldable.length ? fieldable : allowed;
  const fitsOneGroup = pool.filter((s) => s * 2 <= FOURSOME_MAX);
  if (fitsOneGroup.length) return fitsOneGroup[fitsOneGroup.length - 1];
  return pool[0];
}

/**
 * How tightly a format constrains grouping. Groups must satisfy every
 * selected game, so the highest rank governs.
 */
function constraintRank(format: FormatId): number {
  const m = FORMAT_META[format];
  if (m.requiresSingleFoursome) return 2;
  if (m.requiresSameFoursomePerSide) return 1;
  return 0;
}

/** Split `ids` into chunks of at most `size`. */
function chunk(ids: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

export function deriveLineup(input: {
  players: readonly LineupPlayer[];
  /** Games selected for the round, in the order the admin picked them. */
  formats: readonly FormatId[];
  teamAId: string;
  teamBId: string;
  /**
   * Keep team assignments the admin already made. Only honoured when
   * every player is on one of the two teams — a half-assigned roster
   * would produce lopsided sides, so it re-splits instead.
   */
  respectExistingTeams?: boolean;
}): DerivedLineup {
  const { players, formats, teamAId, teamBId } = input;
  const notes: string[] = [];

  if (players.length === 0) {
    return {
      teamByPlayer: {},
      groups: [],
      matches: [],
      governingFormat: null,
      notes: ['Add players to build a lineup.'],
    };
  }

  // ---- Teams ------------------------------------------------------------
  const validTeamIds = new Set([teamAId, teamBId]);
  const fullyAssigned = players.every(
    (p) => p.teamId && validTeamIds.has(p.teamId),
  );

  let teamA: string[];
  let teamB: string[];
  if (input.respectExistingTeams && fullyAssigned) {
    teamA = players.filter((p) => p.teamId === teamAId).map((p) => p.id);
    teamB = players.filter((p) => p.teamId === teamBId).map((p) => p.id);
  } else {
    const split = autoSplitByHandicap(
      players.map((p) => ({ id: p.id, handicap: p.handicap })),
    );
    teamA = split.sideA;
    teamB = split.sideB;
  }

  const teamByPlayer: Record<string, string> = {};
  for (const id of teamA) teamByPlayer[id] = teamAId;
  for (const id of teamB) teamByPlayer[id] = teamBId;

  if (teamA.length !== teamB.length) {
    notes.push(
      `Teams are uneven (${teamA.length} v ${teamB.length}) — ${
        Math.abs(teamA.length - teamB.length) === 1 ? 'one player' : 'some players'
      } will sit out of the matchups until the roster evens up.`,
    );
  }

  if (formats.length === 0) {
    // Teams are still useful on their own, and the groups are simply the
    // roster in seats of four.
    return {
      teamByPlayer,
      groups: chunk([...teamA, ...teamB], FOURSOME_MAX),
      matches: [],
      governingFormat: null,
      notes: [...notes, 'Pick a game to build the matchups.'],
    };
  }

  // ---- Governing format -------------------------------------------------
  // Groups have to work for every selected game simultaneously, so the
  // tightest constraint decides their shape; ties break toward the
  // larger match, which is the harder one to seat.
  const perTeam = Math.min(teamA.length, teamB.length);
  const ranked = [...formats].sort((a, b) => {
    const byConstraint = constraintRank(b) - constraintRank(a);
    if (byConstraint !== 0) return byConstraint;
    return (
      preferredSideSize(b, perTeam) * 2 - preferredSideSize(a, perTeam) * 2
    );
  });
  const governingFormat = ranked[0];
  const govSideSize = preferredSideSize(governingFormat, perTeam);
  const govMatchSize = govSideSize * 2;

  // ---- Groups -----------------------------------------------------------
  const groups: string[][] = [];

  if (FORMAT_META[governingFormat].requiresSingleFoursome) {
    // Bingo Bango Bongo and friends: points are awarded by the group
    // watching the shots, so the whole match must ride together. Seat
    // the match first, then anyone left over in their own groups.
    const seated = [
      ...teamA.slice(0, govSideSize),
      ...teamB.slice(0, govSideSize),
    ];
    groups.push(seated);
    const rest = [...teamA.slice(govSideSize), ...teamB.slice(govSideSize)];
    if (rest.length) {
      notes.push(
        `${FORMAT_META[governingFormat].label} is played by one group of ${govMatchSize}. The other ${rest.length} player${rest.length === 1 ? '' : 's'} are grouped separately and need their own game.`,
      );
      groups.push(...chunk(rest, FOURSOME_MAX));
    }
  } else if (govMatchSize > FOURSOME_MAX) {
    // The match is bigger than a cart-load (30 Ball at 3 a side, a 4-man
    // scramble). requiresSameFoursomePerSide guarantees each SIDE may sit
    // alone, so each side becomes its own group.
    const aChunks = chunk(teamA, govSideSize);
    const bChunks = chunk(teamB, govSideSize);
    const pairs = Math.min(aChunks.length, bChunks.length);
    for (let i = 0; i < pairs; i++) {
      groups.push(aChunks[i]);
      groups.push(bChunks[i]);
    }
    const leftover = [...aChunks.slice(pairs).flat(), ...bChunks.slice(pairs).flat()];
    if (leftover.length) groups.push(...chunk(leftover, FOURSOME_MAX));
  } else {
    // The common case: whole matches fit in one group, so pack as many
    // matches per group as there are seats (two singles share a
    // foursome; one 2v2 fills it).
    const matchesPerGroup = Math.floor(FOURSOME_MAX / govMatchSize);
    const aChunks = chunk(teamA, govSideSize);
    const bChunks = chunk(teamB, govSideSize);
    const pairs = Math.min(aChunks.length, bChunks.length);
    let current: string[] = [];
    let inCurrent = 0;
    for (let i = 0; i < pairs; i++) {
      current.push(...aChunks[i], ...bChunks[i]);
      inCurrent++;
      if (inCurrent === matchesPerGroup) {
        groups.push(current);
        current = [];
        inCurrent = 0;
      }
    }
    if (current.length) groups.push(current);
    const leftover = [
      ...aChunks.slice(pairs).flat(),
      ...bChunks.slice(pairs).flat(),
    ];
    if (leftover.length) {
      // Seat spare players in a group with room before opening a new one,
      // so an odd roster doesn't produce a lonely single-player group.
      for (const id of leftover) {
        const withRoom = groups.find((g) => g.length < FOURSOME_MAX);
        if (withRoom) withRoom.push(id);
        else groups.push([id]);
      }
    }
  }

  // ---- Matches ----------------------------------------------------------
  // Every selected game gets its matchups. The governing format pairs off
  // along the group structure; the others pair off the same way, which is
  // safe because their constraints are looser by construction.
  const matches: DerivedMatch[] = [];
  const groupIndexOf = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((id) => groupIndexOf.set(id, i)));

  for (const format of formats) {
    const meta = FORMAT_META[format];
    const sideSize = preferredSideSize(format, perTeam);
    if (sideSize > perTeam) {
      notes.push(
        `${meta.label} needs ${sideSize} per side — you have ${perTeam}. Add ${sideSize - perTeam} more player${sideSize - perTeam === 1 ? '' : 's'} per team, or pick another game.`,
      );
      continue;
    }

    const aChunks = chunk(teamA, sideSize);
    const bChunks = chunk(teamB, sideSize);
    const pairs = Math.min(aChunks.length, bChunks.length);
    let made = 0;
    for (let i = 0; i < pairs; i++) {
      const sideA = aChunks[i];
      const sideB = bChunks[i];
      if (sideA.length < sideSize || sideB.length < sideSize) break;

      // Guard the foursome rules rather than trusting the grouping pass:
      // a second selected game can pair players the groups didn't seat
      // together, and a lineup born invalid disables Create with no
      // explanation.
      if (meta.requiresSameFoursomePerSide) {
        const aGroups = new Set(sideA.map((id) => groupIndexOf.get(id)));
        const bGroups = new Set(sideB.map((id) => groupIndexOf.get(id)));
        if (aGroups.size > 1 || bGroups.size > 1) {
          notes.push(
            `${meta.label} needs each side riding together, which doesn't fit alongside ${FORMAT_META[governingFormat].label}. Add it as a separate round, or regroup by hand.`,
          );
          break;
        }
      }
      if (meta.requiresSingleFoursome) {
        const all = new Set(
          [...sideA, ...sideB].map((id) => groupIndexOf.get(id)),
        );
        if (all.size > 1) {
          notes.push(
            `${meta.label} needs everyone in one group, which doesn't fit alongside ${FORMAT_META[governingFormat].label}. Add it as a separate round.`,
          );
          break;
        }
      }

      matches.push({
        format,
        sideSize,
        sideAPlayerIds: sideA,
        sideBPlayerIds: sideB,
      });
      made++;
    }

    if (made === 0 && !notes.some((n) => n.startsWith(meta.label))) {
      notes.push(`${meta.label} couldn't be paired from this roster.`);
    }
  }

  return { teamByPlayer, groups, matches, governingFormat, notes };
}
