/**
 * Event-builder state (§6).
 *
 * One reducer owns every fact the builder knows. The components below it
 * are windows onto slices of this object and dispatch back — none of them
 * holds a fact of its own, because the July failure was several screens
 * each keeping their own half-truth and a queued save deciding which one
 * won.
 *
 * Two rules this file exists to enforce:
 *
 *  1. THE LINEUP IS DERIVED, NOT ASKED FOR. `deriveLineup` — the same pure
 *     function the harness drives and the tests cover — turns
 *     (roster, team pins, games) into groups and matchups. The admin picks
 *     where, who and what; the builder works out the rest.
 *
 *  2. WHAT THE SCREEN GREYS OUT IS WHAT THE SERVER REJECTS.
 *     `builderProblems` runs `validateBuilderState`, which is literally the
 *     function `saveEvent` runs before writing. There is no second
 *     implementation of the rules to drift from the first.
 *
 * ── Why a round carries its lineup instead of deriving on render ──────
 *
 * An existing round loaded for editing starts with the lineup that is IN
 * THE DATABASE, not a freshly derived one. Re-deriving on load would
 * silently rewrite every hand-built lineup (Pinehurst's, for one) the
 * moment an admin opened the page and pressed Save. The lineup is
 * re-derived only when the admin changes something that invalidates it:
 * the roster, a team pin, or that round's games. `saveEvent` compares
 * signatures and leaves untouched rounds alone.
 *
 * ── Locked rounds (§2) ───────────────────────────────────────────────
 *
 * Scores are foundation; groups and matchups are a layer on top. A round
 * that already has hole scores therefore has its lineup frozen and is
 * never re-derived — its stored lineup is posted back verbatim so the
 * signature matches and the server's guard never has to fire. The screen
 * shows the lock; it does not let the admin walk into the rejection.
 */

import { deriveLineup } from '@buddycup/scoring/lineup';
import { FORMAT_META, type FormatId } from '@buddycup/scoring/formats';
import {
  validateBuilderState,
  type BuilderContext,
} from '@buddycup/scoring/validation/match-builder';

export type HandicapMethod = 'group_low' | 'match_low' | 'course';

/**
 * Trip Scoring — how the INDIVIDUAL leaderboard ranks players. Trip level
 * and applied at read time, so changing it re-reads the same stored
 * scores rather than rewriting any of them.
 *
 * Not the same question as `HandicapMethod`: that decides how a match
 * between two sides resolves; this decides how twelve people are ranked
 * against each other.
 */
export type LeaderboardMethod =
  | 'gross'
  | 'net_trip_handicap'
  | 'net_course_handicap';

export const LEADERBOARD_METHOD_LABEL: Record<LeaderboardMethod, string> = {
  gross: 'Gross — raw strokes, no handicap',
  net_trip_handicap: 'Net vs trip handicap',
  net_course_handicap: 'Net vs course handicap',
};

export const LEADERBOARD_METHOD_BLURB: Record<LeaderboardMethod, string> = {
  gross: 'Lowest actual strokes wins. Nobody gets shots.',
  net_trip_handicap:
    'Each player’s trip handicap, used as-is. The same shots on every course.',
  net_course_handicap:
    'Trip handicap converted per course via the tee’s slope and rating. Falls back to the trip handicap on a course with no slope/rating.',
};

/** A person on the roster. Asked once, above the rounds (§6.2). */
export type PlayerRow = {
  /** Stable client-side identity. Becomes an array index at submit time. */
  key: string;
  /** Existing `trip_members` row, in edit mode. Null = create it. */
  memberId: string | null;
  userId: string | null;
  email: string | null;
  nickname: string;
  /** Handicaps are strings end to end — never parseFloat casually. */
  handicap: string;
  /** Manual pin. Null = the auto-split decides. */
  team: 'A' | 'B' | null;
  /** Edit mode: this player has hole scores somewhere in the event. */
  hasScores: boolean;
};

/** Groups and matchups, addressed by player key. */
export type RoundLineup = {
  groups: string[][];
  matches: {
    format: FormatId;
    sideSize: number;
    sideA: string[];
    sideB: string[];
  }[];
};

