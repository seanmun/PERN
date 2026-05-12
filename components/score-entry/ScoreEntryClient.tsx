'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Square,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { upsertHoleScore } from '@/lib/actions/scores';

export type ScoreClientHole = {
  number: number;
  par: number;
  yardage: number | null;
  handicapIndex: number;
};

export type ScoreClientPlayer = {
  tripMemberId: string;
  nickname: string;
  avatarUrl: string | null;
  teamId: string;
  teamColor: string | null;
  isSelf: boolean;
  strokesByHole: Record<number, number>;
};

export type ScoreClientScore = {
  tripMemberId: string;
  holeNumber: number;
  gross: number | null;
};

const VIEW_KEY = 'cup_score_view';

export default function ScoreEntryClient({
  matchId,
  holes,
  players,
  initialScores,
  canEdit,
  selfTripMemberId,
}: {
  matchId: string;
  holes: ScoreClientHole[];
  players: ScoreClientPlayer[];
  initialScores: ScoreClientScore[];
  canEdit: boolean;
  selfTripMemberId: string | null;
}) {
  const [view, setView] = useState<'hole' | 'card'>('hole');
  const [restored, setRestored] = useState(false);
  const [activeHole, setActiveHole] = useState(1);
  const [activePlayerId, setActivePlayerId] = useState<string>(
    selfTripMemberId ?? players[0]?.tripMemberId ?? ''
  );
  const [scores, setScores] = useState<Map<string, number | null>>(() => {
    const m = new Map<string, number | null>();
    for (const s of initialScores) {
      m.set(`${s.tripMemberId}:${s.holeNumber}`, s.gross);
    }
    return m;
  });

  useEffect(() => {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'hole' || v === 'card') setView(v);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) localStorage.setItem(VIEW_KEY, view);
  }, [view, restored]);

  const activeHoleData = holes.find((h) => h.number === activeHole) ?? holes[0];
  const activePlayer =
    players.find((p) => p.tripMemberId === activePlayerId) ?? players[0];

  const getScore = (tripMemberId: string, holeNumber: number) =>
    scores.get(`${tripMemberId}:${holeNumber}`) ?? null;

  const setScore = (
    tripMemberId: string,
    holeNumber: number,
    gross: number | null
  ) => {
    setScores((prev) => {
      const next = new Map(prev);
      next.set(`${tripMemberId}:${holeNumber}`, gross);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
          Score entry
        </p>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {players.length > 1 && canEdit && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {players.map((p) => {
            const isActive = p.tripMemberId === activePlayerId;
            return (
              <button
                key={p.tripMemberId}
                type="button"
                onClick={() => setActivePlayerId(p.tripMemberId)}
                disabled={!p.isSelf && !canEdit}
                className={`shrink-0 rounded-sm border px-3 py-1.5 ${
                  isActive
                    ? 'border-yellow-500/60 bg-yellow-500/10'
                    : 'border-zinc-800 bg-black hover:border-zinc-700'
                }`}
              >
                <span
                  className={`font-mono text-[10px] font-semibold uppercase tracking-widest ${
                    isActive ? 'text-yellow-400' : 'text-zinc-400'
                  }`}
                >
                  {p.nickname}
                  {p.isSelf && ' (you)'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {view === 'hole' ? (
        <HoleByHole
          matchId={matchId}
          hole={activeHoleData}
          holes={holes}
          player={activePlayer}
          score={getScore(activePlayerId, activeHole)}
          onScoreChange={(g) => setScore(activePlayerId, activeHole, g)}
          onPrev={() => setActiveHole((h) => Math.max(1, h - 1))}
          onNext={() => setActiveHole((h) => Math.min(holes.length, h + 1))}
          canPrev={activeHole > 1}
          canNext={activeHole < holes.length}
        />
      ) : (
        <CardView
          matchId={matchId}
          holes={holes}
          player={activePlayer}
          getScore={(h) => getScore(activePlayerId, h)}
          onScoreChange={(h, g) => setScore(activePlayerId, h, g)}
        />
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'hole' | 'card';
  onChange: (v: 'hole' | 'card') => void;
}) {
  return (
    <div className="flex rounded-sm border border-zinc-800 bg-black p-0.5">
      <button
        type="button"
        onClick={() => onChange('hole')}
        className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
          view === 'hole' ? 'bg-yellow-500 text-black' : 'text-zinc-500'
        }`}
        aria-pressed={view === 'hole'}
      >
        <Square size={12} strokeWidth={2.5} /> Hole
      </button>
      <button
        type="button"
        onClick={() => onChange('card')}
        className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
          view === 'card' ? 'bg-yellow-500 text-black' : 'text-zinc-500'
        }`}
        aria-pressed={view === 'card'}
      >
        <LayoutGrid size={12} strokeWidth={2.5} /> Card
      </button>
    </div>
  );
}

function HoleByHole({
  matchId,
  hole,
  holes,
  player,
  score,
  onScoreChange,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  matchId: string;
  hole: ScoreClientHole;
  holes: ScoreClientHole[];
  player: ScoreClientPlayer;
  score: number | null;
  onScoreChange: (g: number | null) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const strokes = player.strokesByHole[hole.number] ?? 0;
  const net = score != null ? score - strokes : null;

  function setRel(delta: number) {
    const next = (score ?? hole.par) + delta;
    if (next < 1 || next > 20) return;
    onScoreChange(next);
  }

  return (
    <div className="mt-6">
      <div
        className="rounded-sm border border-zinc-800 bg-zinc-950/60 p-6 text-center"
        style={{
          background:
            'linear-gradient(180deg, rgba(20,83,45,0.15) 0%, rgba(20,83,45,0.02) 100%)',
        }}
      >
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.4em] text-zinc-400">
          Hole {hole.number} of {holes.length}
        </p>
        <p className="mt-4 font-mono text-[80px] font-bold leading-none tabular-nums text-yellow-400 drop-shadow-[0_0_30px_rgba(202,138,4,0.4)]">
          {hole.number}
        </p>
        <div className="mt-4 flex items-center justify-center gap-6">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Par
            </p>
            <p className="font-mono text-lg font-bold tabular-nums">{hole.par}</p>
          </div>
          {hole.yardage != null && (
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                Yards
              </p>
              <p className="font-mono text-lg font-bold tabular-nums">
                {hole.yardage}
              </p>
            </div>
          )}
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              SI
            </p>
            <p className="font-mono text-lg font-bold tabular-nums">
              {hole.handicapIndex}
            </p>
          </div>
          {strokes > 0 && (
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-emerald-400">
                Strokes
              </p>
              <p className="font-mono text-lg font-bold tabular-nums text-emerald-400">
                +{strokes}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-sm border border-zinc-800 bg-zinc-950/40 p-5">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            {player.nickname}&apos;s score
          </p>
          <SaveStatus
            matchId={matchId}
            tripMemberId={player.tripMemberId}
            holeNumber={hole.number}
            gross={score}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setRel(-1)}
            className="flex h-14 w-14 items-center justify-center rounded-sm border border-zinc-700 text-2xl font-bold hover:bg-zinc-900"
            aria-label="Decrease score"
          >
            −
          </button>
          <div className="flex-1 text-center">
            <p className="font-mono text-[60px] font-bold leading-none tabular-nums text-zinc-100">
              {score ?? '—'}
            </p>
            {net != null && net !== score && (
              <p className="mt-1 font-mono text-xs tabular-nums text-emerald-400">
                net {net}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setRel(1)}
            className="flex h-14 w-14 items-center justify-center rounded-sm border border-zinc-700 text-2xl font-bold hover:bg-zinc-900"
            aria-label="Increase score"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => onScoreChange(null)}
          className="mt-4 w-full rounded-sm border border-zinc-800 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-red-400 hover:border-red-700/40"
        >
          Clear
        </button>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-zinc-700 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-yellow-500 px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400 disabled:opacity-40"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function CardView({
  matchId,
  holes,
  player,
  getScore,
  onScoreChange,
}: {
  matchId: string;
  holes: ScoreClientHole[];
  player: ScoreClientPlayer;
  getScore: (h: number) => number | null;
  onScoreChange: (h: number, g: number | null) => void;
}) {
  const total = holes.reduce((acc, h) => {
    const g = getScore(h.number);
    return g != null ? acc + g : acc;
  }, 0);
  const totalPar = holes.reduce((acc, h) => acc + h.par, 0);
  const totalStrokes = Object.values(player.strokesByHole).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="mt-6 rounded-sm border border-zinc-800 bg-zinc-950/40">
      <div className="grid grid-cols-[28px_28px_28px_28px_1fr_56px] items-center gap-2 border-b border-zinc-800 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
        <span>#</span>
        <span>Par</span>
        <span>Yds</span>
        <span>SI</span>
        <span>+</span>
        <span className="text-right">Gross</span>
      </div>

      {holes.map((h) => {
        const score = getScore(h.number);
        const strokes = player.strokesByHole[h.number] ?? 0;
        return (
          <div
            key={h.number}
            className="grid grid-cols-[28px_28px_28px_28px_1fr_56px] items-center gap-2 border-b border-zinc-900 px-3 py-2 last:border-b-0"
          >
            <span className="font-mono text-sm font-bold tabular-nums text-yellow-400">
              {h.number}
            </span>
            <span className="font-mono text-xs tabular-nums text-zinc-300">
              {h.par}
            </span>
            <span className="font-mono text-xs tabular-nums text-zinc-500">
              {h.yardage ?? '—'}
            </span>
            <span className="font-mono text-xs tabular-nums text-zinc-500">
              {h.handicapIndex}
            </span>
            <span className="font-mono text-xs tabular-nums text-emerald-400">
              {strokes > 0 ? `+${strokes}` : ''}
            </span>
            <CardScoreInput
              matchId={matchId}
              tripMemberId={player.tripMemberId}
              holeNumber={h.number}
              value={score}
              onChange={(g) => onScoreChange(h.number, g)}
            />
          </div>
        );
      })}

      <div className="grid grid-cols-[28px_28px_28px_28px_1fr_56px] items-center gap-2 border-t-2 border-zinc-700 px-3 py-3 font-mono text-xs font-semibold uppercase tracking-widest">
        <span className="text-zinc-500">Σ</span>
        <span className="text-zinc-300">{totalPar}</span>
        <span />
        <span />
        <span className="text-emerald-400">
          {totalStrokes > 0 ? `+${totalStrokes}` : ''}
        </span>
        <span className="text-right font-bold tabular-nums text-yellow-400">
          {total > 0 ? total : '—'}
        </span>
      </div>
    </div>
  );
}

function CardScoreInput({
  matchId,
  tripMemberId,
  holeNumber,
  value,
  onChange,
}: {
  matchId: string;
  tripMemberId: string;
  holeNumber: number;
  value: number | null;
  onChange: (g: number | null) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={20}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value.trim();
        if (!v) {
          onChange(null);
          submitScore({ matchId, tripMemberId, holeNumber, gross: null });
          return;
        }
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        onChange(n);
        submitScore({ matchId, tripMemberId, holeNumber, gross: n });
      }}
      className="w-full rounded-sm border border-zinc-800 bg-black px-2 py-1 text-right font-mono text-sm tabular-nums focus:border-yellow-500 focus:outline-none"
    />
  );
}

function SaveStatus({
  matchId,
  tripMemberId,
  holeNumber,
  gross,
}: {
  matchId: string;
  tripMemberId: string;
  holeNumber: number;
  gross: number | null;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const lastSent = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = String(gross ?? '');
    if (lastSent.current === key) return;
    lastSent.current = key;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState('saving');
      await submitScore({ matchId, tripMemberId, holeNumber, gross });
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    }, 600);
  }, [gross, matchId, tripMemberId, holeNumber]);

  if (state === 'saving')
    return (
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        <Loader2 size={11} className="animate-spin" /> Saving
      </span>
    );
  if (state === 'saved')
    return (
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
        <CheckCircle2 size={11} /> Saved
      </span>
    );
  return null;
}

async function submitScore(args: {
  matchId: string;
  tripMemberId: string;
  holeNumber: number;
  gross: number | null;
}) {
  const fd = new FormData();
  fd.set('matchId', args.matchId);
  fd.set('tripMemberId', args.tripMemberId);
  fd.set('holeNumber', String(args.holeNumber));
  if (args.gross != null) fd.set('gross', String(args.gross));
  try {
    await upsertHoleScore(fd);
  } catch (err) {
    console.error('Failed to save score', err);
  }
}
