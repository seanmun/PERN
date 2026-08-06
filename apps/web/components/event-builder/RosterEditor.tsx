'use client';

/**
 * "Who" — asked once, above the rounds (§6.2), because a player is on the
 * event's roster, not on a round's.
 *
 * §3.4's order is tap-before-type: people you have played with as one-tap
 * chips, then search across the platform, then "not on BuddyCup" as the
 * fallback that creates a ghost. Emails are collected but never required —
 * a ghost with no address is a perfectly good player who simply cannot be
 * invited yet.
 *
 * Lock states (§2) are shown, not discovered on submit: a player who plays
 * in a round that already has scores cannot be dropped or moved between
 * teams, because either would rewrite a lineup those scores were entered
 * under.
 */

import { useMemo, useState } from 'react';
import { Lock, Search, Trash2 } from 'lucide-react';
import { searchPlayersForNewEvent } from '@/lib/actions/create-event';
import type { BuilderAction, Locks, PlayerRow } from './state';
import { CHIP_A, CHIP_B, INPUT, LABEL } from './ui';

export type BuddyRow = {
  userId: string;
  email: string;
  nickname: string;
  handicap: string | null;
  playedTogether: number;
};

export default function RosterEditor({
  players,
  teams,
  teamNames,
  buddies,
  locks,
  dispatch,
}: {
  players: PlayerRow[];
  teams: Record<string, 'A' | 'B'>;
  teamNames: { A: string; B: string };
  buddies: BuddyRow[];
  locks: Locks;
  dispatch: (a: BuilderAction) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BuddyRow[]>([]);
  const [searching, setSearching] = useState(false);

  const taken = useMemo(
    () => new Set(players.map((p) => p.userId).filter((x): x is string => !!x)),
    [players],
  );

  const suggestions = useMemo(
    () =>
      buddies
        .filter((b) => !taken.has(b.userId))
        .sort((a, b) => b.playedTogether - a.playedTogether)
        .slice(0, 6),
    [buddies, taken],
  );

  async function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found = await searchPlayersForNewEvent(q);
      setResults(
        found
          .filter((f) => !taken.has(f.userId))
          .map((f) => ({
            userId: f.userId,
            email: f.email,
            nickname: f.recentNickname || f.displayName || f.email.split('@')[0],
            handicap: f.recentHandicap,
            playedTogether: f.matchesPlayedTogether,
          })),
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function add(b: BuddyRow) {
    dispatch({
      type: 'addPlayer',
      player: {
        memberId: null,
        userId: b.userId,
        email: b.email,
        nickname: b.nickname,
        handicap: b.handicap ?? '',
        team: null,
      },
    });
    setQuery('');
    setResults([]);
  }

  return (
    <div>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          value={query}
          onChange={(e) => void runSearch(e.target.value)}
          placeholder="Search players by name or email…"
          className={`${INPUT} pl-9`}
        />
      </div>

      {searching && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Searching…
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((b) => (
            <li key={b.userId}>
              <button
                type="button"
                onClick={() => add(b)}
                className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {b.nickname}
                </span>
                <span className="truncate text-[11px] text-zinc-500">{b.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className={LABEL}>Played with before</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggestions.map((b) => (
              <button
                key={b.userId}
                type="button"
                onClick={() => add(b)}
                className="rounded-full border border-zinc-300 px-2.5 py-1 text-[12px] font-semibold hover:border-yellow-600/60 hover:text-yellow-800 dark:border-zinc-800 dark:hover:text-yellow-400"
              >
                + {b.nickname}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-900">
        {players.map((p) => {
          const frozenIn = locks.pinnedPlayers.get(p.key);
          const frozen = !!frozenIn?.length;
          const side = teams[p.key] ?? 'A';
          return (
            <li key={p.key} className="py-2">
              <div className="flex items-center gap-2">
                <input
                  value={p.nickname}
                  onChange={(e) =>
                    dispatch({
                      type: 'patchPlayer',
                      key: p.key,
                      patch: { nickname: e.target.value },
                    })
                  }
                  placeholder="Name"
                  className="min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold focus:border-zinc-300 focus:outline-none dark:focus:border-zinc-800"
                />
                <input
                  value={p.handicap}
                  onChange={(e) =>
                    dispatch({
                      type: 'patchPlayer',
                      key: p.key,
                      patch: { handicap: e.target.value },
                    })
                  }
                  placeholder="Hcp"
                  inputMode="decimal"
                  className="w-16 rounded-sm border border-zinc-300 bg-transparent px-2 py-1.5 text-center font-mono text-sm tabular-nums focus:border-yellow-500 focus:outline-none dark:border-zinc-800"
                />
                <button
                  type="button"
                  disabled={frozen}
                  onClick={() => dispatch({ type: 'cyclePlayerTeam', key: p.key })}
                  title={
                    frozen
                      ? `Locked — ${p.nickname || 'this player'} is already playing in ${frozenIn.join(', ')}`
                      : p.team === null
                        ? 'Auto-assigned — tap to pin'
                        : 'Pinned — tap to change'
                  }
                  className={`flex w-24 shrink-0 items-center justify-center gap-1 rounded-sm border px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest disabled:cursor-not-allowed ${
                    side === 'A' ? CHIP_A : CHIP_B
                  } ${p.team === null && !frozen ? 'opacity-60' : ''}`}
                >
                  {frozen && <Lock size={9} />}
                  <span className="truncate">
                    {side === 'A' ? teamNames.A : teamNames.B}
                  </span>
                  {p.team === null && !frozen ? '?' : ''}
                </button>
                <button
                  type="button"
                  disabled={frozen}
                  onClick={() => dispatch({ type: 'removePlayer', key: p.key })}
                  aria-label={`Remove ${p.nickname || 'player'}`}
                  title={
                    frozen
                      ? `Locked — remove the scores in ${frozenIn.join(', ')} first`
                      : 'Remove from the roster'
                  }
                  className="shrink-0 rounded-sm p-1.5 text-zinc-500 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-zinc-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* An address is what turns a ghost into an invitable player
                  and what the §3.3 collision rule matches on, so it stays
                  editable for anyone who does not already have an account. */}
              {!p.userId && (
                <input
                  value={p.email ?? ''}
                  onChange={(e) =>
                    dispatch({
                      type: 'patchPlayer',
                      key: p.key,
                      patch: { email: e.target.value || null },
                    })
                  }
                  placeholder="email (optional — needed to invite them)"
                  inputMode="email"
                  className="mt-1 w-full rounded-sm border border-transparent bg-transparent px-2 py-1 text-[12px] text-zinc-600 focus:border-zinc-300 focus:outline-none dark:text-zinc-400 dark:focus:border-zinc-800"
                />
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() =>
          dispatch({
            type: 'addPlayer',
            player: {
              memberId: null,
              userId: null,
              email: null,
              nickname: '',
              handicap: '',
              team: null,
            },
          })
        }
        className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 hover:text-yellow-600 dark:text-yellow-400"
      >
        + Add someone not on BuddyCup
      </button>
    </div>
  );
}
