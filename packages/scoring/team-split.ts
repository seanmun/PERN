/**
 * Auto-split a roster into two balanced teams by handicap. Pure
 * function — no DB, no React. Used by the event-creation wizard's Teams
 * step "Auto-split by handicap" button.
 *
 * Snake-draft in groups of 4: sort ascending by handicap, then for each
 * group of 4 consecutive players give the 1st and 4th (best and worst
 * of the group) to side A and the 2nd and 3rd to side B. This keeps
 * both sides' AVERAGE handicap close without just alternating (which
 * would put all the low-handicap players on one side if the roster
 * happens to be sorted in blocks).
 */

export type SplitPlayer = {
  id: string;
  handicap: number;
};

export function autoSplitByHandicap(
  players: readonly SplitPlayer[],
): { sideA: string[]; sideB: string[] } {
  const sorted = [...players].sort((a, b) => a.handicap - b.handicap);
  const sideA: string[] = [];
  const sideB: string[] = [];
  sorted.forEach((p, i) => {
    const posInGroup = i % 4;
    if (posInGroup === 0 || posInGroup === 3) sideA.push(p.id);
    else sideB.push(p.id);
  });
  return { sideA, sideB };
}
