'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
} from '@dnd-kit/core';
import { X } from 'lucide-react';
import {
  FORMAT_META,
  type FormatId,
  isIndividualInput,
} from '@buddycup/scoring/formats';

// alternate_shot is defined in FORMAT_META but the DB's round_format
// enum doesn't have it yet — adding it requires a Postgres ALTER TYPE
// migration. Hide it from the builder dropdown until that ships.
const BUILDER_FORMATS: readonly FormatId[] = [
  'best_ball',
  'singles',
  'two_man_aggregate',
  'scramble',
  'stroke',
  'thirty_ball',
  'bingo_bango_bongo',
];
import {
  validateBuilderState,
  canDropOnSide,
  type BuilderState,
  type BuilderContext,
} from '@buddycup/scoring/validation/match-builder';
import { createMatchFromBuilder } from '@/lib/actions/matches';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';

type Team = { id: string; name: string; color: string | null };
type Member = {
  id: string;
  nickname: string;
  teamId: string;
  teeTimeId: string | null;
  // Avatar priority for the drag chip + slot:
  //   arcadePortraitUrl > avatarUrl > nickname monogram.
  // The NBA-Jam arcade portrait when present makes the builder
  // immediately readable — you see the face you're moving.
  arcadePortraitUrl: string | null;
  avatarUrl: string | null;
};
type TeeTimeSummary = { id: string; groupNumber: number };

