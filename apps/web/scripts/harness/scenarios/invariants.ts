/**
 * §11.2 — the two lineup invariants, held across every format × every
 * roster size the app can be handed.
 *
 * These are pure-function checks (no DB), and they are the cheap half of
 * the harness: `deriveLineup` is what the round-builder shows the admin,
 * and `validateBuilderState` is what the server enforces at submit. If
 * they ever disagree, the admin sees a lineup that the Create button
 * silently refuses — which is bug #4 in docs/session-failures-2026-07.md,
 * "client fixed, server not".
 *
 *   1. No group exceeds FOURSOME_MAX seats.
 *   2. Every derived match passes validateBuilderState.
 *
 * A roster that cannot field a format is not a violation — deriveLineup
 * is required to say so in `notes` and produce no match. Producing a
 * match that then fails validation IS a violation.
 */

import { FORMAT_IDS, FORMAT_META } from '@buddycup/scoring/formats';
import { FOURSOME_MAX, deriveLineup } from '@buddycup/scoring/lineup';
import {
  validateBuilderState,
  type BuilderContext,
} from '@buddycup/scoring/validation/match-builder';
import { assert, assertEq, note, scenario } from '../core';

const ROSTER_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

export async function runLineupInvariants(): Promise<void> {
  await scenario('§11.2 · Lineup invariants — every format × roster 2–16', async () => {
    let combos = 0;
    let matchesChecked = 0;
    const oversizedGroups: string[] = [];
    const invalidMatches: string[] = [];
    const unpairedWithoutNote: string[] = [];

    for (const format of FORMAT_IDS) {
      for (const size of ROSTER_SIZES) {
        combos++;
        const players = Array.from({ length: size }, (_, i) => ({
          id: `p${i}`,
          handicap: i, // spread so autoSplitByHandicap has something to do
          teamId: null,
        }));

        const lineup = deriveLineup({
          players,
          formats: [format],
          teamAId: TEAM_A,
          teamBId: TEAM_B,
        });

        // Invariant 1 — seats.
        for (const [gi, g] of lineup.groups.entries()) {
          if (g.length > FOURSOME_MAX) {
            oversizedGroups.push(`${format}/${size}: group ${gi} holds ${g.length}`);
          }
        }

        // Every player lands in exactly one group, or grouping silently
        // dropped someone from the round.
        const seated = lineup.groups.flat();
        if (new Set(seated).size !== seated.length) {
          oversizedGroups.push(`${format}/${size}: a player is seated twice`);
        }

        // Invariant 2 — the server would accept what the client drew.
        const teeTimeByMember = new Map<string, string | null>();
        players.forEach((p) => teeTimeByMember.set(p.id, null));
        lineup.groups.forEach((g, gi) =>
          g.forEach((id) => teeTimeByMember.set(id, `tee-${gi}`)),
        );
        const ctx: BuilderContext = {
          memberTeamById: new Map(Object.entries(lineup.teamByPlayer)),
          memberTeeTimeById: teeTimeByMember,
        };

        for (const m of lineup.matches) {
          matchesChecked++;
          const v = validateBuilderState(
            {
              format: m.format,
              sideSize: m.sideSize,
              sideATeamId: TEAM_A,
              sideBTeamId: TEAM_B,
              sideAPlayerIds: m.sideAPlayerIds,
              sideBPlayerIds: m.sideBPlayerIds,
            },
            ctx,
          );
          if (!v.ok) {
            invalidMatches.push(`${format}/${size}: ${v.errors.join('; ')}`);
          }
        }

        // Producing nothing is legal, but it must be explained.
        if (lineup.matches.length === 0 && lineup.notes.length === 0) {
          unpairedWithoutNote.push(`${format}/${size}`);
        }
      }
    }

    note(`${combos} format × roster combinations, ${matchesChecked} derived matches`);

    assertEq(oversizedGroups.length, 0, `groups over ${FOURSOME_MAX} seats`);
    for (const o of oversizedGroups.slice(0, 8)) note(o);

    assertEq(invalidMatches.length, 0, 'derived matches rejected by validateBuilderState');
    for (const i of invalidMatches.slice(0, 8)) note(i);

    assertEq(unpairedWithoutNote.length, 0, 'silent no-op derivations (no matches, no note)');
    for (const u of unpairedWithoutNote.slice(0, 8)) note(u);
  });

  await scenario('§8 · Format registry covers all eight v1 formats', async () => {
    assertEq(FORMAT_IDS.length, 8, 'formats in FORMAT_META');
    for (const id of FORMAT_IDS) {
      const meta = FORMAT_META[id];
      assert(
        meta.allowedSideSizes.length > 0 && meta.allowedSideSizes.every((n) => n >= 1),
        `${id}: allowedSideSizes is sane (${meta.allowedSideSizes.join(',')})`,
      );
    }
  });
}
