'use client';

/**
 * Single-page event setup.
 *
 * Everything lives in this component's state and posts ONCE. There are no
 * intermediate saves, so there is no queued write for a navigation to
 * kill — the failure mode behind three of the six bugs in
 * docs/session-failures-2026-07.md.
 *
 * The lineup is derived, not asked for: `deriveLineup` is the same pure
 * function the server-side tests run (apps/web/tests/lineup.test.ts), so
 * what this screen shows and what the action writes cannot disagree.
 */

import { useMemo, useState, useTransition } from 'react';
import { Check, MapPin, Search, Star, Trash2, Users, X } from 'lucide-react';
import {
  deriveLineup,
  type LineupPlayer,
} from '@buddycup/scoring/lineup';
import { FORMAT_META, type FormatId } from '@buddycup/scoring/formats';
import {
  createEventFromForm,
  searchPlayersForNewEvent,
} from '@/lib/actions/create-event';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';

/**
 * Games offered. `alternate_shot` exists in FORMAT_META but NOT in the
 * round_format DB enum, so it cannot be saved — offering it would be a
 * dead end. It returns here the moment a migration adds the enum value.
 */
const OFFERED_FORMATS: FormatId[] = [
  'best_ball',
  'singles',
  'scramble',
  'two_man_aggregate',
  'thirty_ball',
  'bingo_bango_bongo',
  'stroke',
];

const FORMAT_BLURB: Partial<Record<FormatId, string>> = {
  best_ball: 'Lowest net on each side counts. The default.',
  singles: '1v1 match play.',
  scramble: 'One ball per side — everyone hits, best shot plays.',
  two_man_aggregate: 'Both partners’ nets added together.',
  thirty_ball: '3v3. Each side counts its best 30 scores.',
  bingo_bango_bongo: 'Points per hole. Everyone must play together.',
  stroke: 'Low total wins.',
};

type CourseRow = {
  id: string;
  name: string;
  location: string | null;
  isFavorite: boolean;
  played: boolean;
};

type BuddyRow = {
  userId: string;
  email: string;
  nickname: string;
  handicap: string | null;
  playedTogether: number;
};

type Row = {
  /** Stable client-side key. Becomes an array index at submit time. */
  key: string;
  userId: string | null;
  email: string | null;
  nickname: string;
  handicap: string;
  /** Manual team pick. Null = let the auto-split decide. */
  team: 'A' | 'B' | null;
};

const SECTION =
  'mt-5 rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950/40';
const LABEL =
  'font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400';
const INPUT =
  'block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function handicapNumber(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `row-${keySeq}`;
}

