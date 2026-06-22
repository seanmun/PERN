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
 * Captain-friendly "lazy bums" entry path. The full hole-by-hole
 * scorecard is great when everyone uses the app live, but a foursome
 * that kept paper scorecards just wants the captain to type four
 * totals and click a winner.
 *
 * What this writes:
 *   - For each player: 18 hole_scores rows distributed so they sum
 *     exactly to the entered gross total (floor + remainder bumps).
 *     Marked entered_by_label = 'QUICK' so the UI can flag them.
 *   - matches.status = 'completed'
 *   - matches.winning_team_id / is_halved / result_text per the
 *     captain's verdict — NOT recomputed from the synthetic per-hole
 *     rows. The leaderboard sums grosses to get totals; the engine's
 *     per-hole match status is fiction here, and we discard it.
 *
 * Refuses if the match already has any real hole-by-hole entries to
 * avoid stomping on data someone tapped in during the round.
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

  const winnerRaw = String(formData.get('winner') ?? '').trim();
  if (winnerRaw !== 'A' && winnerRaw !== 'B' && winnerRaw !== 'halved') {
    throw new Error('Pick a winner (or Halved)');
  }
  const winner: 'A' | 'B' | 'halved' = winnerRaw;

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

  // Block if real per-hole data exists — captain's quick verdict
  // shouldn't overwrite a foursome that actually entered live. We
  // distinguish previous quick entries from real entries via the
  // result_text tag ("(quick entry)" suffix).
  const existing = await db
    .select({ id: holeScores.id })
    .from(holeScores)
    .where(eq(holeScores.matchId, matchId))
    .limit(1);
  const isPriorQuick =
    !!row.match.resultText && row.match.resultText.endsWith('(quick entry)');
  if (existing.length > 0 && !isPriorQuick) {
    throw new Error(
      'This match already has hole-by-hole scores. Edit those instead.',
    );
  }

  // Parse per-player totals from the form.
  const totals = new Map<string, number>();
  for (const p of participants) {
    const raw = formData.get(`total:${p.tripMemberId}`);
    const n = Number(String(raw ?? '').trim());
    if (!Number.isFinite(n) || n < 18 || n > 200) {
      throw new Error(`Invalid total for player ${p.tripMemberId}`);
    }
    totals.set(p.tripMemberId, Math.floor(n));
  }

  // We need the 18 hole numbers to write rows against. Pull from the
  // round's course; fall back to numbers 1..18 if hole data is sparse.
  const holes = await db
    .select({ holeNumber: courseHoles.holeNumber })
    .from(courseHoles)
    .where(eq(courseHoles.courseId, row.round.courseId));
  const holeNumbers = holes.length
    ? holes.map((h) => h.holeNumber).sort((a, b) => a - b)
    : Array.from({ length: 18 }, (_, i) => i + 1);
  const N = holeNumbers.length;

  // Distribute each total across the 18 holes: floor on every hole,
  // then +1 to the first `remainder` holes so the sum is exact.
  await db.delete(holeScores).where(eq(holeScores.matchId, matchId));
  const enteredBy = ctx.user?.id ?? null;
  const rows: {
    matchId: string;
    tripMemberId: string;
    holeNumber: number;
    gross: number;
    enteredBy: string | null;
  }[] = [];
  for (const [tripMemberId, total] of totals) {
    const base = Math.floor(total / N);
    const remainder = total - base * N;
    holeNumbers.forEach((holeNumber, i) => {
      rows.push({
        matchId,
        tripMemberId,
        holeNumber,
        gross: base + (i < remainder ? 1 : 0),
        enteredBy,
      });
    });
  }
  if (rows.length) await db.insert(holeScores).values(rows);

  // Map A/B winner side back to team id.
  const sideTeam = new Map<'A' | 'B', string>();
  // Side A/B is determined by team-UUID sort (engine convention).
  const distinctTeams = Array.from(
    new Set(participants.map((p) => p.teamId)),
  ).sort();
  if (distinctTeams[0]) sideTeam.set('A', distinctTeams[0]);
  if (distinctTeams[1]) sideTeam.set('B', distinctTeams[1]);

  let winningTeamId: string | null = null;
  let isHalved = false;
  let resultText: string;
  if (winner === 'halved') {
    isHalved = true;
    resultText = 'Halved (quick entry)';
  } else {
    winningTeamId = sideTeam.get(winner) ?? null;
    resultText = 'Won (quick entry)';
  }

  await db
    .update(matches)
    .set({
      status: 'completed',
      winningTeamId,
      isHalved,
      resultText,
      front9WinningTeamId: winningTeamId,
      back9WinningTeamId: winningTeamId,
    })
    .where(eq(matches.id, matchId));

  const tripSlug = await getTripSlugById(row.round.tripId);
  // Quick entry mints fake hole data + a manual verdict; clear every
  // cached page under the trip so cup/leaderboard/match-detail all pick
  // it up on next view.
  revalidatePath(`/trips/${tripSlug}`, 'layout');
  redirect(`/trips/${tripSlug}/matches/${matchId}`);
}
