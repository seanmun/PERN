'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  Shuffle,
  X,
} from 'lucide-react';
import { updateTeam } from '@/lib/actions/teams';
import { updatePlayerField } from '@/lib/actions/players';
import { autoSplitByHandicap } from '@buddycup/scoring/team-split';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';

type Team = { id: string; name: string; color: string | null };
type Member = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  tripHandicap: string | null;
  teamId: string | null;
};

/** Droppable id for the "not on a team yet" tray. */
const UNASSIGNED = '__unassigned__';

/**
 * Split the roster by dragging players between the two teams — the same
 * @dnd-kit setup the match builder uses, including the touch sensor's
 * long-press delay so a drag doesn't fight page scrolling on a phone.
 *
 * Replaces a three-state tap cycle whose only route into team B was
 * *through* team A (so a 6-man side took 12 taps), where the meaning of a
 * tap changed depending on which column the chip sat in, and where every
 * tap was its own server write followed by a full page refresh.
 *
 * Tapping still works and is the fast path one-handed: each chip carries
 * explicit buttons for where it can go. Nothing here requires a drag.
 */
export default function TeamsStepClient({
  teams,
  members,
}: {
  teams: Team[];
  members: Member[];
}) {
  const teamA = teams[0];
  const teamB = teams[1];

  // Local assignment is what renders. Writes are batched behind it, so a
  // move is instant instead of a round trip you sit and watch.
  const [assign, setAssign] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(members.map((m) => [m.id, m.teamId])),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );

  const pending = useRef<Map<string, string | null>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const batch = Array.from(pending.current.entries());
    if (!batch.length) return;
    pending.current.clear();
    setStatus('saving');
    try {
      await Promise.all(
        batch.map(([id, teamId]) => {
          const fd = new FormData();
          fd.set('id', id);
          fd.set('field', 'teamId');
          fd.set('value', teamId ?? '');
          return updatePlayerField(fd);
        }),
      );
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      rethrowIfControlFlow(err);
      console.error('Failed to save team assignments', err);
      setStatus('error');
    }
  }, []);

  /** Move a player and schedule the write. */
  const move = useCallback(
    (memberId: string, teamId: string | null) => {
      setAssign((prev) =>
        prev[memberId] === teamId ? prev : { ...prev, [memberId]: teamId },
      );
      pending.current.set(memberId, teamId);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 500);
    },
    [flush],
  );

  // Send anything still queued before this unmounts — dropping it would
  // lose a split the user can plainly see on screen.
  useEffect(() => () => void flush(), [flush]);

  const sensors = useSensors(
    // Same tuning as the match builder: a small drag threshold on pointer,
    // a short long-press on touch so the page still scrolls normally.
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 5 },
    }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const memberId = String(e.active.id);
    const target = String(e.over.id);
    move(memberId, target === UNASSIGNED ? null : target);
  }

  function autoSplit() {
    if (!teamA || !teamB) return;
    const { sideA, sideB } = autoSplitByHandicap(
      members.map((m) => ({
        id: m.id,
        handicap: m.tripHandicap ? Number(m.tripHandicap) : 18,
      })),
    );
    for (const id of sideA) move(id, teamA.id);
    for (const id of sideB) move(id, teamB.id);
    void flush();
  }

  if (!teamA || !teamB) {
    return (
      <p className="mt-6 text-sm text-zinc-500">
        This trip is missing its two teams — that shouldn&apos;t happen. Check
        the admin teams page.
      </p>
    );
  }

  const byZone = (zone: string | null) =>
    members.filter((m) => (assign[m.id] ?? null) === zone);
  const unassigned = byZone(null);
  const onA = byZone(teamA.id);
  const onB = byZone(teamB.id);
  const activeMember = members.find((m) => m.id === activeId) ?? null;

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <TeamFieldset team={teamA} />
        <TeamFieldset team={teamB} />
      </div>

      <div className="flex items-center gap-3">
        {members.length > 0 && (
          <button
            type="button"
            onClick={autoSplit}
            className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20"
          >
            <Shuffle size={13} /> Auto-split by handicap
          </button>
        )}
        <SaveStatus status={status} onRetry={() => void flush()} />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <Zone
          id={UNASSIGNED}
          label="Unassigned"
          count={unassigned.length}
          color="#71717a"
          empty="Everyone has a team."
        >
          {unassigned.map((m) => (
            <Chip key={m.id} member={m} color="#71717a">
              <ChipBtn
                label={`Put ${m.nickname} on ${teamA.name}`}
                color={teamA.color ?? '#71717a'}
                onClick={() => move(m.id, teamA.id)}
              >
                {initials(teamA.name)}
              </ChipBtn>
              <ChipBtn
                label={`Put ${m.nickname} on ${teamB.name}`}
                color={teamB.color ?? '#71717a'}
                onClick={() => move(m.id, teamB.id)}
              >
                {initials(teamB.name)}
              </ChipBtn>
            </Chip>
          ))}
        </Zone>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { team: teamA, list: onA, other: teamB },
            { team: teamB, list: onB, other: teamA },
          ].map(({ team, list, other }) => (
            <Zone
              key={team.id}
              id={team.id}
              label={team.name}
              count={list.length}
              color={team.color ?? '#71717a'}
              empty="Drop players here"
            >
              {list.map((m) => (
                <Chip key={m.id} member={m} color={team.color ?? '#71717a'}>
                  <ChipBtn
                    label={`Move ${m.nickname} to ${other.name}`}
                    color={other.color ?? '#71717a'}
                    onClick={() => move(m.id, other.id)}
                  >
                    <ArrowLeftRight size={10} />
                  </ChipBtn>
                  <ChipBtn
                    label={`Remove ${m.nickname} from ${team.name}`}
                    color="#a1a1aa"
                    onClick={() => move(m.id, null)}
                  >
                    <X size={10} />
                  </ChipBtn>
                </Chip>
              ))}
            </Zone>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeMember ? (
            <span className="flex items-center gap-1.5 rounded-full border border-yellow-500 bg-yellow-500 px-2.5 py-1 text-[12px] font-semibold text-black shadow-lg">
              {activeMember.nickname}
            </span>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

function SaveStatus({
  status,
  onRetry,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
  onRetry: () => void;
}) {
  if (status === 'saving')
    return (
      <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        <Loader2 size={12} className="animate-spin" /> Saving
      </span>
    );
  if (status === 'saved')
    return (
      <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-emerald-500">
        <CheckCircle2 size={12} /> Saved
      </span>
    );
  if (status === 'error')
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex shrink-0 items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-red-500 underline-offset-2 hover:underline"
      >
        <AlertTriangle size={12} /> Not saved · retry
      </button>
    );
  return <span className="shrink-0" />;
}

function Zone({
  id,
  label,
  count,
  color,
  empty,
  children,
}: {
  id: string;
  label: string;
  count: number;
  color: string;
  empty: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className="rounded-sm border p-3 transition-colors"
      style={{
        borderColor: isOver ? color : `${color}55`,
        background: isOver ? `${color}1f` : `${color}0a`,
        boxShadow: isOver ? `inset 0 0 0 1px ${color}` : undefined,
      }}
    >
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-widest"
        style={{ color }}
      >
        {label} · {count}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {count === 0 ? (
          <p className="text-[12px] text-zinc-500">{empty}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** Draggable player. The name is the drag handle; the buttons beside it
 *  are the tap path and deliberately carry no drag listeners. */
function Chip({
  member,
  color,
  children,
}: {
  member: Member;
  color: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: member.id,
  });
  return (
    <span
      className="flex items-center gap-1 rounded-full border py-1 pl-2.5 pr-1"
      style={{
        borderColor: `${color}55`,
        color,
        background: `${color}0a`,
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="cursor-grab touch-none select-none text-[12px] font-semibold active:cursor-grabbing"
      >
        {member.nickname}
      </span>
      {children}
    </span>
  );
}

function ChipBtn({
  label,
  color,
  onClick,
  children,
}: {
  label: string;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
      style={{ background: `${color}26`, color }}
    >
      {children}
    </button>
  );
}

function TeamFieldset({ team }: { team: Team }) {
  const [color, setColor] = useState(team.color ?? '#71717a');
  return (
    <form
      action={updateTeam}
      className="space-y-2 rounded-sm border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-black/40 p-3"
    >
      <input type="hidden" name="id" value={team.id} />
      <input
        type="text"
        name="name"
        defaultValue={team.name}
        maxLength={40}
        className="w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm font-semibold focus:border-yellow-500/60 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <input
          type="color"
          name="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950"
        />
        <button
          type="submit"
          className="flex-1 rounded-sm border border-zinc-300 dark:border-zinc-700 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/40"
        >
          Save
        </button>
      </div>
    </form>
  );
}