export default function MatchBuilder({
  tripSlug,
  roundId,
  teams,
  members,
  teeTimes,
  defaultFormat,
  defaultTeeTimeId,
  redirectTo,
  teeHasSlopeRating = true,
  defaultHandicapMethod = 'group_low',
  alreadyMatchedIds = [],
  lastMatch = null,
}: {
  tripSlug: string;
  roundId: string;
  teams: Team[];
  members: Member[];
  teeTimes: TeeTimeSummary[];
  defaultFormat: FormatId;
  defaultTeeTimeId?: string | null;
  // Event-creation wizard passes "none" so the Matches step stays in
  // place after each add instead of navigating to the match detail
  // page. Omitted everywhere else — unchanged default behavior.
  redirectTo?: string;
  // Whether the round's tee has slope + rating (and the course has
  // hole data) — drives the warning when "Course handicap" is picked.
  teeHasSlopeRating?: boolean;
  // Trip-level default (trips.default_handicap_method) — pre-selects
  // the Handicaps dropdown; admin can still override per match.
  defaultHandicapMethod?: 'group_low' | 'match_low' | 'course';
  // Members already placed in a match in THIS round. Lets "Fill next
  // pairing" advance through the roster instead of handing back the same
  // two players every time.
  alreadyMatchedIds?: string[];
  /**
   * The round's most recent match, if any — the defaults for the next
   * one. Server data, not client memory: a localStorage version of this
   * went stale, fought the round's own format, and haunted other rounds.
   * No previous match → the round's format and stock settings.
   */
  lastMatch?: {
    format: FormatId;
    sideSize: number;
    scoring: 'match_play' | 'stableford' | 'stroke';
    handicapMethod: 'group_low' | 'match_low' | 'course';
    matchPoints: { overall: number; front9: number; back9: number };
    pts: {
      eagle: number;
      birdie: number;
      par: number;
      bogey: number;
      doublePlus: number;
    } | null;
  } | null;
}) {
  // The round's declared game wins. lastMatch is only a template for
  // "add another one like the last" — when its format differs from the
  // round's (stale attempts, a side game), it must NOT hijack the
  // default: the admin picked the round's game on the Details step and
  // the builder has to open showing that choice. This is the exact
  // "remembered settings fight the round's own format" failure
  // documented in docs/session-failures-2026-07.md.
  const template =
    lastMatch &&
    BUILDER_FORMATS.includes(lastMatch.format) &&
    lastMatch.format === defaultFormat
      ? lastMatch
      : null;
  const seedFormat = template ? template.format : defaultFormat;
  const [format, setFormat] = useState<FormatId>(seedFormat);
  const meta = FORMAT_META[format];
  const [sideSize, setSideSize] = useState<number>(() => {
    const allowed = FORMAT_META[seedFormat].allowedSideSizes;
    return template && allowed.includes(template.sideSize)
      ? template.sideSize
      : allowed[0] ?? 1;
  });
  // How the match is RESOLVED (orthogonal to format). Default
  // match_play; stableford = sum of per-hole points; stroke is reserved
  // for stroke-play scoring (low total wins).
  const [scoring, setScoring] = useState<'match_play' | 'stableford' | 'stroke'>(
    template?.scoring ??
      (seedFormat === 'thirty_ball' || seedFormat === 'bingo_bango_bongo'
        ? 'stroke'
        : 'match_play'),
  );
  // Stroke-computation basis. group_low (foursome's lowest plays
  // scratch) is the house default; match_low floats scratch to the
  // match's own lowest; course gives everyone their full course
  // handicap (index converted via the tee's slope/rating).
  const [handicapMethod, setHandicapMethod] = useState<
    'group_low' | 'match_low' | 'course'
  >(template?.handicapMethod ?? defaultHandicapMethod);
  // Stableford point overrides — null per slot = use the default.
  // Shown only when scoring === 'stableford'.
  const [pts, setPts] = useState<{
    eagle: number;
    birdie: number;
    par: number;
    bogey: number;
    doublePlus: number;
  }>(template?.pts ?? { eagle: 4, birdie: 3, par: 2, bogey: 1, doublePlus: 0 });
  // Match-point allocation. Defaults to "1 point overall" — same as
  // the prior single-point system. Presets snap to common splits.
  const [matchPoints, setMatchPoints] = useState<{
    overall: number;
    front9: number;
    back9: number;
  }>(template?.matchPoints ?? { overall: 1, front9: 0, back9: 0 });
  const [sideATeamId, setSideATeamId] = useState<string>(
    teams[0]?.id ?? '',
  );
  const [sideBTeamId, setSideBTeamId] = useState<string>(
    teams[1]?.id ?? teams[0]?.id ?? '',
  );
  // Open pre-filled with the next unmatched pairing. The groups (and the
  // round's game) already determine who plays whom in the common case —
  // making the admin re-assemble a lineup the app can compute is exactly
  // the redundancy this screen kept getting yelled at for. Clear Slots
  // remains for building something else.
  //
  // Foursome-aware: formats that require a side to share a foursome (or
  // the whole match to, like Bingo Bango Bongo) must draw from within a
  // group, or the lineup is born invalid and Create is disabled forever
  // with no way for the admin to see why.
  const pickPairing = (
    fmt: FormatId,
    size: number,
    teamA: string,
    teamB: string,
    exclude: ReadonlySet<string> = new Set(),
  ): { a: (string | null)[]; b: (string | null)[] } => {
    const fm = FORMAT_META[fmt];
    const taken = new Set([...alreadyMatchedIds, ...exclude]);
    const avail = members.filter((m) => !taken.has(m.id));
    const pad = (ids: string[]) => {
      const slots = Array<string | null>(size).fill(null);
      ids.slice(0, size).forEach((id, i) => (slots[i] = id));
      return slots;
    };
    const from = (pool: typeof members, team: string) =>
      pool.filter((m) => m.teamId === team).map((m) => m.id);

    if (fm.requiresSingleFoursome || fm.requiresSameFoursomePerSide) {
      // Group the available players by foursome, best candidate first.
      const byTee = new Map<string, typeof members>();
      for (const m of avail) {
        if (!m.teeTimeId) continue;
        byTee.set(m.teeTimeId, [...(byTee.get(m.teeTimeId) ?? []), m]);
      }
      if (fm.requiresSingleFoursome) {
        // Both sides must come out of ONE group.
        for (const [, pool] of byTee) {
          const a = from(pool, teamA);
          const b = from(pool, teamB);
          if (a.length >= size && b.length >= size) {
            return { a: pad(a), b: pad(b) };
          }
        }
        return { a: pad([]), b: pad([]) };
      }
      // Per-side: each side within one group; the two may differ.
      let aIds: string[] = [];
      let bIds: string[] = [];
      for (const [, pool] of byTee) {
        if (aIds.length < size) {
          const cand = from(pool, teamA);
          if (cand.length >= size) aIds = cand.slice(0, size);
        }
      }
      for (const [, pool] of byTee) {
        const cand = from(pool, teamB).filter((id) => !aIds.includes(id));
        if (cand.length >= size) { bIds = cand.slice(0, size); break; }
      }
      return { a: pad(aIds), b: pad(bIds) };
    }
    return { a: pad(from(avail, teamA)), b: pad(from(avail, teamB)) };
  };

  const initialPairing = pickPairing(
    seedFormat,
    FORMAT_META[seedFormat].allowedSideSizes.includes(
      template?.sideSize ?? -1,
    )
      ? template!.sideSize
      : FORMAT_META[seedFormat].allowedSideSizes[0] ?? 1,
    teams[0]?.id ?? '',
    teams[1]?.id ?? teams[0]?.id ?? '',
  );
  const [sideAPlayerIds, setSideAPlayerIds] = useState<(string | null)[]>(
    () => initialPairing.a,
  );
  const [sideBPlayerIds, setSideBPlayerIds] = useState<(string | null)[]>(
    () => initialPairing.b,
  );
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  // Submit lifecycle — the button must visibly work, confirm, and
  // disarm. Silent success left the form loaded and users double-created.
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  // Re-init slot arrays when sideSize changes — preserve existing
  // selections up to the new size, drop overflow.
  function changeSideSize(n: number) {
    setSideSize(n);
    setSideAPlayerIds((prev) => {
      const next = Array(n).fill(null) as (string | null)[];
      for (let i = 0; i < Math.min(n, prev.length); i++) next[i] = prev[i];
      return next;
    });
    setSideBPlayerIds((prev) => {
      const next = Array(n).fill(null) as (string | null)[];
      for (let i = 0; i < Math.min(n, prev.length); i++) next[i] = prev[i];
      return next;
    });
  }

  // When format changes, reset the side size to the format's first
  // allowed value if the current one isn't supported.
  function changeFormat(f: FormatId) {
    setFormat(f);
    const nextMeta = FORMAT_META[f];
    if (!nextMeta.allowedSideSizes.includes(sideSize)) {
      changeSideSize(nextMeta.allowedSideSizes[0]);
    }
    // 30 Ball is always decided by 18-hole cumulative total, not
    // hole-by-hole up/down — default scoring to stroke so picking the
    // format doesn't silently leave it on match play (recompute.ts
    // resolves 30 Ball the same way regardless, but this keeps the
    // scoring dropdown honest about what's actually happening).
    if (f === 'thirty_ball') {
      setScoring('stroke');
    }
    // Bingo Bango Bongo is decided by committed judgment points —
    // recompute.ts resolves it bespoke regardless of the scoring field.
    if (f === 'bingo_bango_bongo') {
      setScoring('stroke');
    }
    // Team-input formats (scramble, alternate shot) only have match-play
    // resolution — the server rejects anything else, so don't offer it.
    if (FORMAT_META[f].inputMode === 'team') {
      setScoring('match_play');
    }
  }

  const ctx: BuilderContext = useMemo(() => {
    const memberTeamById = new Map<string, string>();
    const memberTeeTimeById = new Map<string, string | null>();
    for (const m of members) {
      memberTeamById.set(m.id, m.teamId);
      memberTeeTimeById.set(m.id, m.teeTimeId);
    }
    return { memberTeamById, memberTeeTimeById };
  }, [members]);

  const state: BuilderState = {
    format,
    sideSize,
    sideATeamId,
    sideBTeamId,
    sideAPlayerIds,
    sideBPlayerIds,
  };
  const validation = validateBuilderState(state, ctx);

  // A player is "placed" once they're in any slot — hide from roster.
  const placedIds = new Set(
    [...sideAPlayerIds, ...sideBPlayerIds].filter(
      (id): id is string => !!id,
    ),
  );

  // Next unplaced players per side: not already in a match this round,
  // and not already dropped into a slot right now.
  const matchedSet = new Set(alreadyMatchedIds);
  // Cheap and depends on values rebuilt every render anyway (placedIds is
  // a fresh Set each pass), so memoising it would never actually hit.
  const nextPairing = (() => {
    // Same foursome-aware rules as the initial seed, so Fill can never
    // hand back a lineup the validator rejects.
    const p = pickPairing(
      format,
      sideSize,
      sideATeamId,
      sideBTeamId,
      placedIds,
    );
    return {
      a: p.a.filter((id): id is string => !!id),
      b: p.b.filter((id): id is string => !!id),
    };
  })();
  const unmatchedCount = members.filter(
    (m) => !matchedSet.has(m.id) && (m.teamId === sideATeamId || m.teamId === sideBTeamId),
  ).length;

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  // dnd-kit needs both pointer (desktop) and touch (mobile) sensors. The
  // long-press delay on touch keeps the page scrollable; the tight
  // tolerance + small pointer distance make the drag feel responsive.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 5 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveDrag(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const playerId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    // Drop target IDs are "slot:A:<idx>" / "slot:B:<idx>" / "roster".
    if (overId === 'roster') {
      // Drop back to roster — remove player from any slot they're in.
      removeFromAnySlot(playerId);
      return;
    }
    const m = overId.match(/^slot:(A|B):(\d+)$/);
    if (!m) return;
    const side = m[1] as 'A' | 'B';
    const idx = Number(m[2]);

    if (!canDropOnSide(state, ctx, side, playerId)) return;

    // Wrong team — silently ignore. UI also surfaces this as a greyed slot.
    const member = memberById.get(playerId);
    if (!member) return;
    const requiredTeam = side === 'A' ? sideATeamId : sideBTeamId;
    if (member.teamId !== requiredTeam) return;

    // Remove from any current slot first (allow re-placement).
    removeFromAnySlot(playerId);

    if (side === 'A') {
      setSideAPlayerIds((prev) => {
        const next = [...prev];
        next[idx] = playerId;
        return next;
      });
    } else {
      setSideBPlayerIds((prev) => {
        const next = [...prev];
        next[idx] = playerId;
        return next;
      });
    }
  }

  function removeFromAnySlot(playerId: string) {
    setSideAPlayerIds((prev) =>
      prev.map((id) => (id === playerId ? null : id)),
    );
    setSideBPlayerIds((prev) =>
      prev.map((id) => (id === playerId ? null : id)),
    );
  }

  const payload = JSON.stringify(state);

  function submit(fd: FormData) {
    setSubmitError(null);
    setJustCreated(false);
    startTransition(async () => {
      try {
        await createMatchFromBuilder(fd);
        // Standalone builder redirects to the match page (Next handles
        // it). The wizard stays put: clear the slots so the form is
        // disarmed and confirm out loud.
        if (redirectTo === 'none') {
          setSideAPlayerIds(Array(sideSize).fill(null));
          setSideBPlayerIds(Array(sideSize).fill(null));
          setJustCreated(true);
          // revalidatePath alone doesn't repaint a client component that
          // never navigates — without this the banner said "it's in the
          // list above" while the list still read "No matches yet".
          router.refresh();
        }
      } catch (err) {
        rethrowIfControlFlow(err);
        setSubmitError(
          err instanceof Error && err.message
            ? err.message
            : 'Could not create the match — try again.',
        );
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <form action={submit} className="space-y-6">
        <input type="hidden" name="roundId" value={roundId} />
        <input type="hidden" name="tripSlug" value={tripSlug} />
        <input type="hidden" name="state" value={payload} />
        {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
        <input type="hidden" name="scoring" value={scoring} />
        <input type="hidden" name="handicapMethod" value={handicapMethod} />
        <input type="hidden" name="pointsOverall" value={matchPoints.overall} />
        <input type="hidden" name="pointsFront9" value={matchPoints.front9} />
        <input type="hidden" name="pointsBack9" value={matchPoints.back9} />
        {scoring === 'stableford' && (
          <input
            type="hidden"
            name="stablefordPoints"
            value={JSON.stringify(pts)}
          />
        )}
        {/* The URL's teeTimeId is the admin's explicit "this match
            belongs to this foursome" choice. Posted so the action can
            override the derived teeTimeId, which is null when this is
            the first match in a round. */}
        {defaultTeeTimeId && (
          <input type="hidden" name="explicitTeeTimeId" value={defaultTeeTimeId} />
        )}

        {/* Format + side size pickers */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              Format
            </span>
            <select
              value={format}
              onChange={(e) => changeFormat(e.target.value as FormatId)}
              className="mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            >
              {BUILDER_FORMATS.map((id) => (
                <option key={id} value={id}>
                  {FORMAT_META[id].label}
                </option>
              ))}
            </select>
            {format === defaultFormat ? (
              <p className="mt-1.5 text-[11px] text-zinc-500">
                The round&apos;s game — already set on the Details step.
                Change it here only for a side game.
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-yellow-800 dark:text-yellow-500">
                Side game — this round plays{' '}
                {FORMAT_META[defaultFormat]?.label ?? defaultFormat}.
              </p>
            )}
          </label>

          {meta.allowedSideSizes.length > 1 && (
            <label className="block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                Side size
              </span>
              <select
                value={sideSize}
                onChange={(e) => changeSideSize(Number(e.target.value))}
                className="mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
              >
                {meta.allowedSideSizes.map((n) => (
                  <option key={n} value={n}>
                    {n}v{n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Scoring picker — orthogonal to format. Match play is the
            default; stableford sums per-hole points (admin can tweak
            the point scale below). 30 Ball and Bingo Bango Bongo have
            fixed resolution, so the picker locks to Stroke — without
            the stroke option + disable, the select would display
            "Match Play" while the hidden input posts "stroke". */}
        <label className="block">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Scoring
          </span>
          <select
            value={scoring}
            disabled={
              format === 'thirty_ball' ||
              format === 'bingo_bango_bongo' ||
              // Team-input formats lock to match play (server enforces).
              FORMAT_META[format].inputMode === 'team'
            }
            onChange={(e) => setScoring(e.target.value as 'match_play' | 'stableford' | 'stroke')}
            className="mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:opacity-50"
          >
            <option value="match_play">Match Play — win holes vs opponent</option>
            <option value="stableford">Stableford — points per hole</option>
            <option value="stroke">Stroke — decided by 18-hole total</option>
          </select>
        </label>

        {/* Handicap method — how strokes are computed, orthogonal to
            both format and scoring. */}
        <label className="block">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Handicaps
          </span>
          <select
            value={handicapMethod}
            onChange={(e) =>
              setHandicapMethod(e.target.value as 'group_low' | 'match_low' | 'course')
            }
            className="mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 text-base text-zinc-900 dark:text-zinc-100 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
          >
            <option value="group_low">Off group low — lowest in the foursome plays scratch</option>
            <option value="match_low">Off match low — lowest in this match plays scratch</option>
            <option value="course">Course handicap — everyone gets full strokes (slope-adjusted)</option>
          </select>
        </label>

        {handicapMethod === 'course' && !teeHasSlopeRating && (
          <div className="rounded-sm border border-yellow-600/40 bg-yellow-500/5 p-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-400">
              Tee is missing slope / rating
            </p>
            <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
              This round&apos;s tee has no slope and rating, so course
              handicaps will fall back to each player&apos;s raw trip
              handicap. Add slope/rating on the course admin page (or
              re-run the scorecard extraction) to get true course
              handicaps.
            </p>
          </div>
        )}

        {scoring === 'stableford' && (
          <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              Stableford points
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Standard scale below. For Modified Stableford set
              5/2/0/−1/−3.
            </p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {(
                [
                  ['eagle', 'Eagle'],
                  ['birdie', 'Birdie'],
                  ['par', 'Par'],
                  ['bogey', 'Bogey'],
                  ['doublePlus', 'Dbl+'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                    {label}
                  </span>
                  <input
                    type="number"
                    value={pts[key]}
                    onChange={(e) =>
                      setPts((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="mt-1 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-1.5 text-right font-mono text-sm tabular-nums focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Match-points splitter */}
        <div className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Cup points
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            How many cup points this match awards. Front 9 + Back 9
            close independently, so a 9-hole closeout shows up on the
            cup tab right away.
          </p>
          {/* Presets */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {([
              { label: '1 pt — match', preset: { overall: 1, front9: 0, back9: 0 } },
              { label: '2 pts — split 9s', preset: { overall: 0, front9: 1, back9: 1 } },
              { label: '3 pts — match + 9s', preset: { overall: 1, front9: 1, back9: 1 } },
            ] as const).map((p) => {
              const active =
                matchPoints.overall === p.preset.overall &&
                matchPoints.front9 === p.preset.front9 &&
                matchPoints.back9 === p.preset.back9;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setMatchPoints(p.preset)}
                  className={`rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    active
                      ? 'border-yellow-500 bg-yellow-500 text-black'
                      : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:border-yellow-500/40'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {/* Custom inputs */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ['overall', 'Overall (18)'],
                ['front9', 'Front 9'],
                ['back9', 'Back 9'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                  {label}
                </span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={matchPoints[key]}
                  onChange={(e) =>
                    setMatchPoints((prev) => ({
                      ...prev,
                      [key]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="mt-1 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-1.5 text-right font-mono text-sm tabular-nums focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Format hint */}
        <p className="text-[11px] text-zinc-500">
          {meta.label} ·{' '}
          {isIndividualInput(format)
            ? 'Each player records their own gross.'
            : 'One team gross per hole.'}
          {meta.requiresSameFoursomePerSide
            ? ' Each side must share a foursome.'
            : ' Any combination of players from any foursome.'}
        </p>

        {/* Fill the slots from each team's roster, SKIPPING anyone already
            matched in this round. The old version always took the first N
            of each team, so building a second match handed back the same
            two players — useless past match one. Now each click advances
            through the roster, which is what turns 6 singles matches into
            6 clicks instead of 12 drags. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={nextPairing.a.length === 0 && nextPairing.b.length === 0}
            onClick={() => {
              setSideAPlayerIds(
                Array.from({ length: sideSize }, (_, i) => nextPairing.a[i] ?? null),
              );
              setSideBPlayerIds(
                Array.from({ length: sideSize }, (_, i) => nextPairing.b[i] ?? null),
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-40"
          >
            {unmatchedCount > 0
              ? `Fill next pairing · ${unmatchedCount} left`
              : 'Everyone matched'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSideAPlayerIds(Array(sideSize).fill(null));
              setSideBPlayerIds(Array(sideSize).fill(null));
            }}
            className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Clear slots
          </button>
        </div>

        {/* Side A / Side B slot template */}
        <div className="grid gap-3 sm:grid-cols-2">
          <SidePanel
            label="Side A"
            teams={teams}
            teamId={sideATeamId}
            onTeamChange={setSideATeamId}
            slotIds={sideAPlayerIds}
            side="A"
            memberById={memberById}
            teamById={teamById}
            onRemove={removeFromAnySlot}
            activeDrag={activeDrag}
            state={state}
            ctx={ctx}
          />
          <SidePanel
            label="Side B"
            teams={teams}
            teamId={sideBTeamId}
            onTeamChange={setSideBTeamId}
            slotIds={sideBPlayerIds}
            side="B"
            memberById={memberById}
            teamById={teamById}
            onRemove={removeFromAnySlot}
            activeDrag={activeDrag}
            state={state}
            ctx={ctx}
          />
        </div>

        {/* Roster grouped by foursome */}
        <RosterPanel
          teeTimes={teeTimes}
          members={members}
          teamById={teamById}
          placedIds={placedIds}
        />

        {/* Validation messages */}
        {!validation.ok && validation.errors.length > 0 && (
          <ul className="space-y-1 rounded-sm border border-yellow-600/30 bg-yellow-500/5 p-3 text-[11px] text-yellow-800 dark:text-yellow-300">
            {validation.errors.map((err, i) => (
              <li key={i}>· {err}</li>
            ))}
          </ul>
        )}

        {submitError && (
          <p className="rounded-sm border border-red-500/40 bg-red-500/5 p-3 text-[12px] text-red-700 dark:text-red-300">
            {submitError}
          </p>
        )}

        {justCreated && !submitError && (
          <p className="rounded-sm border border-emerald-500/40 bg-emerald-500/5 p-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            ✓ Match created — it&apos;s in the list above.
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!validation.ok || isPending}
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-yellow-500"
          >
            {isPending ? 'Creating…' : 'Create matchup'}
          </button>
        </div>
      </form>

      {/* DragOverlay renders the player chip directly under the user's
          finger / cursor during a drag — without this dnd-kit produces
          no visible ghost on mobile, which is the #1 reason the prior
          drag felt broken. The chip mirrors the roster style so it
          reads instantly. */}
      <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeDrag
          ? (() => {
              const m = memberById.get(activeDrag);
              if (!m) return null;
              const color = teamById.get(m.teamId)?.color ?? '#71717a';
              return <FloatingChip member={m} color={color} />;
            })()
          : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Floating "ghost" rendered inside DragOverlay while a chip is in flight. */
function FloatingChip({
  member,
  color,
}: {
  member: Member;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-sm border px-3 py-2 font-mono text-sm font-bold shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
      style={{
        borderColor: color,
        background: `linear-gradient(135deg, ${color}33 0%, #0a0a0a 110%)`,
        color: 'white',
      }}
    >
      <Avatar member={member} color={color} size={28} />
      <span className="whitespace-nowrap">{member.nickname}</span>
    </div>
  );
}

/** Small avatar — uses the member's PFP if present, otherwise a colored
    monogram of their nickname's first letter. */
function Avatar({
  member,
  color,
  size,
}: {
  member: Member;
  color: string;
  size: number;
}) {
  const initial = member.nickname.charAt(0).toUpperCase();
  const src = member.arcadePortraitUrl ?? member.avatarUrl;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={member.nickname}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size, boxShadow: `0 0 0 1px ${color}` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-full font-bold uppercase"
      style={{
        width: size,
        height: size,
        background: `${color}33`,
        color,
        fontSize: size * 0.45,
        boxShadow: `0 0 0 1px ${color}`,
      }}
    >
      {initial}
    </span>
  );
}

function SidePanel({
  label,
  teams,
  teamId,
  onTeamChange,
  slotIds,
  side,
  memberById,
  teamById,
  onRemove,
  activeDrag,
  state,
  ctx,
}: {
  label: string;
  teams: Team[];
  teamId: string;
  onTeamChange: (id: string) => void;
  slotIds: (string | null)[];
  side: 'A' | 'B';
  memberById: Map<string, Member>;
  teamById: Map<string, Team>;
  onRemove: (id: string) => void;
  activeDrag: string | null;
  state: BuilderState;
  ctx: BuilderContext;
}) {
  const team = teamById.get(teamId);
  const color = team?.color ?? '#71717a';
  return (
    <section
      className="rounded-sm border p-3"
      style={{ borderColor: `${color}55`, background: `${color}0a` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono text-[10px] font-semibold uppercase tracking-widest"
          style={{ color }}
        >
          {label}
        </span>
        <select
          value={teamId}
          onChange={(e) => onTeamChange(e.target.value)}
          className="rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 space-y-2">
        {slotIds.map((id, idx) => (
          <Slot
            key={`${side}:${idx}`}
            side={side}
            idx={idx}
            playerId={id}
            member={id ? memberById.get(id) ?? null : null}
            color={color}
            onRemove={onRemove}
            activeDrag={activeDrag}
            state={state}
            ctx={ctx}
            requiredTeamId={teamId}
            memberById={memberById}
          />
        ))}
      </div>
    </section>
  );
}

function Slot({
  side,
  idx,
  playerId,
  member,
  color,
  onRemove,
  activeDrag,
  state,
  ctx,
  requiredTeamId,
  memberById,
}: {
  side: 'A' | 'B';
  idx: number;
  playerId: string | null;
  member: Member | null;
  color: string;
  onRemove: (id: string) => void;
  activeDrag: string | null;
  state: BuilderState;
  ctx: BuilderContext;
  requiredTeamId: string;
  memberById: Map<string, Member>;
}) {
  const id = `slot:${side}:${idx}`;
  const { setNodeRef, isOver } = useDroppable({ id });

  // While dragging, compute whether this active drag would be valid here.
  const activeMember = activeDrag ? memberById.get(activeDrag) : null;
  let wouldAccept = true;
  if (activeMember) {
    const teamOk = activeMember.teamId === requiredTeamId;
    const foursomeOk = canDropOnSide(state, ctx, side, activeMember.id);
    wouldAccept = teamOk && foursomeOk;
  }
  const dragging = activeDrag != null;

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded-sm border-2 border-dashed px-3 py-2 transition-colors ${
        playerId
          ? 'border-solid bg-white dark:bg-zinc-950'
          : dragging
            ? wouldAccept
              ? isOver
                ? 'border-yellow-500 bg-yellow-500/10'
                : 'border-yellow-500/60'
              : 'border-red-500/40 opacity-40'
            : 'border-zinc-400 dark:border-zinc-700'
      }`}
      style={
        playerId
          ? { borderColor: color }
          : undefined
      }
    >
      {playerId && member ? (
        <PlacedChip
          member={member}
          color={color}
          onRemove={() => onRemove(playerId)}
        />
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Slot {idx + 1}
        </span>
      )}
    </div>
  );
}

function PlacedChip({
  member,
  color,
  onRemove,
}: {
  member: Member;
  color: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: member.id,
  });
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        className={`flex flex-1 items-center gap-2 text-left text-sm font-semibold ${
          isDragging ? 'opacity-30' : ''
        }`}
        style={{ color }}
      >
        <Avatar member={member} color={color} size={28} />
        <span className="truncate">{member.nickname}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-sm border border-zinc-300 dark:border-zinc-700 p-1 text-zinc-500 hover:border-red-500/50 hover:text-red-500"
        aria-label={`Remove ${member.nickname}`}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function RosterPanel({
  teeTimes,
  members,
  teamById,
  placedIds,
}: {
  teeTimes: TeeTimeSummary[];
  members: Member[];
  teamById: Map<string, Team>;
  placedIds: Set<string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'roster' });

  // Group members by tee time (one tee time per player per round).
  const byTee = new Map<string | null, Member[]>();
  for (const m of members) {
    if (placedIds.has(m.id)) continue;
    const key = m.teeTimeId;
    if (!byTee.has(key)) byTee.set(key, []);
    byTee.get(key)!.push(m);
  }
  for (const list of byTee.values()) {
    list.sort((a, b) => a.nickname.localeCompare(b.nickname));
  }

  const teeOrder = [
    ...teeTimes.map((t) => t.id),
    null,
  ] as (string | null)[];

  return (
    <section
      ref={setNodeRef}
      className={`rounded-sm border border-zinc-300 dark:border-zinc-800 p-3 ${
        isOver ? 'bg-yellow-500/5' : ''
      }`}
    >
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        Available players
      </p>
      <div className="mt-3 space-y-3">
        {teeOrder.map((teeId) => {
          const list = byTee.get(teeId);
          if (!list || list.length === 0) return null;
          const teeSummary = teeTimes.find((t) => t.id === teeId);
          const label = teeSummary
            ? `Foursome ${teeSummary.groupNumber}`
            : 'No foursome assigned';
          return (
            <div key={teeId ?? 'none'}>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                {label}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {list.map((m) => (
                  <RosterChip
                    key={m.id}
                    member={m}
                    color={teamById.get(m.teamId)?.color ?? '#71717a'}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RosterChip({
  member,
  color,
}: {
  member: Member;
  color: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: member.id,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      className={`flex touch-none select-none items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-semibold transition-opacity ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{ borderColor: `${color}55`, color, background: `${color}0a` }}
    >
      <Avatar member={member} color={color} size={22} />
      <span className="max-w-[110px] truncate">{member.nickname}</span>
    </button>
  );
}
