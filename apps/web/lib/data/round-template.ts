import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { matches } from '@/db/schema';
import { DEFAULT_STABLEFORD_POINTS } from '@buddycup/scoring/engine';
import type { FormatId } from '@buddycup/scoring/formats';

export type RoundMatchTemplate = {
  format: FormatId;
  sideSize: number;
  scoring: 'match_play' | 'stableford' | 'stroke';
  handicapMethod: 'group_low' | 'match_low' | 'course';
  matchPoints: { overall: number; front9: number; back9: number };
  pts: {
    eagle: number;
    birdie: number;
    par: number;
    bogey: number;
    doublePlus: number;
  } | null;
};

/**
 * An existing match in the round, shaped as defaults for building the
 * next one. Server data in place of the localStorage "memory" the
 * builder briefly had — that went stale, fought the round's own format,
 * and leaked one round's settings into another.
 *
 * `matches` has no created_at, so "most recent" isn't knowable; any
 * match in the round serves as the template (stacked matches almost
 * always share settings). Ordered by id purely for determinism.
 */
export async function getRoundMatchTemplate(
  roundId: string,
): Promise<RoundMatchTemplate | null> {
  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.roundId, roundId))
    .orderBy(desc(matches.id))
    .limit(1);
  if (!m) return null;

  const hasPtsOverride =
    m.ptsEagle != null ||
    m.ptsBirdie != null ||
    m.ptsPar != null ||
    m.ptsBogey != null ||
    m.ptsDoublePlus != null;

  return {
    format: m.format as FormatId,
    sideSize: m.templateSizeA,
    scoring: m.scoring,
    handicapMethod: m.handicapMethod,
    matchPoints: {
      overall: m.pointsOverall,
      front9: m.pointsFront9,
      back9: m.pointsBack9,
    },
    pts: hasPtsOverride
      ? {
          eagle: m.ptsEagle ?? DEFAULT_STABLEFORD_POINTS.eagle,
          birdie: m.ptsBirdie ?? DEFAULT_STABLEFORD_POINTS.birdie,
          par: m.ptsPar ?? DEFAULT_STABLEFORD_POINTS.par,
          bogey: m.ptsBogey ?? DEFAULT_STABLEFORD_POINTS.bogey,
          doublePlus: m.ptsDoublePlus ?? DEFAULT_STABLEFORD_POINTS.doublePlus,
        }
      : null,
  };
}
