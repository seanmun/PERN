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
import { upsertHoleScore, upsertTeamHoleScore } from '@/lib/actions/scores';

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

// Team-input formats (scramble, alternate shot): one row per team, one
// gross per hole. The team handicap is pre-computed server-side; the UI
// only needs to render it and call the team-score action.
export type ScoreClientTeam = {
  teamId: string;
  name: string;
  color: string | null;
  memberLine: string;        // "Sean & Eric"
  teamHandicap: number;
  isSelfOnTeam: boolean;
  strokesByHole: Record<number, number>;
};

export type ScoreClientTeamScore = {
  teamId: string;
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
  mode = 'player',
  teams = [],
  initialTeamScores = [],
}: {
  matchId: string;
  holes: ScoreClientHole[];
  players: ScoreClientPlayer[];
  initialScores: ScoreClientScore[];
  canEdit: boolean;
  selfTripMemberId: string | null;
  mode?: 'player' | 'team';
  teams?: ScoreClientTeam[];
  initialTeamScores?: ScoreClientTeamScore[];
}) {
  if (mode === 'team') {
    return (
      <TeamScoreEntry
        matchId={matchId}
        holes={holes}
        teams={teams}
        initialTeamScores={initialTeamScores}
        canEdit={canEdit}
      />
    );
  }

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
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-3">
      <div className="flex items-center justify-end">
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* Player picker shown only in card view, where one card = one player. */}
      {view === 'card' && players.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {players.map((p) => {
            const isActive = p.tripMemberId === activePlayerId;
            return (
              <button
                key={p.tripMemberId}
                type="button"
                onClick={() => setActivePlayerId(p.tripMemberId)}
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
          players={players}
          canEdit={canEdit}
          getScore={(tripMemberId) => getScore(tripMemberId, activeHole)}
          onScoreChange={(tripMemberId, g) =>
            setScore(tripMemberId, activeHole, g)
          }
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
  players,
  canEdit,
  getScore,
  onScoreChange,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  matchId: string;
  hole: ScoreClientHole;
  holes: ScoreClientHole[];
  players: ScoreClientPlayer[];
  canEdit: boolean;
  getScore: (tripMemberId: string) => number | null;
  onScoreChange: (tripMemberId: string, g: number | null) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  return (
    <div className="mt-3">
      <div
        className="flex items-center justify-between gap-4 rounded-sm border border-zinc-800 bg-zinc-950/60 px-4 py-2.5"
        style={{
          background:
            'linear-gradient(180deg, rgba(20,83,45,0.15) 0%, rgba(20,83,45,0.02) 100%)',
        }}
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Hole
          </span>
          <span className="font-mono text-3xl font-bold leading-none tabular-nums text-yellow-400">
            {hole.number}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            / {holes.length}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-zinc-400 tabular-nums">
          <span>
            <span className="text-zinc-600">Par </span>
            <span className="text-zinc-200">{hole.par}</span>
          </span>
          {hole.yardage != null && (
            <span>
              <span className="text-zinc-600">Yd </span>
              <span className="text-zinc-200">{hole.yardage}</span>
            </span>
          )}
          <span>
            <span className="text-zinc-600">SI </span>
            <span className="text-zinc-200">{hole.handicapIndex}</span>
          </span>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {players.map((p) => (
          <PlayerHoleRow
            key={p.tripMemberId}
            matchId={matchId}
            hole={hole}
            player={p}
            score={getScore(p.tripMemberId)}
            onScoreChange={(g) => onScoreChange(p.tripMemberId, g)}
            disabled={!canEdit && !p.isSelf}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-zinc-700 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-yellow-500 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400 disabled:opacity-40"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function PlayerHoleRow({
  matchId,
  hole,
  player,
  score,
  onScoreChange,
  disabled,
}: {
  matchId: string;
  hole: ScoreClientHole;
  player: ScoreClientPlayer;
  score: number | null;
  onScoreChange: (g: number | null) => void;
  disabled: boolean;
}) {
  const color = player.teamColor ?? '#3f3f46';
  const strokes = player.strokesByHole[hole.number] ?? 0;
  const net = score != null ? score - strokes : null;

  function setRel(delta: number) {
    if (disabled) return;
    const next = (score ?? hole.par) + delta;
    if (next < 1 || next > 20) return;
    onScoreChange(next);
  }

  return (
    <div
      className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950/40 p-2"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-zinc-100">
          {player.nickname}
          {player.isSelf && (
            <span className="ml-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              you
            </span>
          )}
          {strokes > 0 && (
            <span className="ml-1.5 font-mono text-[10px] font-bold tabular-nums text-emerald-400">
              +{strokes}
            </span>
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {score != null ? (
            <>
              {net != null && net !== score && (
                <span className="font-mono text-[10px] tabular-nums text-emerald-400">
                  net {net}
                </span>
              )}
              <button
                type="button"
                onClick={() => onScoreChange(null)}
                disabled={disabled}
                className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-600 hover:text-red-400 disabled:opacity-40"
                aria-label={`Clear ${player.nickname}'s score`}
              >
                Clear
              </button>
            </>
          ) : (
            <SaveStatusHint score={score} />
          )}
          <SaveStatus
            matchId={matchId}
            tripMemberId={player.tripMemberId}
            holeNumber={hole.number}
            gross={score}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setRel(-1)}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-zinc-700 text-lg font-bold hover:bg-zinc-900 disabled:opacity-40"
        aria-label={`Decrease ${player.nickname}'s score`}
      >
        −
      </button>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          onScoreChange(hole.par);
        }}
        disabled={disabled}
        className={`flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-sm border text-center hover:bg-zinc-900 disabled:opacity-40 ${
          score === hole.par
            ? 'border-yellow-500/60 bg-yellow-500/10'
            : 'border-zinc-700'
        }`}
        aria-label={`Set ${player.nickname}'s score to par (${hole.par})`}
      >
        <span
          className={`font-mono text-3xl font-bold leading-none tabular-nums ${
            score == null ? 'text-zinc-500' : 'text-zinc-100'
          }`}
        >
          {score ?? hole.par}
        </span>
        {score == null && (
          <span className="mt-0.5 font-mono text-[8px] font-semibold uppercase tracking-widest text-zinc-500">
            Par
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setRel(1)}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-zinc-700 text-lg font-bold hover:bg-zinc-900 disabled:opacity-40"
        aria-label={`Increase ${player.nickname}'s score`}
      >
        +
      </button>
    </div>
  );
}

function SaveStatusHint({ score }: { score: number | null }) {
  if (score != null) return null;
  return (
    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
      Tap + to enter
    </span>
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

// ───────────────────────── TEAM-INPUT (Scramble / Alt Shot) ─────────────────────────

/**
 * Team-input score entry. One row per team, one gross per hole. Used by
 * scramble and alternate-shot matches where there's one ball per team.
 *
 * The action layer fans the team gross out to every teammate's holeScores
 * row so per-player consumers (leaderboard etc.) still produce sane numbers.
 */
function TeamScoreEntry({
  matchId,
  holes,
  teams,
  initialTeamScores,
  canEdit,
}: {
  matchId: string;
  holes: ScoreClientHole[];
  teams: ScoreClientTeam[];
  initialTeamScores: ScoreClientTeamScore[];
  canEdit: boolean;
}) {
  const [activeHole, setActiveHole] = useState(1);
  const [scores, setScores] = useState<Map<string, number | null>>(() => {
    const m = new Map<string, number | null>();
    for (const s of initialTeamScores) {
      m.set(`${s.teamId}:${s.holeNumber}`, s.gross);
    }
    return m;
  });

  const activeHoleData = holes.find((h) => h.number === activeHole) ?? holes[0];

  const getScore = (teamId: string, holeNumber: number) =>
    scores.get(`${teamId}:${holeNumber}`) ?? null;

  const setScore = (
    teamId: string,
    holeNumber: number,
    gross: number | null,
  ) => {
    setScores((prev) => {
      const next = new Map(prev);
      next.set(`${teamId}:${holeNumber}`, gross);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-3">
      <div className="mt-2 flex items-center justify-between gap-4 rounded-sm border border-zinc-800 bg-zinc-950/60 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Hole
          </span>
          <span className="font-mono text-3xl font-bold leading-none tabular-nums text-yellow-400">
            {activeHoleData.number}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            / {holes.length}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-zinc-400 tabular-nums">
          <span>
            <span className="text-zinc-600">Par </span>
            <span className="text-zinc-200">{activeHoleData.par}</span>
          </span>
          {activeHoleData.yardage != null && (
            <span>
              <span className="text-zinc-600">Yd </span>
              <span className="text-zinc-200">{activeHoleData.yardage}</span>
            </span>
          )}
          <span>
            <span className="text-zinc-600">SI </span>
            <span className="text-zinc-200">{activeHoleData.handicapIndex}</span>
          </span>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {teams.map((t) => (
          <TeamHoleRow
            key={t.teamId}
            matchId={matchId}
            hole={activeHoleData}
            team={t}
            score={getScore(t.teamId, activeHole)}
            onScoreChange={(g) => setScore(t.teamId, activeHole, g)}
            disabled={!canEdit}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setActiveHole((h) => Math.max(1, h - 1))}
          disabled={activeHole <= 1}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-zinc-700 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <button
          type="button"
          onClick={() => setActiveHole((h) => Math.min(holes.length, h + 1))}
          disabled={activeHole >= holes.length}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-yellow-500 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400 disabled:opacity-40"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function TeamHoleRow({
  matchId,
  hole,
  team,
  score,
  onScoreChange,
  disabled,
}: {
  matchId: string;
  hole: ScoreClientHole;
  team: ScoreClientTeam;
  score: number | null;
  onScoreChange: (g: number | null) => void;
  disabled: boolean;
}) {
  const color = team.color ?? '#3f3f46';
  const strokes = team.strokesByHole[hole.number] ?? 0;
  const net = score != null ? score - strokes : null;

  function setRel(delta: number) {
    if (disabled) return;
    const next = (score ?? hole.par) + delta;
    if (next < 1 || next > 20) return;
    onScoreChange(next);
  }

  return (
    <div
      className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950/40 p-2"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight" style={{ color }}>
          {team.name}
          {team.isSelfOnTeam && (
            <span className="ml-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              you
            </span>
          )}
          {strokes > 0 && (
            <span className="ml-1.5 font-mono text-[10px] font-bold tabular-nums text-emerald-400">
              +{strokes}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-zinc-400">{team.memberLine}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {score != null ? (
            <>
              {net != null && net !== score && (
                <span className="font-mono text-[10px] tabular-nums text-emerald-400">
                  net {net}
                </span>
              )}
              <button
                type="button"
                onClick={() => onScoreChange(null)}
                disabled={disabled}
                className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-600 hover:text-red-400 disabled:opacity-40"
                aria-label={`Clear ${team.name}'s score`}
              >
                Clear
              </button>
            </>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              Tap + to enter
            </span>
          )}
          <TeamSaveStatus
            matchId={matchId}
            teamId={team.teamId}
            holeNumber={hole.number}
            gross={score}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setRel(-1)}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-zinc-700 text-lg font-bold hover:bg-zinc-900 disabled:opacity-40"
        aria-label={`Decrease ${team.name}'s score`}
      >
        −
      </button>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          onScoreChange(hole.par);
        }}
        disabled={disabled}
        className={`flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-sm border text-center hover:bg-zinc-900 disabled:opacity-40 ${
          score === hole.par
            ? 'border-yellow-500/60 bg-yellow-500/10'
            : 'border-zinc-700'
        }`}
        aria-label={`Set ${team.name}'s score to par (${hole.par})`}
      >
        <span
          className={`font-mono text-3xl font-bold leading-none tabular-nums ${
            score == null ? 'text-zinc-500' : 'text-zinc-100'
          }`}
        >
          {score ?? hole.par}
        </span>
        {score == null && (
          <span className="mt-0.5 font-mono text-[8px] font-semibold uppercase tracking-widest text-zinc-500">
            Par
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setRel(1)}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-zinc-700 text-lg font-bold hover:bg-zinc-900 disabled:opacity-40"
        aria-label={`Increase ${team.name}'s score`}
      >
        +
      </button>
    </div>
  );
}

function TeamSaveStatus({
  matchId,
  teamId,
  holeNumber,
  gross,
}: {
  matchId: string;
  teamId: string;
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
      const fd = new FormData();
      fd.set('matchId', matchId);
      fd.set('teamId', teamId);
      fd.set('holeNumber', String(holeNumber));
      if (gross != null) fd.set('gross', String(gross));
      try {
        await upsertTeamHoleScore(fd);
      } catch (err) {
        console.error('Failed to save team score', err);
      }
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    }, 600);
  }, [gross, matchId, teamId, holeNumber]);

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