export default function EventSetupForm({
  courses,
  buddies,
  me,
}: {
  courses: CourseRow[];
  buddies: BuddyRow[];
  me: { userId: string; email: string; nickname: string; handicap: string | null };
}) {
  const [courseId, setCourseId] = useState<string>('');
  const [courseQuery, setCourseQuery] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [date, setDate] = useState('');

  // The organiser is on the roster by default — they're nearly always
  // playing, and making them add themselves was pure friction.
  const [rows, setRows] = useState<Row[]>([
    {
      key: nextKey(),
      userId: me.userId,
      email: me.email,
      nickname: me.nickname,
      handicap: me.handicap ?? '',
      team: null,
    },
  ]);

  const [formats, setFormats] = useState<FormatId[]>(['best_ball']);
  const [teamAName, setTeamAName] = useState('Team A');
  const [teamBName, setTeamBName] = useState('Team B');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BuddyRow[]>([]);
  const [searching, setSearching] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const course = courses.find((c) => c.id === courseId) ?? null;

  const visibleCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    const pool = q
      ? courses.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.location ?? '').toLowerCase().includes(q),
        )
      : courses;
    return pool.slice(0, q ? 20 : 8);
  }, [courses, courseQuery]);

  function pickCourse(c: CourseRow) {
    setCourseId(c.id);
    setCourseQuery('');
    // Auto-name the event after the course unless the user typed their own.
    if (!nameEdited) setName(`Round at ${c.name}`);
  }

  // ---- Lineup, derived on every change --------------------------------
  const lineupPlayers: LineupPlayer[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.key,
        handicap: handicapNumber(r.handicap),
        teamId: r.team,
      })),
    [rows],
  );

  const allTeamsPicked = rows.length > 0 && rows.every((r) => r.team !== null);

  const lineup = useMemo(
    () =>
      deriveLineup({
        players: lineupPlayers,
        formats,
        teamAId: 'A',
        teamBId: 'B',
        respectExistingTeams: allTeamsPicked,
      }),
    [lineupPlayers, formats, allTeamsPicked],
  );

  const teamOf = (key: string): 'A' | 'B' =>
    (lineup.teamByPlayer[key] as 'A' | 'B') ?? 'A';

  const rowByKey = useMemo(
    () => new Map(rows.map((r) => [r.key, r])),
    [rows],
  );

  const kindLabel = lineup.groups.length > 1 ? 'Outing' : 'Matchup';

  // ---- Roster editing -------------------------------------------------
  function addRow(r: Omit<Row, 'key'>) {
    setRows((prev) => {
      if (r.email && prev.some((p) => p.email === r.email)) return prev;
      if (r.userId && prev.some((p) => p.userId === r.userId)) return prev;
      return [...prev, { ...r, key: nextKey() }];
    });
  }

  function addBuddy(b: BuddyRow) {
    addRow({
      userId: b.userId,
      email: b.email,
      nickname: b.nickname,
      handicap: b.handicap ?? '',
      team: null,
    });
    setQuery('');
    setResults([]);
  }

  function addGuest() {
    addRow({ userId: null, email: null, nickname: '', handicap: '', team: null });
  }

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found = await searchPlayersForNewEvent(q);
      const taken = new Set(rows.map((r) => r.userId).filter(Boolean));
      setResults(
        found
          .filter((f) => !taken.has(f.userId))
          .map((f) => ({
            userId: f.userId,
            email: f.email,
            nickname:
              f.recentNickname || f.displayName || f.email.split('@')[0],
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

  const suggestions = useMemo(() => {
    const taken = new Set(rows.map((r) => r.userId).filter(Boolean));
    return buddies
      .filter((b) => !taken.has(b.userId))
      .sort((a, b) => b.playedTogether - a.playedTogether)
      .slice(0, 6);
  }, [buddies, rows]);

  function toggleFormat(f: FormatId) {
    setFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  // ---- Submit ---------------------------------------------------------
  const blockers: string[] = [];
  if (!courseId) blockers.push('Pick a course.');
  if (!name.trim()) blockers.push('Name the event.');
  if (rows.length === 0) blockers.push('Add at least one player.');
  if (rows.some((r) => !r.nickname.trim())) blockers.push('Every player needs a name.');
  if (formats.length === 0) blockers.push('Pick at least one game.');
  if (lineup.matches.length === 0) {
    blockers.push('No matchup could be built — check the notes below.');
  }
  const canSubmit = blockers.length === 0 && !isPending;

  function submit() {
    setError(null);
    const indexOf = new Map(rows.map((r, i) => [r.key, i]));
    const payload = {
      name: name.trim(),
      courseId,
      date: date || null,
      teamA: { name: teamAName.trim() || 'Team A', color: '#16a34a' },
      teamB: { name: teamBName.trim() || 'Team B', color: '#eab308' },
      players: rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        nickname: r.nickname.trim(),
        handicap: r.handicap.trim() || null,
        team: teamOf(r.key),
      })),
      groups: lineup.groups.map((g) =>
        g.map((k) => indexOf.get(k)!).filter((i) => i !== undefined),
      ),
      matches: lineup.matches.map((m) => ({
        format: m.format,
        sideSize: m.sideSize,
        sideA: m.sideAPlayerIds.map((k) => indexOf.get(k)!),
        sideB: m.sideBPlayerIds.map((k) => indexOf.get(k)!),
      })),
    };

    const fd = new FormData();
    fd.set('payload', JSON.stringify(payload));
    startTransition(async () => {
      try {
        await createEventFromForm(fd);
      } catch (err) {
        rethrowIfControlFlow(err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Could not create the event — try again.',
        );
      }
    });
  }

  return (
    <div>
      {/* ---- 1. Course ------------------------------------------------ */}
      <section className={SECTION}>
        <div className="flex items-center justify-between px-4 py-3">
          <span className={LABEL}>1 · Course</span>
          {course && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              <Check size={12} /> {course.name}
            </span>
          )}
        </div>

        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-900">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={courseQuery}
              onChange={(e) => setCourseQuery(e.target.value)}
              placeholder={course ? 'Change course…' : 'Search courses…'}
              className={`${INPUT} pl-9`}
            />
          </div>

          <ul className="mt-2 space-y-1">
            {visibleCourses.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pickCourse(c)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                    c.id === courseId
                      ? 'border border-yellow-600/40 bg-yellow-500/5'
                      : ''
                  }`}
                >
                  {c.isFavorite ? (
                    <Star size={12} className="shrink-0 text-yellow-500" />
                  ) : (
                    <MapPin size={12} className="shrink-0 text-zinc-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {c.name}
                  </span>
                  {c.location && (
                    <span className="truncate text-[11px] text-zinc-500">
                      {c.location}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {visibleCourses.length === 0 && (
              <li className="px-2.5 py-2 text-[12px] text-zinc-500">
                No course matches “{courseQuery}”. Add it from the course
                library first.
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* ---- 2. Players ----------------------------------------------- */}
      <section className={SECTION}>
        <div className="flex items-center justify-between px-4 py-3">
          <span className={LABEL}>2 · Players</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {rows.length} in
          </span>
        </div>

        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-900">
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
                    onClick={() => addBuddy(b)}
                    className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {b.nickname}
                    </span>
                    <span className="truncate text-[11px] text-zinc-500">
                      {b.email}
                    </span>
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
                    onClick={() => addBuddy(b)}
                    className="rounded-full border border-zinc-300 px-2.5 py-1 text-[12px] font-semibold hover:border-yellow-600/60 hover:text-yellow-800 dark:border-zinc-800 dark:hover:text-yellow-400"
                  >
                    + {b.nickname}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-900">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2 py-2">
                <input
                  value={r.nickname}
                  onChange={(e) => patchRow(r.key, { nickname: e.target.value })}
                  placeholder="Name"
                  className="min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold focus:border-zinc-300 focus:outline-none dark:focus:border-zinc-800"
                />
                <input
                  value={r.handicap}
                  onChange={(e) => patchRow(r.key, { handicap: e.target.value })}
                  placeholder="Hcp"
                  inputMode="decimal"
                  className="w-16 rounded-sm border border-zinc-300 bg-transparent px-2 py-1.5 text-center font-mono text-sm tabular-nums focus:border-yellow-500 focus:outline-none dark:border-zinc-800"
                />
                {/* Team override. Untouched = the auto-split decides, and
                    the chip shows what it decided. */}
                <button
                  type="button"
                  onClick={() =>
                    patchRow(r.key, {
                      team: r.team === null ? 'B' : r.team === 'B' ? 'A' : null,
                    })
                  }
                  title={
                    r.team === null
                      ? 'Auto-assigned — tap to pin'
                      : 'Pinned — tap to change'
                  }
                  className={`w-20 shrink-0 rounded-sm border px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
                    teamOf(r.key) === 'A'
                      ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-yellow-600/40 bg-yellow-500/10 text-yellow-800 dark:text-yellow-400'
                  } ${r.team === null ? 'opacity-60' : ''}`}
                >
                  {teamOf(r.key) === 'A' ? teamAName : teamBName}
                  {r.team === null ? ' ?' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(r.key)}
                  aria-label={`Remove ${r.nickname || 'player'}`}
                  className="shrink-0 rounded-sm p-1.5 text-zinc-500 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addGuest}
            className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-800 hover:text-yellow-600 dark:text-yellow-400"
          >
            + Add someone not on BuddyCup
          </button>
        </div>
      </section>

      {/* ---- 3. Game -------------------------------------------------- */}
      <section className={SECTION}>
        <div className="px-4 py-3">
          <span className={LABEL}>3 · Game</span>
          <p className="mt-1 text-[11px] text-zinc-500">
            Pick one, or stack a side game on top.
          </p>
        </div>
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-900">
          <div className="flex flex-wrap gap-1.5">
            {OFFERED_FORMATS.map((f) => {
              const on = formats.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFormat(f)}
                  className={`rounded-sm border px-3 py-2 text-left text-[12px] font-semibold ${
                    on
                      ? 'border-yellow-600/60 bg-yellow-500/10 text-yellow-800 dark:text-yellow-400'
                      : 'border-zinc-300 text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {on && <Check size={12} />}
                    {FORMAT_META[f].label}
                  </span>
                  {FORMAT_BLURB[f] && (
                    <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                      {FORMAT_BLURB[f]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- 4. Lineup (derived) -------------------------------------- */}
      <section className={SECTION}>
        <div className="flex items-center justify-between px-4 py-3">
          <span className={LABEL}>4 · Teams &amp; groups</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {kindLabel}
          </span>
        </div>

        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-900">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={LABEL}>Team A</span>
              <input
                value={teamAName}
                onChange={(e) => setTeamAName(e.target.value)}
                className={`${INPUT} mt-1`}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Team B</span>
              <input
                value={teamBName}
                onChange={(e) => setTeamBName(e.target.value)}
                className={`${INPUT} mt-1`}
              />
            </label>
          </div>

          {lineup.groups.length > 0 && (
            <ul className="mt-3 space-y-2">
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
                    {g.map((key) => {
                      const r = rowByKey.get(key);
                      const isA = teamOf(key) === 'A';
                      return (
                        <span
                          key={key}
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            isA
                              ? 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400'
                              : 'border-yellow-600/40 text-yellow-800 dark:text-yellow-400'
                          }`}
                        >
                          {r?.nickname || 'Unnamed'}
                          {r?.handicap && (
                            <span className="ml-1 font-mono text-[9px] tabular-nums opacity-70">
                              {r.handicap}
                            </span>
                          )}
                        </span>
                      );
                    })}
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
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-1.5 text-[12px]"
                  >
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                      {FORMAT_META[m.format].label}
                    </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {m.sideAPlayerIds
                        .map((k) => rowByKey.get(k)?.nickname || '?')
                        .join(' + ')}
                    </span>
                    <span className="text-zinc-500">vs</span>
                    <span className="font-semibold text-yellow-800 dark:text-yellow-400">
                      {m.sideBPlayerIds
                        .map((k) => rowByKey.get(k)?.nickname || '?')
                        .join(' + ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lineup.notes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {lineup.notes.map((n, i) => (
                <li
                  key={i}
                  className="rounded-sm border border-yellow-600/30 bg-yellow-500/5 px-3 py-2 text-[12px] text-yellow-900 dark:text-yellow-300"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-[11px] text-zinc-500">
            Groups follow the game. Tap a player&apos;s team chip to pin them
            to a side; anything unpinned is balanced by handicap.
          </p>
        </div>
      </section>

      {/* ---- 5. Name, date, create ------------------------------------ */}
      <section className={SECTION}>
        <div className="px-4 py-3">
          <span className={LABEL}>5 · Name it and go</span>
        </div>
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-900">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className={LABEL}>Event name</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                placeholder="Saturday at Pine Hills"
                className={`${INPUT} mt-1`}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${INPUT} mt-1`}
              />
            </label>
          </div>

          {blockers.length > 0 && (
            <ul className="mt-3 space-y-1">
              {blockers.map((b) => (
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
            {isPending ? 'Creating…' : `Create ${kindLabel.toLowerCase()}`}
          </button>
        </div>
      </section>
    </div>
  );
}
