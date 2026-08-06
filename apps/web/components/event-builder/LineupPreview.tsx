'use client';

/**
 * The derived lineup, shown back (§6.1: "derived groups render with a
 * preview").
 *
 * Read-only on purpose. Full drag-and-drop is explicitly not v1; the admin
 * steers the lineup by pinning players to a team and by choosing games,
 * and this pane is how they see what that produced before anything is
 * written.
 *
 * Three kinds of message, kept visually distinct because they mean
 * different things:
 *   notes   — the derivation wants you to know something (a game that
 *             could not be paired). Not blocking.
 *   errors  — `validateBuilderState` says this cannot be saved. Blocking.
 *   locked  — the lineup is frozen by scores (§2). Not a problem at all.
 */

import { AlertTriangle, Info, Lock, Users } from 'lucide-react';
import { FORMAT_META } from '@buddycup/scoring/formats';
import type { PlayerRow, RoundLineup } from './state';
import { CHIP_A, CHIP_B, LABEL, LOCKED_NOTE } from './ui';

export default function LineupPreview({
  lineup,
  players,
  teams,
  notes,
  errors,
  locked,
}: {
  lineup: RoundLineup;
  players: PlayerRow[];
  teams: Record<string, 'A' | 'B'>;
  notes: string[];
  errors: string[];
  locked: boolean;
}) {
  const byKey = new Map(players.map((p) => [p.key, p]));
  const nameOf = (key: string) => byKey.get(key)?.nickname || 'Unnamed';

  return (
    <div>
      {locked && (
        <p className={LOCKED_NOTE}>
          <Lock size={12} className="mt-0.5 shrink-0" />
          <span>
            Scores have been entered in this round, so its groups and
            matchups are locked. Course, tees, date, label and the cup
            setting can still be changed.
          </span>
        </p>
      )}

      {lineup.groups.length > 0 && (
        <ul className={`space-y-2 ${locked ? 'mt-3' : ''}`}>
          {lineup.groups.map((g, i) => (
            <li
              key={i}
              className="rounded-sm border border-zinc-200 px-3 py-2 dark:border-zinc-900"
            >
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                <Users size={11} className="mr-1 inline" />
                Group {i + 1}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {g.map((key) => (
                  <span
                    key={key}
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      (teams[key] ?? 'A') === 'A' ? CHIP_A : CHIP_B
                    }`}
                  >
                    {nameOf(key)}
                    {byKey.get(key)?.handicap && (
                      <span className="ml-1 font-mono text-[9px] tabular-nums opacity-70">
                        {byKey.get(key)!.handicap}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {lineup.matches.length > 0 && (
        <div className="mt-3">
          <p className={LABEL}>Matchups</p>
          <ul className="mt-1.5 space-y-1">
            {lineup.matches.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  {FORMAT_META[m.format].label}
                </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {m.sideA.map(nameOf).join(' + ')}
                </span>
                <span className="text-zinc-500">vs</span>
                <span className="font-semibold text-yellow-800 dark:text-yellow-400">
                  {m.sideB.map(nameOf).join(' + ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lineup.groups.length === 0 && lineup.matches.length === 0 && !locked && (
        <p className="text-[12px] text-zinc-500">
          Nothing to seat yet — add players, or pick a game.
        </p>
      )}

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {errors.map((e) => (
            <li
              key={e}
              className="flex items-start gap-1.5 rounded-sm border border-red-500/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-700 dark:text-red-300"
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {notes.map((n) => (
            <li
              key={n}
              className="flex items-start gap-1.5 rounded-sm border border-yellow-600/30 bg-yellow-500/5 px-3 py-2 text-[12px] text-yellow-900 dark:text-yellow-300"
            >
              <Info size={12} className="mt-0.5 shrink-0" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
