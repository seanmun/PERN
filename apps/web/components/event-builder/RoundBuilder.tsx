'use client';

/**
 * THE ATOM (§6.1). One round: where, who, what.
 *
 * "Who" is missing from this component on purpose — the roster is asked
 * once above the rounds and never re-asked below (§6.2), so all this unit
 * handles is the round's own share of it: which games, and therefore which
 * groups and matchups.
 *
 * Wrap it zero times and you have a Match. Wrap it once per round with a
 * trip header above and you have a Trip. There is no second form.
 */

import { ChevronDown, ChevronUp, Lock, Trash2 } from 'lucide-react';
import CoursePicker, { type CourseRow } from './CoursePicker';
import GamePicker from './GamePicker';
import LineupPreview from './LineupPreview';
import type {
  BuilderAction,
  HandicapMethod,
  PlayerRow,
  RoundProblems,
  RoundRow,
} from './state';
import { INPUT, LABEL, META, SECTION_BODY } from './ui';

/** Exactly the fields `patchRound` accepts — one definition, in state.ts. */
type RoundPatch = Extract<BuilderAction, { type: 'patchRound' }>['patch'];

const HANDICAP_LABEL: Record<HandicapMethod, string> = {
  group_low: 'Low player in the group plays off scratch',
  match_low: 'Low player in the match plays off scratch',
  course: 'Full course handicap',
};

export default function RoundBuilder({
  round,
  index,
  total,
  courses,
  players,
  teams,
  problems,
  collapsed,
  onToggleCollapse,
  dispatch,
}: {
  round: RoundRow;
  index: number;
  total: number;
  courses: CourseRow[];
  players: PlayerRow[];
  teams: Record<string, 'A' | 'B'>;
  problems: RoundProblems;
  collapsed: boolean;
  onToggleCollapse: () => void;
  dispatch: (a: BuilderAction) => void;
}) {
  const patch = (p: RoundPatch) =>
    dispatch({ type: 'patchRound', key: round.key, patch: p });

  const course = courses.find((c) => c.id === round.courseId) ?? null;
  const title = round.label || (total > 1 ? `Round ${index + 1}` : 'The round');

  return (
    <div className="rounded-sm border border-zinc-300 dark:border-zinc-800">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{title}</span>
          <span className={`${META} shrink-0`}>
            {course?.name ?? 'no course'}
            {round.lineup.matches.length
              ? ` · ${round.lineup.matches.length} match${round.lineup.matches.length === 1 ? '' : 'es'}`
              : ' · shell'}
          </span>
        </button>
        {round.locked ? (
          <span
            title="This round has scores — its lineup is locked"
            className="shrink-0 p-1.5 text-zinc-500"
          >
            <Lock size={14} />
          </span>
        ) : (
          total > 1 && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'removeRound', key: round.key })}
              aria-label={`Remove ${title}`}
              className="shrink-0 rounded-sm p-1.5 text-zinc-500 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )
        )}
      </div>

      {!collapsed && (
        <div className={SECTION_BODY}>
          {/* ---- Where ------------------------------------------------- */}
          <p className={LABEL}>Where</p>
          <div className="mt-1.5">
            <CoursePicker
              courses={courses}
              courseId={round.courseId}
              courseTeeId={round.courseTeeId}
              onPick={(c) => {
                patch({ courseId: c.id, courseTeeId: null });
                // Name the event after the course it opens on, until
                // someone types their own.
                if (index === 0) {
                  dispatch({ type: 'suggestName', value: `Round at ${c.name}` });
                }
              }}
              onPickTee={(id) => patch({ courseTeeId: id })}
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Date</span>
              <input
                type="date"
                value={round.date}
                onChange={(e) => patch({ date: e.target.value })}
                className={`${INPUT} mt-1`}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Label</span>
              <input
                value={round.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder={total > 1 ? `Round ${index + 1}` : 'Optional'}
                className={`${INPUT} mt-1`}
              />
            </label>
          </div>

          {/* ---- What -------------------------------------------------- */}
          <p className={`${LABEL} mt-4`}>What</p>
          <div className="mt-1.5">
            <GamePicker
              selected={round.formats}
              disabled={round.locked}
              onToggle={(f) =>
                dispatch({ type: 'toggleFormat', key: round.key, format: f })
              }
            />
          </div>

          {/* ---- Lineup, derived --------------------------------------- */}
          <p className={`${LABEL} mt-4`}>Teams &amp; groups</p>
          <div className="mt-1.5">
            <LineupPreview
              lineup={round.lineup}
              players={players}
              teams={teams}
              // A locked round's lineup complaints are information, not
              // blockers — the server never re-validates a lineup it is
              // not being asked to change — so they render as notes.
              notes={
                round.locked ? [...round.notes, ...problems.lineupErrors] : round.notes
              }
              errors={[
                ...problems.errors,
                ...(round.locked ? [] : problems.lineupErrors),
              ]}
              locked={round.locked}
            />
          </div>

          {/* ---- Round settings ---------------------------------------- */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Handicap rule</span>
              <select
                value={round.handicapMethod ?? ''}
                onChange={(e) =>
                  patch({
                    handicapMethod: (e.target.value || null) as HandicapMethod | null,
                  })
                }
                className={`${INPUT} mt-1`}
              >
                <option value="">Event default</option>
                {(Object.keys(HANDICAP_LABEL) as HandicapMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {HANDICAP_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-1 flex items-center gap-2 self-end py-2.5">
              <input
                type="checkbox"
                checked={round.countsTowardCup}
                onChange={(e) => patch({ countsTowardCup: e.target.checked })}
                className="h-4 w-4 accent-yellow-500"
              />
              <span className="text-[12px] text-zinc-700 dark:text-zinc-300">
                Counts toward the cup
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
