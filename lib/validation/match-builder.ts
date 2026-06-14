/**
 * Match-builder validation. Pure functions, no DB / no React. Used in
 * two places:
 *
 *   1. The drag-and-drop UI calls `validateBuilderState` on every
 *      change so the Save button can stay disabled (with inline
 *      reasons) while the lineup is invalid.
 *   2. The createMatch server action calls the same function before
 *      writing so the client can't bypass validation by hand-crafting
 *      a request.
 *
 * Same rules, same answer, both sides. Lock the table down with the
 * tests in tests/match-builder.test.ts.
 *
 * See docs/match-template-spec.md.
 */

import {
  FORMAT_META,
  isSideSizeAllowed,
  type FormatId,
} from '@/lib/scoring/formats';

export type BuilderState = {
  format: FormatId;
  sideSize: number;
  // The team assigned to each side. A and B can be any two distinct
  // teams from the trip; the builder UI defaults to the trip's two
  // teams but admin can swap.
  sideATeamId: string;
  sideBTeamId: string;
  // Player slots per side. Length must equal `sideSize`. Null = empty
  // slot (drag target). Order within the array is purely cosmetic —
  // the engine doesn't care which slot a player sits in, only which
  // SIDE they're on.
  sideAPlayerIds: (string | null)[];
  sideBPlayerIds: (string | null)[];
};

export type BuilderContext = {
  // tripMemberId -> teamId so we can verify each slot's player belongs
  // to that side's team.
  memberTeamById: Map<string, string>;
  // tripMemberId -> teeTimeId for THIS round. One tee time per player
  // per round (enforced at the tee-time-assignment surface). Players
  // not in any tee time map to null.
  memberTeeTimeById: Map<string, string | null>;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateBuilderState(
  state: BuilderState,
  ctx: BuilderContext,
): ValidationResult {
  const errors: string[] = [];

  const meta = FORMAT_META[state.format];
  if (!meta) {
    errors.push(`Unknown format "${state.format}".`);
    return { ok: false, errors };
  }

  const twoSided = meta.sides === 2;

  if (!isSideSizeAllowed(state.format, state.sideSize)) {
    errors.push(
      `${meta.label} doesn't support ${state.sideSize}-player sides. ` +
        `Allowed: ${meta.allowedSideSizes.join(', ')}.`,
    );
  }

  if (state.sideAPlayerIds.length !== state.sideSize) {
    errors.push('Side A slot count must match the chosen side size.');
  }
  if (twoSided && state.sideBPlayerIds.length !== state.sideSize) {
    errors.push('Side B slot count must match the chosen side size.');
  }

  if (twoSided && state.sideATeamId === state.sideBTeamId) {
    errors.push('Side A and Side B must be different teams.');
  }

  // All slots filled.
  const aFilled = state.sideAPlayerIds.filter((id): id is string => !!id);
  const bFilled = twoSided
    ? state.sideBPlayerIds.filter((id): id is string => !!id)
    : [];
  if (aFilled.length !== state.sideSize) {
    errors.push(`Side A has ${state.sideSize - aFilled.length} empty slot(s).`);
  }
  if (twoSided && bFilled.length !== state.sideSize) {
    errors.push(`Side B has ${state.sideSize - bFilled.length} empty slot(s).`);
  }

  // No duplicates within a side.
  if (new Set(aFilled).size !== aFilled.length) {
    errors.push('Side A has a player in multiple slots.');
  }
  if (twoSided && new Set(bFilled).size !== bFilled.length) {
    errors.push('Side B has a player in multiple slots.');
  }

  // No player on both sides (2-sided only).
  if (twoSided) {
    const overlap = aFilled.filter((id) => bFilled.includes(id));
    if (overlap.length) {
      errors.push(`A player can't be on both sides (${overlap.length} overlap).`);
    }
  }

  // Each player on Side A belongs to Side A's team; same for B (if 2-sided).
  for (const id of aFilled) {
    const team = ctx.memberTeamById.get(id);
    if (!team) {
      errors.push(`Side A player ${id} isn't a trip member.`);
    } else if (team !== state.sideATeamId) {
      errors.push(`Side A has a player from the wrong team.`);
      break;
    }
  }
  if (twoSided) {
    for (const id of bFilled) {
      const team = ctx.memberTeamById.get(id);
      if (!team) {
        errors.push(`Side B player ${id} isn't a trip member.`);
      } else if (team !== state.sideBTeamId) {
        errors.push(`Side B has a player from the wrong team.`);
        break;
      }
    }
  }

  // Same-foursome-per-side: for scramble / alt shot / 2-man aggregate
  // every player on a given side must share one tee time. The two
  // sides (if there are two) don't need to share one.
  if (meta.requiresSameFoursomePerSide) {
    const aTees = new Set(
      aFilled
        .map((id) => ctx.memberTeeTimeById.get(id))
        .filter((t): t is string => !!t),
    );
    if (aTees.size > 1) {
      errors.push(
        `${meta.label} requires all of Side A to share one foursome.`,
      );
    }
    if (aFilled.length && aTees.size === 0) {
      errors.push(`Side A players aren't assigned to any foursome yet.`);
    }
    if (twoSided) {
      const bTees = new Set(
        bFilled
          .map((id) => ctx.memberTeeTimeById.get(id))
          .filter((t): t is string => !!t),
      );
      if (bTees.size > 1) {
        errors.push(
          `${meta.label} requires all of Side B to share one foursome.`,
        );
      }
      if (bFilled.length && bTees.size === 0) {
        errors.push(`Side B players aren't assigned to any foursome yet.`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Determine the match's primary tee_time_id. If every filled slot shares
 * one tee time, return that — it's a single-foursome match. Otherwise
 * return null (cross-foursome rollup; scoring still works via fan-out).
 *
 * Callers should pass a state that has passed validation; an invalid
 * state may produce a misleading answer.
 */
export function getMatchTeeTimeId(
  state: BuilderState,
  ctx: BuilderContext,
): string | null {
  const ids = [...state.sideAPlayerIds, ...state.sideBPlayerIds].filter(
    (id): id is string => !!id,
  );
  if (!ids.length) return null;
  const tees = new Set(
    ids
      .map((id) => ctx.memberTeeTimeById.get(id))
      .filter((t): t is string => !!t),
  );
  if (tees.size === 1) return [...tees][0];
  return null;
}

/**
 * Builder slot proposal — can a given player land in a given side
 * without violating the format's constraints? Used by the drag UI to
 * grey out invalid drop targets while a chip is in flight.
 *
 * Does NOT check team membership for the slot (the UI surfaces that
 * separately via slot label / color). DOES check the same-foursome
 * rule because that's the non-obvious constraint.
 */
export function canDropOnSide(
  state: BuilderState,
  ctx: BuilderContext,
  side: 'A' | 'B',
  tripMemberId: string,
): boolean {
  const meta = FORMAT_META[state.format];
  if (!meta.requiresSameFoursomePerSide) return true;

  const targetTee = ctx.memberTeeTimeById.get(tripMemberId);
  if (!targetTee) return true; // player has no tee time — let the save-time validator yell

  const sidePlayers =
    side === 'A' ? state.sideAPlayerIds : state.sideBPlayerIds;
  const existingTees = sidePlayers
    .filter((id): id is string => !!id && id !== tripMemberId)
    .map((id) => ctx.memberTeeTimeById.get(id))
    .filter((t): t is string => !!t);

  if (!existingTees.length) return true;
  return existingTees.every((t) => t === targetTee);
}
