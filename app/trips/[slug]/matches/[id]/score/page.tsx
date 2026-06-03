import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTripAuthContext, getTripBySlug } from '@/lib/auth/trip-context';
import {
  isPlatformAdmin,
  isTripAdminOf,
} from '@/lib/auth/permissions';
import { getMatchScoringData } from '@/lib/data/match-scoring';
import { computeStrokes } from '@/lib/scoring/engine';
import ScoreEntryClient, {
  type ScoreClientPlayer,
  type ScoreClientHole,
  type ScoreClientScore,
} from '@/components/score-entry/ScoreEntryClient';

export default async function ScoreEntryPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trip = await getTripBySlug(slug);
  if (!trip) notFound();

  const ctx = await getTripAuthContext(trip.id);
  if (!ctx) redirect('/sign-in');

  const data = await getMatchScoringData(id);
  if (!data) notFound();

  // Authorization: must be a participant OR admin
  const selfTripMemberId = ctx.tripMember?.id ?? null;
  const isAdmin =
    isPlatformAdmin(ctx) || isTripAdminOf(ctx, data.round.tripId);
  const selfIsParticipant = data.participants.some(
    (p) => p.participant.id === selfTripMemberId
  );
  if (!isAdmin && !selfIsParticipant) {
    redirect(`/trips/${slug}/matches/${id}`);
  }

  const strokesMap = computeStrokes(data.enginePlayers, data.engineHoles);

  const holes: ScoreClientHole[] = data.engineHoles.map((h) => ({
    number: h.number,
    par: h.par,
    yardage:
      data.courseHoles.find((c) => c.holeNumber === h.number)?.yardage ?? null,
    handicapIndex: h.handicapIndex,
  }));

  const players: ScoreClientPlayer[] = data.participants.map((p) => {
    const strokesByHole: Record<number, number> = {};
    const playerStrokes = strokesMap.get(p.participant.id);
    if (playerStrokes) {
      for (const [holeNum, n] of playerStrokes) strokesByHole[holeNum] = n;
    }
    return {
      tripMemberId: p.participant.id,
      nickname: p.participant.nickname,
      avatarUrl: p.participant.avatarUrl,
      teamId: p.team.id,
      teamColor: p.team.color,
      isSelf: p.participant.id === selfTripMemberId,
      strokesByHole,
    };
  });

  const initialScores: ScoreClientScore[] = data.scores.map((s) => ({
    tripMemberId: s.tripMemberId,
    holeNumber: s.holeNumber,
    gross: s.gross,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <Link
        href={`/trips/${slug}/matches/${id}`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Match
      </Link>

      <h1 className="mt-4 text-xl font-bold tracking-tight">
        {data.course.name}
      </h1>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Round {data.round.order} · {data.round.label ?? data.round.format}
        {data.tee && (
          <>
            <span className="mx-1.5 text-zinc-700">·</span>
            {data.tee.color && (
              <span
                aria-hidden
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: data.tee.color }}
              />
            )}
            {data.tee.name} tees
            {data.tee.totalYardage != null ? ` · ${data.tee.totalYardage} yds` : ''}
          </>
        )}
      </p>

      {holes.length === 0 ? (
        <div className="mt-8 rounded-sm border border-yellow-600/30 bg-yellow-500/5 p-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-400">
            Course needs hole data
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            {data.course.name} doesn&apos;t have par / yardage / stroke-index
            for its 18 holes yet, so scores can&apos;t be entered.
          </p>
          {isAdmin && (
            <Link
              href={`/trips/${slug}/admin/courses`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-300 hover:bg-yellow-500/20"
            >
              Add hole data
            </Link>
          )}
        </div>
      ) : (
        <ScoreEntryClient
          matchId={id}
          holes={holes}
          players={players}
          initialScores={initialScores}
          canEdit={isAdmin || selfIsParticipant}
          selfTripMemberId={selfTripMemberId}
        />
      )}
    </div>
  );
}
