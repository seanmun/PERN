'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  matches,
  matchParticipants,
  rounds as roundsTable,
  holeScores,
  courseHoles,
} from '@/db/schema';
import { getGlobalAuthContext } from '@/lib/auth/current-user';
import {
  AuthorizationError,
  isPlatformAdmin,
  isTripAdminOf,
  isAnyCaptainOnTrip,
} from '@/lib/auth/permissions';
import { getTripSlugById } from '@/lib/auth/trip-context';

/**
 * Captain-friendly "paper scorecard" entry. The foursome handed in a
 * paper card; captain enters Front 9 + Back 9 gross per player + Front 9
 * + Back 9 holes won per side, and we materialize hole_scores rows +
 * set the match verdict.
 *
 * Form payload:
 *   matchId
 *   f9gross:<tripMemberId>  — front-9 gross per player
 *   b9gross:<tripMemberId>  — back-9 gross per player
 *   f9won:A / f9won:B       — front-9 holes won per side (sum + halves <= 9)
 *   b9won:A / b9won:B       — back-9 holes won per side
 *
 * What gets written:
 *   - hole_scores: 9 rows per player on F9 holes (1..9) summing exactly to
 *     their F9 gross, 9 rows on B9 (10..18) summing exactly to B9 gross
 *   - matches.status='completed', winningTeamId per OVERALL holes won
 *   - matches.front9WinningTeamId / back9WinningTeamId per segment
 *   - result_text reflects the holes-won line and is tagged "(quick entry)"
 *     so a future quick re-save can overwrite cleanly
 */
