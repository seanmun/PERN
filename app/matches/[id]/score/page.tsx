import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getAuthContext } from '@/lib/auth/current-user';
import {
  canEnterScoreFor,
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
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/sign-in');

  const { id } = await params;
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
    redirect(`/matches/${id}`);
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
        href={`/matches/${id}`}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-yellow-400"
      >
        <ArrowLeft size={12} /> Match
      </Link>

      <h1 className="mt-4 text-xl font-bold tracking-tight">
        {data.course.name}
      </h1>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Round {data.round.order} · {data.round.label ?? data.round.format}
      </p>

      <ScoreEntryClient
        matchId={id}
        holes={holes}
        players={players}
        initialScores={initialScores}
        canEdit={isAdmin || selfIsParticipant}
        selfTripMemberId={selfTripMemberId}
      />
    </div>
  );
}
