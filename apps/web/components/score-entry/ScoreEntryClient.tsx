'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Lock,
  Square,
  CheckCircle2,
  Loader2,
  Pencil,
} from 'lucide-react';
import {
  commitThirtyBallHole,
  upsertHoleScore,
  upsertTeamHoleScore,
} from '@/lib/actions/scores';
import { THIRTY_BALL_BUDGET } from '@buddycup/scoring/engine';

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
  // Display name (nickname for trip members, displayName for outsiders) of
  // whoever last saved this score. Shown muted under the score buttons so
  // it's obvious who entered what. Null if no one's saved this hole yet.
  enteredByLabel: string | null;
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
  enteredByLabel: string | null;
};

// 30 Ball: one entry per (match, side) with players on this scorecard.
// Drives the per-hole "Commit scores" flow — committed holes lock.
export type ScoreClientThirtyBall = {
  matchId: string;
  teamId: string;
  teamName: string;
  teamColor: string | null;
  memberIds: string[];
  canCommit: boolean;
  budgetUsed: number;
  /** hole number → tripMemberIds whose scores count (committed holes only). */
  committedHoles: Record<number, string[]>;
};

const VIEW_KEY = 'cup_score_view';

export default function ScoreEntryClient({
  matchId,
  matchIdByPlayer,
  holes,
  players,
  initialScores,
  canEdit,
  selfTripMemberId,
  mode = 'player',
  teams = [],
  initialTeamScores = [],
  thirtyBall = [],
}: {
  matchId: string;
  /** Optional per-player override of `matchId`. When the foursome roster
   * spans multiple matches (e.g. some players are only in a round-wide
   * cross-foursome match), score writes for each player are attributed
   * to one of their participating matches. Fan-out propagates the
   * gross to every other match in the round they're in. */
  matchIdByPlayer?: Record<string, string>;
  holes: ScoreClientHole[];
  players: ScoreClientPlayer[];
  initialScores: ScoreClientScore[];
  canEdit: boolean;
  selfTripMemberId: string | null;
  mode?: 'player' | 'team';
  teams?: ScoreClientTeam[];
  initialTeamScores?: ScoreClientTeamScore[];
  thirtyBall?: ScoreClientThirtyBall[];
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

  return (
    <PlayerScoreEntry
      matchId={matchId}
      matchIdByPlayer={matchIdByPlayer}
      holes={holes}
      players={players}
      initialScores={initialScores}
      canEdit={canEdit}
      selfTripMemberId={selfTripMemberId}
      thirtyBall={thirtyBall}
    />
  );
}

function PlayerScoreEntry({
  matchId,
  matchIdByPlayer,
  holes,
  players,
  initialScores,
  canEdit,
  selfTripMemberId,
  thirtyBall = [],
}: {
  matchId: string;
  matchIdByPlayer?: Record<string, string>;
  holes: ScoreClientHole[];
  players: ScoreClientPlayer[];
  initialScores: ScoreClientScore[];
  canEdit: boolean;
  selfTripMemberId: string | null;
  thirtyBall?: ScoreClientThirtyBall[];
}) {
  const [view, setView] = useState<'hole' | 'card'>('hole');
  const [restored, setRestored] = useState(false);
  // Auto-jump to the first hole that's missing a player score on open.
  // If every hole already has a complete set of scores, land on the
  // last hole instead of bouncing back to 1.
  const [activeHole, setActiveHole] = useState(() => {
    const have = new Set<string>();
    for (const s of initialScores) {
      if (s.gross != null) have.add(`${s.tripMemberId}:${s.holeNumber}`);
    }
    for (let h = 1; h <= holes.length; h++) {
      if (!players.every((p) => have.has(`${p.tripMemberId}:${h}`))) return h;
    }
    return Math.max(1, holes.length);
  });
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
  // Static record of who entered each gross — keyed `${tripMemberId}:${hole}`.
  // We only need this for display ("Entered by X") under the score buttons.
  // It doesn't update on save (no server round-trip without a reload), which
  // is fine — the user knows they themselves just saved it.
  const enteredByMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of initialScores) {
      if (s.enteredByLabel) {
        m.set(`${s.tripMemberId}:${s.holeNumber}`, s.enteredByLabel);
      }
    }
    return m;
  }, [initialScores]);
  // Holes the user has explicitly tapped "Edit" on. Past holes start
  // locked; unlocking is per-hole and resets on page reload.
  const [unlockedHoles, setUnlockedHoles] = useState<Set<number>>(
    () => new Set(),
  );

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

  // A hole locks only after the user has navigated AWAY from it via
  // Next/Prev — not the moment all 4 scores land. Otherwise tapping +
  // the second time on the last player to score gets blocked.
  const [leftHoles, setLeftHoles] = useState<Set<number>>(() => new Set());
  const prevActiveHoleRef = useRef(activeHole);
  useEffect(() => {
    if (prevActiveHoleRef.current !== activeHole) {
      setLeftHoles((prev) => {
        const next = new Set(prev);
        next.add(prevActiveHoleRef.current);
        return next;
      });
      prevActiveHoleRef.current = activeHole;
    }
  }, [activeHole]);

  // A hole is "submitted" iff at least one player has a non-null gross.
  // Drive-bys with zero scores stay editable (no lock, no Edit-tap
  // needed). The missing-score alert below also keys off this set.
  const submittedHoles = useMemo(() => {
    const set = new Set<number>();
    for (const [key, v] of scores) {
      if (v == null) continue;
      const holeNum = Number(key.split(':')[1]);
      if (Number.isFinite(holeNum)) set.add(holeNum);
    }
    return set;
  }, [scores]);

  const activeHoleLocked =
    leftHoles.has(activeHole) &&
    submittedHoles.has(activeHole) &&
    !unlockedHoles.has(activeHole);

  // For every PAST hole that's been submitted, list players still
  // missing a gross. Lets the user catch a skipped 17 the moment they
  // land on 18. The HoleByHole renders this list under prev/next with
  // tap-to-jump.
  const missingByHole = useMemo(() => {
    const m: { hole: number; players: ScoreClientPlayer[] }[] = [];
    for (const h of holes) {
      if (h.number >= activeHole) continue;
      if (!submittedHoles.has(h.number)) continue;
      const missing = players.filter(
        (p) => scores.get(`${p.tripMemberId}:${h.number}`) == null,
      );
      if (missing.length > 0) m.push({ hole: h.number, players: missing });
    }
    return m;
  }, [scores, holes, players, activeHole, submittedHoles]);

  function unlockActiveHole() {
    setUnlockedHoles((prev) => {
      const next = new Set(prev);
      next.add(activeHole);
      return next;
    });
  }

  // 30 Ball commit state — local copy so a commit reflects instantly
  // without a server round-trip re-render.
  const [tbStates, setTbStates] = useState<ScoreClientThirtyBall[]>(thirtyBall);
  const tbCommittedMember = (tripMemberId: string, holeNumber: number) =>
    tbStates.some(
      (s) =>
        s.memberIds.includes(tripMemberId) &&
        holeNumber in s.committedHoles,
    );
  function tbApplyCommit(teamId: string, holeNumber: number, countedIds: string[]) {
    setTbStates((prev) =>
      prev.map((s) =>
        s.teamId === teamId
          ? {
              ...s,
              budgetUsed: s.budgetUsed + countedIds.length,
              committedHoles: { ...s.committedHoles, [holeNumber]: countedIds },
            }
          : s,
      ),
    );
  }

  const getScore = (tripMemberId: string, holeNumber: number) =>
    scores.get(`${tripMemberId}:${holeNumber}`) ?? null;
  const getEnteredBy = (tripMemberId: string, holeNumber: number) =>
    enteredByMap.get(`${tripMemberId}:${holeNumber}`) ?? null;

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
                    : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black hover:border-zinc-700'
                }`}
              >
                <span
                  className={`font-mono text-[10px] font-semibold uppercase tracking-widest ${
                    isActive ? 'text-yellow-800 dark:text-yellow-400' : 'text-zinc-600 dark:text-zinc-400'
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
          matchIdByPlayer={matchIdByPlayer}
          hole={activeHoleData}
          holes={holes}
          players={players}
          canEdit={canEdit}
          locked={activeHoleLocked}
          onUnlock={unlockActiveHole}
          getScore={(tripMemberId) => getScore(tripMemberId, activeHole)}
          getEnteredBy={(tripMemberId) => getEnteredBy(tripMemberId, activeHole)}
          onScoreChange={(tripMemberId, g) =>
            setScore(tripMemberId, activeHole, g)
          }
          onPrev={() => setActiveHole((h) => Math.max(1, h - 1))}
          onNext={() => setActiveHole((h) => Math.min(holes.length, h + 1))}
          canPrev={activeHole > 1}
          canNext={activeHole < holes.length}
          missingByHole={missingByHole}
          onJumpHole={(h) => setActiveHole(h)}
          thirtyBall={tbStates}
          isMemberCommitted={tbCommittedMember}
          onThirtyBallCommit={tbApplyCommit}
        />
      ) : (
        <CardView
          matchId={matchId}
          holes={holes}
          player={activePlayer}
          getScore={(h) => getScore(activePlayerId, h)}
          onScoreChange={(h, g) => setScore(activePlayerId, h, g)}
          isHoleCommitted={(h) => tbCommittedMember(activePlayerId, h)}
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
    <div className="flex rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black p-0.5">
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
  matchIdByPlayer,
  hole,
  holes,
  players,
  canEdit,
  locked,
  onUnlock,
  getScore,
  getEnteredBy,
  onScoreChange,
  onPrev,
  onNext,
  canPrev,
  canNext,
  missingByHole,
  onJumpHole,
  thirtyBall = [],
  isMemberCommitted = () => false,
  onThirtyBallCommit = () => {},
}: {
  matchId: string;
  matchIdByPlayer?: Record<string, string>;
  hole: ScoreClientHole;
  holes: ScoreClientHole[];
  players: ScoreClientPlayer[];
  canEdit: boolean;
  // True when the user has navigated back to a past hole. Score buttons
  // render disabled until they tap Edit (onUnlock).
  locked: boolean;
  onUnlock: () => void;
  getScore: (tripMemberId: string) => number | null;
  getEnteredBy: (tripMemberId: string) => string | null;
  onScoreChange: (tripMemberId: string, g: number | null) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  // Past holes that have at least one score but some players missing.
  // Empty array = nothing to flag.
  missingByHole: { hole: number; players: ScoreClientPlayer[] }[];
  onJumpHole: (h: number) => void;
  thirtyBall?: ScoreClientThirtyBall[];
  isMemberCommitted?: (tripMemberId: string, holeNumber: number) => boolean;
  onThirtyBallCommit?: (teamId: string, holeNumber: number, countedIds: string[]) => void;
}) {
  return (
    <div className="mt-3">
      <div
        className="flex items-center justify-between gap-4 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 px-4 py-2.5"
        style={{
          background:
            'linear-gradient(180deg, rgba(20,83,45,0.15) 0%, rgba(20,83,45,0.02) 100%)',
        }}
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Hole
          </span>
          <span className="font-mono text-3xl font-bold leading-none tabular-nums text-yellow-800 dark:text-yellow-400">
            {hole.number}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            / {holes.length}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-zinc-600 dark:text-zinc-400 tabular-nums">
          <span>
            <span className="text-zinc-600">Par </span>
            <span className="text-zinc-800 dark:text-zinc-200">{hole.par}</span>
          </span>
          {hole.yardage != null && (
            <span>
              <span className="text-zinc-600">Yd </span>
              <span className="text-zinc-800 dark:text-zinc-200">{hole.yardage}</span>
            </span>
          )}
          <span>
            <span className="text-zinc-600">SI </span>
            <span className="text-zinc-800 dark:text-zinc-200">{hole.handicapIndex}</span>
          </span>
        </div>
      </div>

      {locked && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Hole locked
          </p>
          <button
            type="button"
            onClick={onUnlock}
            className="inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
          >
            <Pencil size={11} strokeWidth={2.5} /> Edit
          </button>
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {players.map((p) => (
          <PlayerHoleRow
            key={p.tripMemberId}
            matchId={matchIdByPlayer?.[p.tripMemberId] ?? matchId}
            hole={hole}
            player={p}
            score={getScore(p.tripMemberId)}
            enteredBy={getEnteredBy(p.tripMemberId)}
            onScoreChange={(g) => onScoreChange(p.tripMemberId, g)}
            disabled={
              (!canEdit && !p.isSelf) ||
              locked ||
              isMemberCommitted(p.tripMemberId, hole.number)
            }
          />
        ))}
      </div>

      {thirtyBall.map((s) => (
        <ThirtyBallCommitPanel
          key={s.teamId}
          state={s}
          holeNumber={hole.number}
          players={players}
          getScore={getScore}
          onCommitted={onThirtyBallCommit}
        />
      ))}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40"
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

      {missingByHole.length > 0 && (
        <div className="mt-3 rounded-sm border border-red-500/40 bg-red-500/5 p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-700 dark:text-red-400">
            Missing scores
          </p>
          <ul className="mt-1.5 space-y-1">
            {missingByHole.map((m) => (
              <li key={m.hole} className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onJumpHole(m.hole)}
                  className="font-mono text-[11px] font-semibold uppercase tracking-widest text-red-700 dark:text-red-300 underline-offset-2 hover:underline"
                >
                  Hole {m.hole}
                </button>
                <span className="truncate text-right text-[11px] text-zinc-700 dark:text-zinc-300">
                  {m.players.map((p) => p.nickname).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 30 Ball per-hole commit flow, rendered under the score rows for each
 * side present on this scorecard. Three phases:
 *   1. waiting — grosses incomplete, or viewer can't commit: budget chip only
 *   2. selecting — after "Commit scores": tap 0-N of the side's scores,
 *      then "Commit N" locks it in (server-enforced budget)
 *   3. committed — locked summary of who counted; only captains/admins
 *      can reopen (from the match page), so no undo control here
 */
function ThirtyBallCommitPanel({
  state,
  holeNumber,
  players,
  getScore,
  onCommitted,
}: {
  state: ScoreClientThirtyBall;
  holeNumber: number;
  players: ScoreClientPlayer[];
  getScore: (tripMemberId: string) => number | null;
  onCommitted: (teamId: string, holeNumber: number, countedIds: string[]) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const color = state.teamColor ?? '#ca8a04';
  const sidePlayers = players.filter((p) => state.memberIds.includes(p.tripMemberId));
  // Side members not on this scorecard (shouldn't happen — same-foursome
  // rule) block commit rather than committing around a missing player.
  const allPresent = sidePlayers.length === state.memberIds.length;
  const allScored = state.memberIds.every((id) => getScore(id) != null);
  const committedIds = state.committedHoles[holeNumber];
  const isCommitted = committedIds != null;
  const remaining = THIRTY_BALL_BUDGET - state.budgetUsed;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commit() {
    setError(null);
    const countedIds = [...selected];
    startTransition(async () => {
      try {
        await commitThirtyBallHole(state.matchId, state.teamId, holeNumber, countedIds);
        onCommitted(state.teamId, holeNumber, countedIds);
        setSelecting(false);
        setSelected(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Commit failed — try again.');
      }
    });
  }

  return (
    <div
      className="mt-2 rounded-sm border p-3"
      style={{ borderColor: `${color}55`, background: `${color}0d` }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em]" style={{ color }}>
          {state.teamName} · 30 Ball
        </p>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest tabular-nums text-zinc-700 dark:text-zinc-300">
          {state.budgetUsed}/{THIRTY_BALL_BUDGET} used
        </span>
      </div>

      {isCommitted ? (
        <div className="mt-2 flex items-start gap-2">
          <Lock size={12} className="mt-0.5 shrink-0 text-zinc-500" />
          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            Committed —{' '}
            {committedIds.length === 0 ? (
              <span className="text-zinc-500">no scores counted this hole</span>
            ) : (
              <>
                counting{' '}
                <span className="font-semibold">
                  {sidePlayers
                    .filter((p) => committedIds.includes(p.tripMemberId))
                    .map((p) => `${p.nickname} (${getScore(p.tripMemberId) ?? '—'})`)
                    .join(', ')}
                </span>
              </>
            )}
          </p>
        </div>
      ) : selecting ? (
        <div className="mt-2">
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
            Tap the scores to count toward your 30. Committing locks this hole for good.
          </p>
          <div className="mt-2 space-y-1">
            {sidePlayers.map((p) => {
              const on = selected.has(p.tripMemberId);
              return (
                <button
                  key={p.tripMemberId}
                  type="button"
                  disabled={pending || (!on && selected.size >= remaining)}
                  onClick={() => toggle(p.tripMemberId)}
                  className={`flex w-full items-center justify-between gap-2 rounded-sm border px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-40 ${
                    on
                      ? 'border-transparent'
                      : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black/30'
                  }`}
                  style={on ? { background: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
                >
                  <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200">
                    {p.nickname}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                    {getScore(p.tripMemberId) ?? '—'}
                    {on && <Check size={12} strokeWidth={3} style={{ color }} />}
                  </span>
                </button>
              );
            })}
          </div>
          {error && (
            <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={commit}
              className="flex-1 rounded-sm px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-black disabled:opacity-60"
              style={{ background: color }}
            >
              {pending ? (
                <Loader2 size={12} className="mx-auto animate-spin" />
              ) : (
                `Commit ${selected.size} ${selected.size === 1 ? 'ball' : 'balls'}`
              )}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setSelecting(false);
                setSelected(new Set());
                setError(null);
              }}
              className="rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : state.canCommit ? (
        <div className="mt-2">
          <button
            type="button"
            disabled={!allScored || !allPresent}
            onClick={() => setSelecting(true)}
            className="w-full rounded-sm border px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
            style={{ borderColor: `${color}88`, color }}
          >
            Commit scores
          </button>
          {!allScored && (
            <p className="mt-1.5 text-[10px] text-zinc-500">
              Enter all {state.memberIds.length} scores to commit this hole.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] text-zinc-500">
          Waiting on {state.teamName} to commit this hole.
        </p>
      )}
    </div>
  );
}

function PlayerHoleRow({
  matchId,
  hole,
  player,
  score,
  enteredBy,
  onScoreChange,
  disabled,
}: {
  matchId: string;
  hole: ScoreClientHole;
  player: ScoreClientPlayer;
  score: number | null;
  enteredBy: string | null;
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
      className="flex items-center gap-2 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-2"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
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
        {score != null && enteredBy && (
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            Entered by {enteredBy}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setRel(-1)}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-zinc-400 dark:border-zinc-700 text-lg font-bold hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40"
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
        className={`flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-sm border text-center hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40 ${
          score === hole.par
            ? 'border-yellow-500/60 bg-yellow-500/10'
            : 'border-zinc-400 dark:border-zinc-700'
        }`}
        aria-label={`Set ${player.nickname}'s score to par (${hole.par})`}
      >
        <span
          className={`font-mono text-3xl font-bold leading-none tabular-nums ${
            score == null ? 'text-zinc-300 dark:text-zinc-700' : 'text-zinc-900 dark:text-zinc-100'
          }`}
        >
          {score ?? hole.par}
        </span>
        {score == null && (
          <span className="mt-0.5 font-mono text-[8px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            Par
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setRel(1)}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-zinc-400 dark:border-zinc-700 text-lg font-bold hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40"
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
  isHoleCommitted = () => false,
}: {
  matchId: string;
  holes: ScoreClientHole[];
  player: ScoreClientPlayer;
  getScore: (h: number) => number | null;
  onScoreChange: (h: number, g: number | null) => void;
  // 30 Ball: committed holes render read-only in card view too.
  isHoleCommitted?: (h: number) => boolean;
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
    <div className="mt-6 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
      <div className="grid grid-cols-[28px_28px_28px_28px_1fr_56px] items-center gap-2 border-b border-zinc-300 dark:border-zinc-800 px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
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
            className="grid grid-cols-[28px_28px_28px_28px_1fr_56px] items-center gap-2 border-b border-zinc-200 dark:border-zinc-900 px-3 py-2 last:border-b-0"
          >
            <span className="font-mono text-sm font-bold tabular-nums text-yellow-800 dark:text-yellow-400">
              {h.number}
            </span>
            <span className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
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
            {isHoleCommitted(h.number) ? (
              <span className="flex items-center justify-end gap-1.5 px-2 py-1 text-right font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                <Lock size={11} className="text-zinc-500" />
                {score ?? '—'}
              </span>
            ) : (
              <CardScoreInput
                matchId={matchId}
                tripMemberId={player.tripMemberId}
                holeNumber={h.number}
                value={score}
                onChange={(g) => onScoreChange(h.number, g)}
              />
            )}
          </div>
        );
      })}

      <div className="grid grid-cols-[28px_28px_28px_28px_1fr_56px] items-center gap-2 border-t-2 border-zinc-400 dark:border-zinc-700 px-3 py-3 font-mono text-xs font-semibold uppercase tracking-widest">
        <span className="text-zinc-500">Σ</span>
        <span className="text-zinc-700 dark:text-zinc-300">{totalPar}</span>
        <span />
        <span />
        <span className="text-emerald-400">
          {totalStrokes > 0 ? `+${totalStrokes}` : ''}
        </span>
        <span className="text-right font-bold tabular-nums text-yellow-800 dark:text-yellow-400">
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
      className="w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black px-2 py-1 text-right font-mono text-sm tabular-nums focus:border-yellow-500 focus:outline-none"
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
  // Sync (holeNumber, gross) so we can distinguish "user actually
  // changed the score for this hole" from "user just navigated to a
  // different hole that already has a persisted value." The latter
  // shouldn't fire a save — nothing has changed server-side.
  const lastSeen = useRef<{ holeNumber: number; gross: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = String(gross ?? '');
    const prev = lastSeen.current;

    // First mount or hole changed: adopt whatever's on the screen as
    // the already-persisted value and skip the save.
    if (!prev || prev.holeNumber !== holeNumber) {
      lastSeen.current = { holeNumber, gross: key };
      return;
    }
    if (prev.gross === key) return;
    lastSeen.current = { holeNumber, gross: key };

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
  const [activeHole, setActiveHole] = useState(() => {
    const have = new Set<string>();
    for (const s of initialTeamScores) {
      if (s.gross != null) have.add(`${s.teamId}:${s.holeNumber}`);
    }
    for (let h = 1; h <= holes.length; h++) {
      if (!teams.every((t) => have.has(`${t.teamId}:${h}`))) return h;
    }
    return Math.max(1, holes.length);
  });
  const [scores, setScores] = useState<Map<string, number | null>>(() => {
    const m = new Map<string, number | null>();
    for (const s of initialTeamScores) {
      m.set(`${s.teamId}:${s.holeNumber}`, s.gross);
    }
    return m;
  });
  const enteredByMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of initialTeamScores) {
      if (s.enteredByLabel) {
        m.set(`${s.teamId}:${s.holeNumber}`, s.enteredByLabel);
      }
    }
    return m;
  }, [initialTeamScores]);
  const [unlockedHoles, setUnlockedHoles] = useState<Set<number>>(
    () => new Set(),
  );

  const activeHoleData = holes.find((h) => h.number === activeHole) ?? holes[0];

  // Same locking rule as the player-input flow: locks on navigation,
  // not on score completion. Otherwise the team can't tap + a second
  // time on the last team to enter a gross.
  const [leftHoles, setLeftHoles] = useState<Set<number>>(() => new Set());
  const prevActiveHoleRef = useRef(activeHole);
  useEffect(() => {
    if (prevActiveHoleRef.current !== activeHole) {
      setLeftHoles((prev) => {
        const next = new Set(prev);
        next.add(prevActiveHoleRef.current);
        return next;
      });
      prevActiveHoleRef.current = activeHole;
    }
  }, [activeHole]);

  const activeHoleLocked =
    leftHoles.has(activeHole) && !unlockedHoles.has(activeHole);

  function unlockActiveHole() {
    setUnlockedHoles((prev) => {
      const next = new Set(prev);
      next.add(activeHole);
      return next;
    });
  }

  const getScore = (teamId: string, holeNumber: number) =>
    scores.get(`${teamId}:${holeNumber}`) ?? null;
  const getEnteredBy = (teamId: string, holeNumber: number) =>
    enteredByMap.get(`${teamId}:${holeNumber}`) ?? null;

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
      <div className="mt-2 flex items-center justify-between gap-4 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Hole
          </span>
          <span className="font-mono text-3xl font-bold leading-none tabular-nums text-yellow-800 dark:text-yellow-400">
            {activeHoleData.number}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            / {holes.length}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-zinc-600 dark:text-zinc-400 tabular-nums">
          <span>
            <span className="text-zinc-600">Par </span>
            <span className="text-zinc-800 dark:text-zinc-200">{activeHoleData.par}</span>
          </span>
          {activeHoleData.yardage != null && (
            <span>
              <span className="text-zinc-600">Yd </span>
              <span className="text-zinc-800 dark:text-zinc-200">{activeHoleData.yardage}</span>
            </span>
          )}
          <span>
            <span className="text-zinc-600">SI </span>
            <span className="text-zinc-800 dark:text-zinc-200">{activeHoleData.handicapIndex}</span>
          </span>
        </div>
      </div>

      {activeHoleLocked && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Hole locked
          </p>
          <button
            type="button"
            onClick={unlockActiveHole}
            className="inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
          >
            <Pencil size={11} strokeWidth={2.5} /> Edit
          </button>
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {teams.map((t) => (
          <TeamHoleRow
            key={t.teamId}
            matchId={matchId}
            hole={activeHoleData}
            team={t}
            score={getScore(t.teamId, activeHole)}
            enteredBy={getEnteredBy(t.teamId, activeHole)}
            onScoreChange={(g) => setScore(t.teamId, activeHole, g)}
            disabled={!canEdit || activeHoleLocked}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setActiveHole((h) => Math.max(1, h - 1))}
          disabled={activeHole <= 1}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40"
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
  enteredBy,
  onScoreChange,
  disabled,
}: {
  matchId: string;
  hole: ScoreClientHole;
  team: ScoreClientTeam;
  score: number | null;
  enteredBy: string | null;
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
      className="flex items-center gap-2 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-2"
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
        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">{team.memberLine}</p>
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
        {score != null && enteredBy && (
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            Entered by {enteredBy}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setRel(-1)}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-zinc-400 dark:border-zinc-700 text-lg font-bold hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40"
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
        className={`flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-sm border text-center hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40 ${
          score === hole.par
            ? 'border-yellow-500/60 bg-yellow-500/10'
            : 'border-zinc-400 dark:border-zinc-700'
        }`}
        aria-label={`Set ${team.name}'s score to par (${hole.par})`}
      >
        <span
          className={`font-mono text-3xl font-bold leading-none tabular-nums ${
            score == null ? 'text-zinc-300 dark:text-zinc-700' : 'text-zinc-900 dark:text-zinc-100'
          }`}
        >
          {score ?? hole.par}
        </span>
        {score == null && (
          <span className="mt-0.5 font-mono text-[8px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            Par
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setRel(1)}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-zinc-400 dark:border-zinc-700 text-lg font-bold hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40"
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
  // See SaveStatus above for the (holeNumber, gross) tracking pattern —
  // navigating between holes shouldn't fire a save when the value on
  // screen is already persisted.
  const lastSeen = useRef<{ holeNumber: number; gross: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = String(gross ?? '');
    const prev = lastSeen.current;

    if (!prev || prev.holeNumber !== holeNumber) {
      lastSeen.current = { holeNumber, gross: key };
      return;
    }
    if (prev.gross === key) return;
    lastSeen.current = { holeNumber, gross: key };

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