export async function quickResultMatch(formData: FormData): Promise<void> {
  const ctx = await getGlobalAuthContext();
  if (!ctx) throw new AuthorizationError('Authentication required');

  const matchId = String(formData.get('matchId') ?? '').trim();
  if (!matchId) throw new Error('matchId required');

  const [row] = await db
    .select({ match: matches, round: roundsTable })
    .from(matches)
    .innerJoin(roundsTable, eq(matches.roundId, roundsTable.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) throw new Error('Match not found');

  const allowed =
    isPlatformAdmin(ctx) ||
    isTripAdminOf(ctx, row.round.tripId) ||
    isAnyCaptainOnTrip(ctx, row.round.tripId);
  if (!allowed) {
    throw new AuthorizationError('Admin or captain required');
  }

  const participants = await db
    .select({
      tripMemberId: matchParticipants.tripMemberId,
      teamId: matchParticipants.teamId,
    })
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));
  if (!participants.length) {
    throw new Error('Match has no participants');
  }

  const isPriorQuick =
    !!row.match.resultText && row.match.resultText.endsWith('(quick entry)');
  const existing = await db
    .select({ id: holeScores.id })
    .from(holeScores)
    .where(eq(holeScores.matchId, matchId))
    .limit(1);
  if (existing.length > 0 && !isPriorQuick) {
    throw new Error(
      'This match already has hole-by-hole scores. Edit those instead.',
    );
  }

  // ── Parse per-player F9 + B9 ─────────────────────────────────────
  const f9by = new Map<string, number>();
  const b9by = new Map<string, number>();
  for (const p of participants) {
    const f = Number(String(formData.get(`f9gross:${p.tripMemberId}`) ?? '').trim());
    const b = Number(String(formData.get(`b9gross:${p.tripMemberId}`) ?? '').trim());
    if (!Number.isFinite(f) || f < 9 || f > 100) {
      throw new Error('Invalid Front 9 gross');
    }
    if (!Number.isFinite(b) || b < 9 || b > 100) {
      throw new Error('Invalid Back 9 gross');
    }
    f9by.set(p.tripMemberId, Math.floor(f));
    b9by.set(p.tripMemberId, Math.floor(b));
  }

  // ── Parse holes won per side per segment ─────────────────────────
  const f9wonA = clampWon(formData.get('f9won:A'));
  const f9wonB = clampWon(formData.get('f9won:B'));
  const b9wonA = clampWon(formData.get('b9won:A'));
  const b9wonB = clampWon(formData.get('b9won:B'));
  if (f9wonA + f9wonB > 9) {
    throw new Error('Front 9 holes won + halves must fit in 9 holes');
  }
  if (b9wonA + b9wonB > 9) {
    throw new Error('Back 9 holes won + halves must fit in 9 holes');
  }

  // ── Determine winners per segment + overall ──────────────────────
  const distinctTeams = Array.from(
    new Set(participants.map((p) => p.teamId)),
  ).sort();
  const teamOfSide = (side: 'A' | 'B') =>
    side === 'A' ? distinctTeams[0] : distinctTeams[1];
  const segmentWinner = (
    aWon: number,
    bWon: number,
  ): 'A' | 'B' | 'halved' =>
    aWon > bWon ? 'A' : bWon > aWon ? 'B' : 'halved';
  const f9Winner = segmentWinner(f9wonA, f9wonB);
  const b9Winner = segmentWinner(b9wonA, b9wonB);
  const totalAWon = f9wonA + b9wonA;
  const totalBWon = f9wonB + b9wonB;
  const overall = segmentWinner(totalAWon, totalBWon);

  const winningTeamId =
    overall === 'halved' ? null : teamOfSide(overall) ?? null;
  const front9WinningTeamId =
    f9Winner === 'halved' ? null : teamOfSide(f9Winner) ?? null;
  const back9WinningTeamId =
    b9Winner === 'halved' ? null : teamOfSide(b9Winner) ?? null;
  const isHalved = overall === 'halved';

  // ── Write hole_scores: F9 rows for holes 1..9, B9 for 10..18 ─────
  const allHoles = await db
    .select({ holeNumber: courseHoles.holeNumber })
    .from(courseHoles)
    .where(eq(courseHoles.courseId, row.round.courseId));
  const fullHoles = allHoles.length
    ? allHoles.map((h) => h.holeNumber).sort((a, b) => a - b)
    : Array.from({ length: 18 }, (_, i) => i + 1);
  const f9Holes = fullHoles.filter((n) => n <= 9);
  const b9Holes = fullHoles.filter((n) => n >= 10);

  await db.delete(holeScores).where(eq(holeScores.matchId, matchId));

  const enteredBy = ctx.user?.id ?? null;
  const rows: {
    matchId: string;
    tripMemberId: string;
    holeNumber: number;
    gross: number;
    enteredBy: string | null;
  }[] = [];
  const distribute = (
    tripMemberId: string,
    total: number,
    holes: number[],
  ) => {
    const N = holes.length;
    if (N === 0) return;
    const base = Math.floor(total / N);
    const rem = total - base * N;
    holes.forEach((holeNumber, i) => {
      rows.push({
        matchId,
        tripMemberId,
        holeNumber,
        gross: base + (i < rem ? 1 : 0),
        enteredBy,
      });
    });
  };
  for (const [id, gross] of f9by) distribute(id, gross, f9Holes);
  for (const [id, gross] of b9by) distribute(id, gross, b9Holes);
  if (rows.length) await db.insert(holeScores).values(rows);

  // ── Result text for display ──────────────────────────────────────
  const wonLine = `${totalAWon}-${totalBWon}`;
  const verdict =
    overall === 'halved' ? 'Halved' : overall === 'A' ? 'A wins' : 'B wins';
  const resultText = `${verdict} ${wonLine} (quick entry)`;

  await db
    .update(matches)
    .set({
      status: 'completed',
      winningTeamId,
      isHalved,
      resultText,
      front9WinningTeamId,
      back9WinningTeamId,
    })
    .where(eq(matches.id, matchId));

  const tripSlug = await getTripSlugById(row.round.tripId);
  revalidatePath(`/trips/${tripSlug}`, 'layout');
  redirect(`/trips/${tripSlug}/matches/${matchId}`);
}

function clampWon(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? '0').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(9, Math.floor(n));
}