export type RoundRow = {
  key: string;
  /** Existing `rounds` row, in edit mode. Null = create it. */
  roundId: string | null;
  courseId: string;
  courseTeeId: string | null;
  /** YYYY-MM-DD, or '' for "date TBD". */
  date: string;
  label: string;
  countsTowardCup: boolean;
  /** Null inherits the trip default (§4.3). */
  handicapMethod: HandicapMethod | null;
  /** Games for this round. Formats stack (§6.1). */
  formats: FormatId[];
  /** What will actually be posted. See the header note. */
  lineup: RoundLineup;
  /** Whatever the last derivation wanted the admin to know. Never swallowed. */
  notes: string[];
  /** §2: hole scores exist in this round, so the lineup is frozen. */
  locked: boolean;
};

export type BuilderState = {
  /** Null = create. Set = edit that event. */
  tripId: string | null;
  slug: string | null;
  name: string;
  /** Stops the course-picker auto-name from stomping a typed name. */
  nameEdited: boolean;
  startDate: string;
  endDate: string;
  teamA: { name: string; color: string };
  teamB: { name: string; color: string };
  handicapMethod: HandicapMethod;
  /** Trip Scoring. See LeaderboardMethod. */
  leaderboardMethod: LeaderboardMethod;
  players: PlayerRow[];
  rounds: RoundRow[];
};

export const DEFAULT_TEAM_A = { name: 'Team A', color: '#16a34a' };
export const DEFAULT_TEAM_B = { name: 'Team B', color: '#eab308' };

/**
 * Games offered. All eight of §8 — `alternate_shot` included, which
 * requires migration 0033 to be live on the database being written to.
 */
export const OFFERED_FORMATS: readonly FormatId[] = [
  'best_ball',
  'singles',
  'scramble',
  'two_man_aggregate',
  'alternate_shot',
  'thirty_ball',
  'bingo_bango_bongo',
  'stroke',
];

export const FORMAT_BLURB: Partial<Record<FormatId, string>> = {
  best_ball: 'Lowest net on each side counts. The default.',
  singles: '1v1 match play.',
  scramble: 'One ball per side — everyone hits, best shot plays.',
  two_man_aggregate: 'Both partners’ nets added together.',
  alternate_shot: '2v2, one ball per side, players alternate shots.',
  thirty_ball: '3v3. Each side counts its best 30 scores.',
  bingo_bango_bongo: 'Points per hole. Everyone must play together.',
  stroke: 'Low total wins.',
};

// ───────────────────────── Keys ─────────────────────────

let keySeq = 0;
export function nextKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

