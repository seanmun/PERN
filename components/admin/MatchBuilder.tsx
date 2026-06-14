'use client';

import { useState, useMemo } from 'react';
import {
  DndContext,
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
} from '@/lib/scoring/formats';

// alternate_shot is defined in FORMAT_META but the DB's round_format
// enum doesn't have it yet — adding it requires a Postgres ALTER TYPE
// migration. Hide it from the builder dropdown until that ships.
const BUILDER_FORMATS: readonly FormatId[] = [
  'best_ball',
  'singles',
  'two_man_aggregate',
  'scramble',
  'stroke',
];
import {
  validateBuilderState,
  canDropOnSide,
  type BuilderState,
  type BuilderContext,
} from '@/lib/validation/match-builder';
import { createMatchFromBuilder } from '@/lib/actions/matches';

type Team = { id: string; name: string; color: string | null };
type Member = {
  id: string;
  nickname: string;
  teamId: string;
  teeTimeId: string | null;
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
}: {
  tripSlug: string;
  roundId: string;
  teams: Team[];
  members: Member[];
  teeTimes: TeeTimeSummary[];
  defaultFormat: FormatId;
  defaultTeeTimeId?: string | null;
}) {
  const [format, setFormat] = useState<FormatId>(defaultFormat);
  const meta = FORMAT_META[format];
  const [sideSize, setSideSize] = useState<number>(
    meta.allowedSideSizes[0] ?? 1,
  );
  const [sideATeamId, setSideATeamId] = useState<string>(
    teams[0]?.id ?? '',
  );
  const [sideBTeamId, setSideBTeamId] = useState<string>(
    teams[1]?.id ?? teams[0]?.id ?? '',
  );
  const [sideAPlayerIds, setSideAPlayerIds] = useState<(string | null)[]>(
    () => Array(sideSize).fill(null),
  );
  const [sideBPlayerIds, setSideBPlayerIds] = useState<(string | null)[]>(
    () => Array(sideSize).fill(null),
  );
  const [activeDrag, setActiveDrag] = useState<string | null>(null);

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

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  // dnd-kit needs both pointer (desktop) and touch (mobile) sensors —
  // the latter blocks scroll while dragging so the chip actually moves.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
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

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <form action={createMatchFromBuilder} className="space-y-6">
        <input type="hidden" name="roundId" value={roundId} />
        <input type="hidden" name="tripSlug" value={tripSlug} />
        <input type="hidden" name="state" value={payload} />
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

        {/* Side A / Side B slot template */}
        <div className="grid gap-3 sm:grid-cols-2">
          <SidePanel
            label="Side A"
            teams={teams}
            teamId={sideATeamId}
            onTeamChange={setSideATeamId}
            slotIds={sideAPlayerIds}
            side="A"
            members={members}
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
            members={members}
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

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!validation.ok}
            className="flex-1 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-yellow-500"
          >
            Create matchup
          </button>
        </div>
      </form>
    </DndContext>
  );
}

function SidePanel({
  label,
  teams,
  teamId,
  onTeamChange,
  slotIds,
  side,
  members,
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
  members: Member[];
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
          playerId={playerId}
          nickname={member.nickname}
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
  playerId,
  nickname,
  color,
  onRemove,
}: {
  playerId: string;
  nickname: string;
  color: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: playerId,
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
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color }}
        />
        {nickname}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-sm border border-zinc-300 dark:border-zinc-700 p-1 text-zinc-500 hover:border-red-500/50 hover:text-red-500"
        aria-label={`Remove ${nickname}`}
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
      className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition-opacity ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{ borderColor: `${color}55`, color, background: `${color}0a` }}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {member.nickname}
    </button>
  );
}
