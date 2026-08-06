'use client';

/**
 * The event builder — §6's one setup surface, in create and edit mode.
 *
 * It is a shell, not an implementation: the reducer in state.ts owns every
 * fact, `RoundBuilder` is the atom, and the pieces below it are windows on
 * slices of one object. Nothing here knows a rule about golf.
 *
 * NOTHING WRITES UNTIL SUBMIT (§6.3). There is no per-step save and no
 * queued mutation, so there is nothing for a navigation to kill — which is
 * what makes the dominant July bug class structurally impossible rather
 * than merely fixed. The cost is an unsaved-changes guard, which is dropped
 * the moment `saveEvent` reports a slug back.
 *
 * Save stays disabled while `builderProblems` — which runs
 * `validateBuilderState`, the same function the action runs before it
 * writes — has anything to say. The screen and the server cannot disagree
 * about what is legal, because they are asking the same function.
 */

import { useEffect, useMemo, useReducer, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { saveEvent } from '@/lib/actions/save-event';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';
import type { CourseRow } from './CoursePicker';
import RosterEditor, { type BuddyRow } from './RosterEditor';
import RoundBuilder from './RoundBuilder';
import {
  builderProblems,
  builderReducer,
  computeLocks,
  initialCreateState,
  kindLabel,
  stateFromEvent,
  teamAssignment,
  toPayload,
  type BuilderState,
  type LoadedEvent,
} from './state';
import { INPUT, LABEL, META, SECTION, SECTION_BODY, SECTION_HEAD } from './ui';

/**
 * What the route hands over. Deliberately raw data rather than a built
 * `BuilderState`: player keys come from a module-level counter, so a state
 * assembled on the server and then extended on the client would mint two
 * `player-1`s. Building it here keeps one counter for one screen.
 */
export type BuilderInit =
  | {
      mode: 'create';
      me: { userId: string; email: string; nickname: string; handicap: string | null };
    }
  | { mode: 'edit'; event: LoadedEvent };

export default function EventBuilder({
  init,
  courses,
  buddies,
}: {
  init: BuilderInit;
  courses: CourseRow[];
  buddies: BuddyRow[];
}) {
  const router = useRouter();
  const mode = init.mode;
  const [state, dispatch] = useReducer(builderReducer, init, (i) =>
    i.mode === 'create' ? initialCreateState(i.me) : stateFromEvent(i.event),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Which rounds are expanded. UI state, not a fact about the event, so it
  // deliberately does not live in the reducer. A single-round event opens
  // expanded; a trip opens as a list you drill into.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    state.rounds.length === 1 ? { [state.rounds[0].key]: true } : {},
  );
  /** What was loaded, so "dirty" means changed rather than merely opened. */
  const [baseline] = useState(() => JSON.stringify(toPayload(state)));

  const teams = useMemo(() => teamAssignment(state.players), [state.players]);
  const locks = useMemo(() => computeLocks(state), [state]);
  const problems = useMemo(() => builderProblems(state), [state]);
  const payload = useMemo(() => toPayload(state), [state]);
  const dirty = !saved && JSON.stringify(payload) !== baseline;

  // §6.3's trade: holding everything client-side until submit means the tab
  // holds the only copy. Warn before it is thrown away.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const teamNames = {
    A: state.teamA.name || 'Team A',
    B: state.teamB.name || 'Team B',
  };
  const kind = kindLabel(state);

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        const { slug } = await saveEvent(fd);
        // Drop the guard BEFORE navigating, or the browser prompts on the
        // way out of a save that worked.
        setSaved(true);
        router.push(`/trips/${slug}/schedule`);
      } catch (err) {
        rethrowIfControlFlow(err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Could not save the event — try again.',
        );
      }
    });
  }

  const canSubmit = problems.ok && !isPending;

  return (
    <div>
      {/* ---- Event header ---------------------------------------------- */}
      <section className={SECTION}>
        <div className={SECTION_HEAD}>
          <span className={LABEL}>The event</span>
          <span className={META}>{kind}</span>
        </div>
        <div className={SECTION_BODY}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={LABEL}>Name</span>
              <input
                value={state.name}
                onChange={(e) => dispatch({ type: 'name', value: e.target.value })}
                placeholder="Saturday at Pine Hills"
                className={`${INPUT} mt-1`}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Starts</span>
              <input
                type="date"
                value={state.startDate}
                onChange={(e) => dispatch({ type: 'startDate', value: e.target.value })}
                className={`${INPUT} mt-1`}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Ends</span>
              <input
                type="date"
                value={state.endDate}
                onChange={(e) => dispatch({ type: 'endDate', value: e.target.value })}
                className={`${INPUT} mt-1`}
              />
            </label>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(['A', 'B'] as const).map((side) => {
              const team = side === 'A' ? state.teamA : state.teamB;
              return (
                <label key={side} className="block">
                  <span className={LABEL}>Team {side}</span>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={team.name}
                      onChange={(e) =>
                        dispatch({ type: 'team', side, patch: { name: e.target.value } })
                      }
                      className={INPUT}
                    />
                    <input
                      type="color"
                      aria-label={`Team ${side} colour`}
                      value={team.color}
                      onChange={(e) =>
                        dispatch({ type: 'team', side, patch: { color: e.target.value } })
                      }
                      className="h-[46px] w-12 shrink-0 cursor-pointer rounded-sm border border-zinc-300 bg-transparent dark:border-zinc-800"
                    />
                  </div>
                </label>
              );
            })}
          </div>

          {/* §4.3 — the trip carries a default; every round inherits it
              unless it overrides. */}
          <label className="mt-3 block">
            <span className={LABEL}>Default handicap rule</span>
            <select
              value={state.handicapMethod}
              onChange={(e) =>
                dispatch({
                  type: 'handicapMethod',
                  value: e.target.value as BuilderState['handicapMethod'],
                })
              }
              className={`${INPUT} mt-1`}
            >
              <option value="group_low">Low player in the group plays off scratch</option>
              <option value="match_low">Low player in the match plays off scratch</option>
              <option value="course">Full course handicap</option>
            </select>
          </label>
        </div>
      </section>

      {/* ---- Roster (asked once) ---------------------------------------- */}
      <section className={SECTION}>
        <div className={SECTION_HEAD}>
          <span className={LABEL}>Players</span>
          <span className={META}>{state.players.length} in</span>
        </div>
        <div className={SECTION_BODY}>
          <RosterEditor
            players={state.players}
            teams={teams}
            teamNames={teamNames}
            buddies={buddies}
            locks={locks}
            dispatch={dispatch}
          />
        </div>
      </section>

      {/* ---- Rounds: the atom, repeated --------------------------------- */}
      <section className={SECTION}>
        <div className={SECTION_HEAD}>
          <span className={LABEL}>
            {state.rounds.length > 1 ? 'Rounds' : 'The round'}
          </span>
          <span className={META}>{state.rounds.length}</span>
        </div>
        <div className={`${SECTION_BODY} space-y-2`}>
          {state.rounds.map((r, i) => (
            <RoundBuilder
              key={r.key}
              round={r}
              index={i}
              total={state.rounds.length}
              courses={courses}
              players={state.players}
              teams={teams}
              problems={
                problems.byRound.find((p) => p.key === r.key) ?? {
                  key: r.key,
                  errors: [],
                  lineupErrors: [],
                  lineupBlocking: true,
                }
              }
              collapsed={!open[r.key]}
              onToggleCollapse={() =>
                setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))
              }
              dispatch={dispatch}
            />
          ))}

          <button
            type="button"
            onClick={() => {
              // A new round starts on the same course as the last one —
              // most trips replay a course, and changing it is one tap.
              const last = state.rounds[state.rounds.length - 1];
              dispatch({
                type: 'addRound',
                courseId: last?.courseId ?? '',
                label: `Round ${state.rounds.length + 1}`,
              });
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-zinc-400 px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 hover:border-yellow-600/60 hover:text-yellow-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-yellow-400"
          >
            <Plus size={12} strokeWidth={2.5} />
            Add a round
          </button>
        </div>
      </section>

      {/* ---- Submit ------------------------------------------------------ */}
      <section className={SECTION}>
        <div className={SECTION_BODY}>
          {problems.errors.length > 0 && (
            <ul className="space-y-1">
              {problems.errors.map((b) => (
                <li
                  key={b}
                  className="flex items-center gap-1.5 text-[12px] text-zinc-600 dark:text-zinc-400"
                >
                  <X size={12} className="shrink-0 text-zinc-500" />
                  {b}
                </li>
              ))}
            </ul>
          )}

          {problems.byRound.some(
            (r) => r.errors.length > 0 || (r.lineupBlocking && r.lineupErrors.length > 0),
          ) && (
            <p className="mt-2 text-[12px] text-zinc-600 dark:text-zinc-400">
              A round above has a matchup that can’t be saved — open it to see
              why.
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-sm border border-red-500/40 bg-red-500/5 p-3 text-[12px] text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="mt-3 w-full rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-yellow-500"
          >
            {isPending
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : `Create ${kind.toLowerCase()}`}
          </button>

          {mode === 'edit' && !dirty && !isPending && (
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              No changes yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