function handicapNumber(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// ───────────────────────── Derivation ─────────────────────────

/**
 * Which team each player is on. Trip-level, so every round agrees — a
 * player cannot be on MachIans in round 1 and Douchebags in round 2.
 *
 * Comes out of `deriveLineup` rather than a local snake-draft so the
 * builder and the tested engine cannot disagree about the split.
 */
export function teamAssignment(
  players: readonly PlayerRow[],
): Record<string, 'A' | 'B'> {
  if (!players.length) return {};
  const allPinned = players.every((p) => p.team !== null);
  const { teamByPlayer } = deriveLineup({
    players: players.map((p) => ({
      id: p.key,
      handicap: handicapNumber(p.handicap),
      teamId: p.team,
    })),
    formats: [],
    teamAId: 'A',
    teamBId: 'B',
    respectExistingTeams: allPinned,
  });
  return teamByPlayer as Record<string, 'A' | 'B'>;
}

/** Derive one round's groups and matchups from the roster and its games. */
function deriveRound(
  players: readonly PlayerRow[],
  teams: Record<string, 'A' | 'B'>,
  formats: readonly FormatId[],
): { lineup: RoundLineup; notes: string[] } {
  const derived = deriveLineup({
    players: players.map((p) => ({
      id: p.key,
      handicap: handicapNumber(p.handicap),
      // Teams are already settled above; hand them back so every round
      // seats the same two sides.
      teamId: teams[p.key] ?? null,
    })),
    formats,
    teamAId: 'A',
    teamBId: 'B',
    respectExistingTeams: true,
  });
  return {
    lineup: {
      groups: derived.groups,
      matches: derived.matches.map((m) => ({
        format: m.format,
        sideSize: m.sideSize,
        sideA: m.sideAPlayerIds,
        sideB: m.sideBPlayerIds,
      })),
    },
    notes: derived.notes,
  };
}

/**
 * Re-derive the lineups of unlocked rounds. `only` limits it to one round
 * (a game was toggled there); omitted, every unlocked round is rebuilt
 * (the roster changed, which affects all of them).
 */
function rederive(state: BuilderState, only?: string): BuilderState {
  const teams = teamAssignment(state.players);
  return {
    ...state,
    rounds: state.rounds.map((r) => {
      if (r.locked) return r;
      if (only && r.key !== only) return r;
      const { lineup, notes } = deriveRound(state.players, teams, r.formats);
      return { ...r, lineup, notes };
    }),
  };
}

// ───────────────────────── Actions ─────────────────────────

export type BuilderAction =
  | { type: 'name'; value: string }
  | { type: 'suggestName'; value: string }
  | { type: 'startDate'; value: string }
  | { type: 'endDate'; value: string }
  | { type: 'team'; side: 'A' | 'B'; patch: Partial<{ name: string; color: string }> }
  | { type: 'handicapMethod'; value: HandicapMethod }
  | { type: 'leaderboardMethod'; value: LeaderboardMethod }
  | { type: 'addPlayer'; player: Omit<PlayerRow, 'key' | 'hasScores'> }
  | {
      type: 'patchPlayer';
      key: string;
      patch: Partial<Pick<PlayerRow, 'nickname' | 'handicap' | 'email'>>;
    }
  | { type: 'cyclePlayerTeam'; key: string }
  | { type: 'removePlayer'; key: string }
  | { type: 'addRound'; courseId: string; label: string }
  | { type: 'removeRound'; key: string }
  | {
      type: 'patchRound';
      key: string;
      patch: Partial<
        Pick<
          RoundRow,
          'courseId' | 'courseTeeId' | 'date' | 'label' | 'countsTowardCup' | 'handicapMethod'
        >
      >;
    }
  | { type: 'toggleFormat'; key: string; format: FormatId };

export function builderReducer(
  state: BuilderState,
  action: BuilderAction,
): BuilderState {
  switch (action.type) {
    case 'name':
      return { ...state, name: action.value, nameEdited: true };

    // Naming the event after its course saves a keystroke on the common
    // one-round case, and must never overwrite a name someone typed.
    case 'suggestName':
      return state.nameEdited ? state : { ...state, name: action.value };

    case 'startDate':
      return { ...state, startDate: action.value };

    case 'endDate':
      return { ...state, endDate: action.value };

    case 'team': {
      const key = action.side === 'A' ? 'teamA' : 'teamB';
      return { ...state, [key]: { ...state[key], ...action.patch } };
    }

    case 'handicapMethod':
      return { ...state, handicapMethod: action.value };

    case 'leaderboardMethod':
      return { ...state, leaderboardMethod: action.value };

    case 'addPlayer': {
      const p = action.player;
      // A person can only be on the roster once. Silently ignoring the
      // second tap beats an error nobody reads.
      const already = state.players.some(
        (x) =>
          (p.userId && x.userId === p.userId) ||
          (p.email && x.email?.toLowerCase() === p.email.toLowerCase()),
      );
      if (already) return state;
      return rederive({
        ...state,
        players: [
          ...state.players,
          { ...p, key: nextKey('player'), hasScores: false },
        ],
      });
    }

    case 'patchPlayer': {
      const players = state.players.map((p) =>
        p.key === action.key ? { ...p, ...action.patch } : p,
      );
      const next = { ...state, players };
      // Only a handicap can move the auto-split; a rename cannot.
      return 'handicap' in action.patch ? rederive(next) : next;
    }

    case 'cyclePlayerTeam': {
      // Unpinned -> B -> A -> unpinned. The chip always shows where the
      // player will actually play; the "?" marks "the split decided this".
      const players = state.players.map((p) =>
        p.key === action.key
          ? { ...p, team: p.team === null ? 'B' : p.team === 'B' ? 'A' : null }
          : p,
      );
      return rederive({ ...state, players: players as PlayerRow[] });
    }

    case 'removePlayer':
      return rederive({
        ...state,
        players: state.players.filter((p) => p.key !== action.key),
      });

    case 'addRound': {
      const teams = teamAssignment(state.players);
      const formats: FormatId[] = ['best_ball'];
      const { lineup, notes } = deriveRound(state.players, teams, formats);
      return {
        ...state,
        rounds: [
          ...state.rounds,
          {
            key: nextKey('round'),
            roundId: null,
            courseId: action.courseId,
            courseTeeId: null,
            date: '',
            label: action.label,
            countsTowardCup: true,
            handicapMethod: null,
            formats,
            lineup,
            notes,
            locked: false,
          },
        ],
      };
    }

    case 'removeRound':
      return {
        ...state,
        rounds: state.rounds.filter((r) => r.key !== action.key),
      };

    case 'patchRound':
      return {
        ...state,
        rounds: state.rounds.map((r) =>
          r.key === action.key ? { ...r, ...action.patch } : r,
        ),
      };

    case 'toggleFormat': {
      const round = state.rounds.find((r) => r.key === action.key);
      if (!round || round.locked) return state;
      const formats = round.formats.includes(action.format)
        ? round.formats.filter((f) => f !== action.format)
        : [...round.formats, action.format];
      return rederive(
        {
          ...state,
          rounds: state.rounds.map((r) =>
            r.key === action.key ? { ...r, formats } : r,
          ),
        },
        action.key,
      );
    }
  }
}

// ───────────────────────── Initial state ─────────────────────────

export function initialCreateState(me: {
  userId: string;
  email: string;
  nickname: string;
  handicap: string | null;
}): BuilderState {
  const players: PlayerRow[] = [
    {
      key: nextKey('player'),
      memberId: null,
      userId: me.userId,
      email: me.email,
      nickname: me.nickname,
      handicap: me.handicap ?? '',
      team: null,
      hasScores: false,
    },
  ];
  const teams = teamAssignment(players);
  const formats: FormatId[] = ['best_ball'];
  const { lineup, notes } = deriveRound(players, teams, formats);
  return {
    tripId: null,
    slug: null,
    name: '',
    nameEdited: false,
    startDate: '',
    endDate: '',
    teamA: { ...DEFAULT_TEAM_A },
    teamB: { ...DEFAULT_TEAM_B },
    handicapMethod: 'group_low',
    leaderboardMethod: 'net_course_handicap',
    players,
    rounds: [
      {
        key: nextKey('round'),
        roundId: null,
        courseId: '',
        courseTeeId: null,
        date: '',
        label: '',
        countsTowardCup: true,
        handicapMethod: null,
        formats,
        lineup,
        notes,
        locked: false,
      },
    ],
  };
}

/** Shape the edit route's loader hands over. Ids are real; keys are made here. */
export type LoadedEvent = {
  tripId: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  handicapMethod: HandicapMethod;
  leaderboardMethod: LeaderboardMethod;
  teamA: { name: string; color: string };
  teamB: { name: string; color: string };
  players: {
    memberId: string;
    userId: string | null;
    email: string | null;
    nickname: string;
    handicap: string;
    team: 'A' | 'B';
    hasScores: boolean;
  }[];
  rounds: {
    roundId: string;
    courseId: string;
    courseTeeId: string | null;
    date: string;
    label: string;
    countsTowardCup: boolean;
    handicapMethod: HandicapMethod | null;
    locked: boolean;
    /** Stored lineup, by memberId. */
    groups: string[][];
    matches: {
      format: FormatId;
      sideSize: number;
      sideA: string[];
      sideB: string[];
    }[];
  }[];
};

export function stateFromEvent(ev: LoadedEvent): BuilderState {
  const players: PlayerRow[] = ev.players.map((p) => ({
    key: nextKey('player'),
    memberId: p.memberId,
    userId: p.userId,
    email: p.email,
    nickname: p.nickname,
    handicap: p.handicap,
    // Every loaded player is pinned to the team they are already on, so
    // opening the page cannot re-split an event that is already running.
    team: p.team,
    hasScores: p.hasScores,
  }));
  const keyByMemberId = new Map(players.map((p) => [p.memberId!, p.key]));
  const toKeys = (ids: string[]): string[] =>
    ids.map((id) => keyByMemberId.get(id)).filter((k): k is string => !!k);

  return {
    tripId: ev.tripId,
    slug: ev.slug,
    name: ev.name,
    nameEdited: true,
    startDate: ev.startDate,
    endDate: ev.endDate,
    teamA: ev.teamA,
    teamB: ev.teamB,
    handicapMethod: ev.handicapMethod,
    leaderboardMethod: ev.leaderboardMethod,
    players,
    rounds: ev.rounds.map((r) => ({
      key: nextKey('round'),
      roundId: r.roundId,
      courseId: r.courseId,
      courseTeeId: r.courseTeeId,
      date: r.date,
      label: r.label,
      countsTowardCup: r.countsTowardCup,
      handicapMethod: r.handicapMethod,
      // Games are read back off the matches that exist; a shell has none.
      formats: [...new Set(r.matches.map((m) => m.format))],
      lineup: {
        groups: r.groups.map(toKeys),
        matches: r.matches.map((m) => ({
          format: m.format,
          sideSize: m.sideSize,
          sideA: toKeys(m.sideA),
          sideB: toKeys(m.sideB),
        })),
      },
      notes: [],
      locked: r.locked,
    })),
  };
}

// ───────────────────────── Locks (§2, made visible) ─────────────────────────

export type Locks = {
  /** Rounds whose lineup is frozen, by round key. */
  frozenRounds: Set<string>;
  /**
   * Players who cannot be dropped or moved between teams: they appear in a
   * frozen round's lineup, so touching them would change a lineup the
   * server will refuse to rewrite.
   */
  pinnedPlayers: Map<string, string[]>;
};

export function computeLocks(state: BuilderState): Locks {
  const frozenRounds = new Set<string>();
  const pinnedPlayers = new Map<string, string[]>();
  state.rounds.forEach((r, i) => {
    if (!r.locked) return;
    frozenRounds.add(r.key);
    const label = r.label || `Round ${i + 1}`;
    const involved = new Set<string>([
      ...r.lineup.groups.flat(),
      ...r.lineup.matches.flatMap((m) => [...m.sideA, ...m.sideB]),
    ]);
    for (const key of involved) {
      pinnedPlayers.set(key, [...(pinnedPlayers.get(key) ?? []), label]);
    }
  });
  return { frozenRounds, pinnedPlayers };
}

// ───────────────────────── Validation ─────────────────────────

export type RoundProblems = {
  key: string;
  /**
   * Blocking whatever the round's state: `saveEvent` checks these for
   * every round in the payload, locked or not.
   */
  errors: string[];
  /**
   * What `validateBuilderState` says about the matchups.
   *
   * Blocking on an editable round. NOT blocking on a locked one: its
   * lineup is posted back verbatim, `saveEvent` sees an unchanged
   * signature and skips the round before it validates anything. Blocking
   * here would dead-end an admin on a legacy lineup they are forbidden
   * from touching — unfixable by construction.
   */
  lineupErrors: string[];
  lineupBlocking: boolean;
};

export type BuilderProblems = {
  /** Event-level blockers (name, roster, duplicate emails). */
  errors: string[];
  byRound: RoundProblems[];
  ok: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Everything that stops this state from being saveable.
 *
 * The format and foursome rules are NOT re-implemented here — they go
 * through `validateBuilderState`, the function `saveEvent` runs before it
 * writes. What is checked locally is only the payload shape the action
 * checks first (a name, a course, a roster), which carries no format
 * knowledge and so cannot drift into a second opinion.
 */
export function builderProblems(state: BuilderState): BuilderProblems {
  const errors: string[] = [];

  if (!state.name.trim()) errors.push('Give the event a name.');
  if (!state.players.length) errors.push('Add at least one player.');
  if (state.players.some((p) => !p.nickname.trim())) {
    errors.push('Every player needs a name.');
  }

  const seen = new Set<string>();
  for (const p of state.players) {
    const email = (p.email ?? '').trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      errors.push(`“${email}” doesn’t look like an email address.`);
    } else if (seen.has(email)) {
      errors.push(`${email} is listed twice.`);
    }
    seen.add(email);
  }

  if (!state.rounds.length) errors.push('An event needs at least one round.');

  const teams = teamAssignment(state.players);
  const byRound: RoundProblems[] = state.rounds.map((r, i) => {
    const where = state.rounds.length > 1 ? `Round ${i + 1}` : 'The round';
    const roundErrors: string[] = [];
    const lineupErrors: string[] = [];

    // The course is editable on a locked round, so it is checked on one.
    if (!r.courseId) roundErrors.push(`${where} needs a course.`);

    // Group membership is what the foursome rules are checked against, so
    // it has to be resolved before validateBuilderState can say anything.
    const groupOf = new Map<string, string | null>();
    for (const p of state.players) groupOf.set(p.key, null);
    r.lineup.groups.forEach((g, gi) =>
      g.forEach((key) => groupOf.set(key, `group-${gi}`)),
    );

    const ctx: BuilderContext = {
      memberTeamById: new Map(state.players.map((p) => [p.key, teams[p.key] ?? 'A'])),
      memberTeeTimeById: groupOf,
    };

    for (const m of r.lineup.matches) {
      const v = validateBuilderState(
        {
          format: m.format,
          sideSize: m.sideSize,
          sideATeamId: 'A',
          sideBTeamId: 'B',
          sideAPlayerIds: m.sideA,
          sideBPlayerIds: m.sideB,
        },
        ctx,
      );
      if (!v.ok) {
        lineupErrors.push(
          `${where} · ${FORMAT_META[m.format].label}: ${v.errors.join(' ')}`,
        );
      }
    }

    return {
      key: r.key,
      errors: roundErrors,
      lineupErrors,
      lineupBlocking: !r.locked,
    };
  });

  const ok =
    errors.length === 0 &&
    byRound.every(
      (r) =>
        r.errors.length === 0 &&
        (!r.lineupBlocking || r.lineupErrors.length === 0),
    );
  return { errors, byRound, ok };
}

// ───────────────────────── Payload ─────────────────────────

/**
 * The `saveEvent` payload. Players become indices here and nowhere else —
 * one conversion, at the boundary, so nothing downstream has to know that
 * the client used keys.
 */
export function toPayload(state: BuilderState): {
  tripId: string | null;
  name: string;
  startDate: string | null;
  endDate: string | null;
  teamA: { name: string; color: string };
  teamB: { name: string; color: string };
  handicapMethod: HandicapMethod;
  leaderboardMethod: LeaderboardMethod;
  players: {
    memberId: string | null;
    userId: string | null;
    email: string | null;
    nickname: string;
    handicap: string | null;
    team: 'A' | 'B';
  }[];
  rounds: {
    roundId: string | null;
    courseId: string;
    courseTeeId: string | null;
    date: string | null;
    label: string | null;
    countsTowardCup: boolean;
    handicapMethod: HandicapMethod | null;
    groups: number[][];
    matches: { format: FormatId; sideSize: number; sideA: number[]; sideB: number[] }[];
  }[];
} {
  const teams = teamAssignment(state.players);
  const indexOf = new Map(state.players.map((p, i) => [p.key, i]));
  const idx = (keys: string[]): number[] =>
    keys.map((k) => indexOf.get(k)).filter((i): i is number => i !== undefined);

  return {
    tripId: state.tripId,
    name: state.name.trim(),
    startDate: state.startDate || null,
    endDate: state.endDate || state.startDate || null,
    teamA: {
      name: state.teamA.name.trim() || DEFAULT_TEAM_A.name,
      color: state.teamA.color,
    },
    teamB: {
      name: state.teamB.name.trim() || DEFAULT_TEAM_B.name,
      color: state.teamB.color,
    },
    handicapMethod: state.handicapMethod,
    leaderboardMethod: state.leaderboardMethod,
    players: state.players.map((p) => ({
      memberId: p.memberId,
      userId: p.userId,
      email: p.email?.trim() || null,
      nickname: p.nickname.trim(),
      handicap: p.handicap.trim() || null,
      team: teams[p.key] ?? 'A',
    })),
    rounds: state.rounds.map((r) => ({
      roundId: r.roundId,
      courseId: r.courseId,
      courseTeeId: r.courseTeeId,
      date: r.date || null,
      label: r.label.trim() || null,
      countsTowardCup: r.countsTowardCup,
      handicapMethod: r.handicapMethod,
      groups: r.lineup.groups.map(idx),
      matches: r.lineup.matches.map((m) => ({
        format: m.format,
        sideSize: m.sideSize,
        sideA: idx(m.sideA),
        sideB: idx(m.sideB),
      })),
    })),
  };
}

/** Event kind, derived exactly as the server derives it (§6.3). */
export function kindLabel(state: BuilderState): string {
  if (state.rounds.length > 1) return 'Trip';
  return (state.rounds[0]?.lineup.groups.length ?? 0) > 1 ? 'Outing' : 'Matchup';
}
