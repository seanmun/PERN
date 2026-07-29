'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  CheckCircle2,
  Loader2,
  Plus,
  Users,
  X,
} from 'lucide-react';
import {
  createTeeTime,
  updateTeeTimeField,
  updateTeeTimeRoster,
} from '@/lib/actions/tee-times';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';

const GROUP_CAP = 4;
const POOL = '__pool__';

export type GroupInfo = {
  id: string;
  groupNumber: number;
  timeLocal: string | null; // "YYYY-MM-DDTHH:MM" in trip time, for the input
};

export type GroupMember = {
  id: string;
  nickname: string;
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
  tripHandicap: string | null;
};

/**
 * Foursome builder for one round. Drag players into groups (same @dnd-kit
 * tuning as the match builder and Teams step), or tap a chip's numbered
 * buttons — every control says where it sends the player.
 *
 * Replaces a per-group checkbox grid that showed names with no team (so
 * every foursome-locked format was picked blind), a counter that never
 * moved, a 4-player cap that only failed at save time, and a required
 * "Group #" field asking for a number the app already knew.
 */
export default function GroupsStepClient({
  roundId,
  roundFormat,
  groups,
  members,
  initialAssign,
}: {
  roundId: string;
  /** The round's game — decides which auto-fill is recommended, the seat
   *  size it uses, and when a grouping earns a constraint warning. */
  roundFormat: string;
  groups: GroupInfo[];
  members: GroupMember[];
  initialAssign: Record<string, string | null>;
}) {
  const router = useRouter();
  const [assign, setAssign] = useState<Record<string, string | null>>(
    () => initialAssign,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);

  // Groups whose rosters differ from the server. A move dirties BOTH the
  // group the player left and the one they joined — the save is a
  // wipe-and-replace per group.
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read latest assignment inside the debounced flush without re-creating it.
  const assignRef = useRef(assign);
  useEffect(() => {
    assignRef.current = assign;
  }, [assign]);

  const countIn = useCallback(
    (map: Record<string, string | null>, groupId: string) =>
      members.filter((m) => map[m.id] === groupId).length,
    [members],
  );

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const ids = Array.from(dirty.current);
    if (!ids.length) return;
    dirty.current.clear();
    setStatus('saving');
    try {
      await Promise.all(
        ids.map((groupId) => {
          const fd = new FormData();
          fd.set('teeTimeId', groupId);
          fd.set('redirectTo', 'none');
          for (const m of members) {
            if (assignRef.current[m.id] === groupId) {
              fd.append('memberIds', m.id);
            }
          }
          return updateTeeTimeRoster(fd);
        }),
      );
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      rethrowIfControlFlow(err);
      console.error('Failed to save groups', err);
      ids.forEach((id) => dirty.current.add(id));
      setStatus('error');
    }
  }, [members]);

  const move = useCallback(
    (memberId: string, groupId: string | null) => {
      setNotice(null);
      setAssign((prev) => {
        const from = prev[memberId] ?? null;
        if (from === groupId) return prev;
        // Live cap: the fifth player bounces here, not at save time.
        if (groupId && countIn(prev, groupId) >= GROUP_CAP) {
          setNotice(`That group is full (${GROUP_CAP} max).`);
          return prev;
        }
        if (from) dirty.current.add(from);
        if (groupId) dirty.current.add(groupId);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 600);
        return { ...prev, [memberId]: groupId };
      });
    },
    [countIn, flush],
  );

  // Don't drop a grouping the user can see on screen.
  useEffect(() => () => void flush(), [flush]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 5 },
    }),
  );

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const target = String(e.over.id);
    move(String(e.active.id), target === POOL ? null : target);
  }

  function addGroup() {
    setAddingGroup(true);
    (async () => {
      try {
        const fd = new FormData();
        fd.set('roundId', roundId);
        fd.set('redirectTo', 'none');
        await createTeeTime(fd);
        router.refresh();
      } catch (err) {
        rethrowIfControlFlow(err);
        console.error('Failed to add group', err);
        setNotice('Could not add a group — try again.');
      } finally {
        setAddingGroup(false);
      }
    })();
  }

  /**
   * Auto-fill. Two shapes because the right one depends on the game:
   * same-team groups for scramble / 30 Ball (a side must share a
   * foursome), mixed groups for best ball / singles (both teams in every
   * foursome). Fills existing groups only, by handicap, and says when
   * there aren't enough seats.
   */
  function autoFill(mode: 'same-team' | 'mixed', seatSize: number = GROUP_CAP) {
    setNotice(null);
    const hcp = (m: GroupMember) =>
      m.tripHandicap ? Number(m.tripHandicap) : 18;
    const sorted = [...members].sort((a, b) => hcp(a) - hcp(b));
    const byTeam = new Map<string, GroupMember[]>();
    for (const m of sorted) {
      const key = m.teamId ?? '__none__';
      byTeam.set(key, [...(byTeam.get(key) ?? []), m]);
    }

    let ordered: GroupMember[];
    if (mode === 'same-team') {
      // Team A's players fill groups first, then team B's — a group only
      // ever holds one team.
      ordered = Array.from(byTeam.values()).flat();
    } else {
      // Alternate teams so every foursome gets (up to) 2 per side.
      const lists = Array.from(byTeam.values()).map((l) => [...l]);
      ordered = [];
      while (lists.some((l) => l.length)) {
        for (const l of lists) {
          const next = l.shift();
          if (next) ordered.push(next);
        }
      }
    }

    const next: Record<string, string | null> = Object.fromEntries(
      members.map((m) => [m.id, null]),
    );
    let gi = 0;
    let seated = 0;
    for (const m of ordered) {
      // same-team must not split a team across a partially-filled group
      // boundary mid-team; advancing on cap handles both modes.
      while (
        gi < groups.length &&
        members.filter((x) => next[x.id] === groups[gi].id).length >= seatSize
      ) {
        gi++;
      }
      if (mode === 'same-team' && gi < groups.length) {
        // If this player's team differs from the group's current occupants,
        // start them in the next empty group.
        const occupants = members.filter((x) => next[x.id] === groups[gi].id);
        if (occupants.length && occupants[0].teamId !== m.teamId) gi++;
      }
      if (gi >= groups.length) break;
      next[m.id] = groups[gi].id;
      seated++;
    }

    for (const m of members) move(m.id, next[m.id]);
    // Bulk fill saves NOW, not on a timer — a queued save died silently
    // if the user clicked straight through to the next step.
    void flush();
    if (seated < members.length) {
      setNotice(
        `${members.length - seated} player${members.length - seated === 1 ? '' : 's'} left unassigned — add another group.`,
      );
    }
  }

  // What the game recommends. Same-team grouping is a hard requirement
  // for 30 Ball (sides of 3 share a foursome) and the safe default for
  // scramble at any side size; everything else wants both teams in each
  // foursome. 30 Ball seats 3 to a group so the side IS the group.
  const rec: { mode: 'same-team' | 'mixed'; seat: number; label: string } =
    roundFormat === 'thirty_ball'
      ? { mode: 'same-team', seat: 3, label: 'Group for 30 Ball · 3 per side' }
      : roundFormat === 'scramble'
        ? { mode: 'same-team', seat: GROUP_CAP, label: 'One team per group' }
        : { mode: 'mixed', seat: GROUP_CAP, label: 'Mix teams' };

  // Constraint warning, not convention: only 30 Ball makes a mixed group
  // impossible to play (a side of 3 teammates must share the foursome).
  // Cross-group best ball etc. is legal and must never warn.
  const thirtyBallViolations =
    roundFormat === 'thirty_ball'
      ? groups.filter((g) => {
          const teamsIn = new Set(
            members
              .filter((m) => assign[m.id] === g.id)
              .map((m) => m.teamId ?? '__none__'),
          );
          return teamsIn.size > 1;
        })
      : [];

  const pool = members.filter((m) => !(assign[m.id] ?? null));
  const activeMember = members.find((m) => m.id === activeId) ?? null;
  // Pool shown clustered by team so the two sides are never interleaved.
  const poolByTeam = new Map<string, GroupMember[]>();
  for (const m of pool) {
    const key = m.teamName ?? 'No team';
    poolByTeam.set(key, [...(poolByTeam.get(key) ?? []), m]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => autoFill(rec.mode, rec.seat)}
          className="rounded-sm bg-yellow-500 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black hover:bg-yellow-400"
          title="Recommended for this round's game"
        >
          <Users size={11} className="mr-1 inline" /> {rec.label}
        </button>
        <button
          type="button"
          onClick={() =>
            autoFill(rec.mode === 'mixed' ? 'same-team' : 'mixed', GROUP_CAP)
          }
          className="rounded-sm border border-zinc-300 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
        >
          {rec.mode === 'mixed' ? 'One team per group' : 'Mix teams'}
        </button>
        <span className="ml-auto">
          <SaveStatus status={status} onRetry={() => void flush()} />
        </span>
      </div>

      {thirtyBallViolations.length > 0 && (
        <p className="flex items-center gap-1.5 rounded-sm border border-red-500/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-600 dark:text-red-400">
          <AlertTriangle size={13} className="shrink-0" />
          {thirtyBallViolations.length === 1
            ? `Group ${thirtyBallViolations[0].groupNumber} mixes teams — a 30 Ball side is 3 teammates in one foursome.`
            : `Groups ${thirtyBallViolations.map((g) => g.groupNumber).join(', ')} mix teams — a 30 Ball side is 3 teammates in one foursome.`}
        </p>
      )}

      {notice && (
        <p className="rounded-sm border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-[12px] text-yellow-900 dark:text-yellow-200">
          {notice}
        </p>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
      >
        <PoolZone count={pool.length}>
          {Array.from(poolByTeam.entries()).map(([teamName, list]) => (
            <div key={teamName} className="flex flex-wrap items-center gap-1.5">
              <span
                className="font-mono text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: list[0]?.teamColor ?? '#71717a' }}
              >
                {teamName}
              </span>
              {list.map((m) => (
                <Chip key={m.id} member={m}>
                  {groups.map((g) => (
                    <ChipBtn
                      key={g.id}
                      label={`Put ${m.nickname} in group ${g.groupNumber}`}
                      disabled={countIn(assign, g.id) >= GROUP_CAP}
                      onClick={() => move(m.id, g.id)}
                    >
                      {g.groupNumber}
                    </ChipBtn>
                  ))}
                </Chip>
              ))}
            </div>
          ))}
        </PoolZone>

        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const inGroup = members.filter((m) => assign[m.id] === g.id);
            return (
              <GroupZone
                key={g.id}
                group={g}
                count={inGroup.length}
                full={inGroup.length >= GROUP_CAP}
              >
                {inGroup.map((m) => (
                  <Chip key={m.id} member={m}>
                    {groups
                      .filter((o) => o.id !== g.id)
                      .map((o) => (
                        <ChipBtn
                          key={o.id}
                          label={`Move ${m.nickname} to group ${o.groupNumber}`}
                          disabled={countIn(assign, o.id) >= GROUP_CAP}
                          onClick={() => move(m.id, o.id)}
                        >
                          {o.groupNumber}
                        </ChipBtn>
                      ))}
                    <ChipBtn
                      label={`Remove ${m.nickname} from group ${g.groupNumber}`}
                      onClick={() => move(m.id, null)}
                    >
                      <X size={10} />
                    </ChipBtn>
                  </Chip>
                ))}
              </GroupZone>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeMember ? (
            <span className="flex items-center gap-1.5 rounded-full border border-yellow-500 bg-yellow-500 px-2.5 py-1 text-[12px] font-semibold text-black shadow-lg">
              {activeMember.nickname}
            </span>
          ) : null}
        </DragOverlay>
      </DndContext>

      <button
        type="button"
        disabled={addingGroup}
        onClick={addGroup}
        className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-zinc-300 dark:border-zinc-700 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/40 hover:text-yellow-800 dark:hover:text-yellow-400 disabled:opacity-50"
      >
        <Plus size={12} /> {addingGroup ? 'Adding…' : 'Add group'}
      </button>
    </div>
  );
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
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        <Loader2 size={12} className="animate-spin" /> Saving
      </span>
    );
  if (status === 'saved')
    return (
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-emerald-500">
        <CheckCircle2 size={12} /> Saved
      </span>
    );
  if (status === 'error')
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-red-500 underline-offset-2 hover:underline"
      >
        <AlertTriangle size={12} /> Not saved · retry
      </button>
    );
  return null;
}

function PoolZone({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-sm border border-dashed p-3 transition-colors ${
        isOver
          ? 'border-zinc-500 bg-zinc-100 dark:bg-zinc-900/60'
          : 'border-zinc-300 dark:border-zinc-800'
      }`}
    >
      <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Not grouped · {count}
      </p>
      <div className="mt-2 space-y-1.5">
        {count === 0 ? (
          <p className="text-[12px] text-zinc-500">Everyone has a group.</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function GroupZone({
  group,
  count,
  full,
  children,
}: {
  group: GroupInfo;
  count: number;
  full: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id, disabled: full });
  const [time, setTime] = useState(group.timeLocal ?? '');
  const [timeState, setTimeState] = useState<'idle' | 'saving' | 'error'>(
    'idle',
  );

  function saveTime() {
    if ((group.timeLocal ?? '') === time) return;
    setTimeState('saving');
    (async () => {
      try {
        const fd = new FormData();
        fd.set('id', group.id);
        fd.set('field', 'time');
        fd.set('value', time);
        await updateTeeTimeField(fd);
        setTimeState('idle');
      } catch (err) {
        rethrowIfControlFlow(err);
        console.error('Failed to save tee time', err);
        setTimeState('error');
      }
    })();
  }

  return (
    <div
      ref={setNodeRef}
      className="rounded-sm border p-3 transition-colors"
      style={{
        borderColor: isOver ? '#eab308' : full ? '#a1620755' : undefined,
        background: isOver ? 'rgba(234,179,8,0.08)' : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Group {group.groupNumber} ·{' '}
          <span className={full ? 'text-yellow-700 dark:text-yellow-500' : ''}>
            {count}/{GROUP_CAP}
          </span>
        </p>
        <span className="flex items-center gap-1">
          <input
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={saveTime}
            aria-label={`Tee time for group ${group.groupNumber} (optional)`}
            className={`rounded-sm border bg-white px-1.5 py-0.5 font-mono text-[10px] dark:bg-zinc-950 ${
              timeState === 'error'
                ? 'border-red-500'
                : 'border-zinc-300 dark:border-zinc-800'
            }`}
          />
          {!time && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              TBD
            </span>
          )}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {count === 0 ? (
          <p className="text-[12px] text-zinc-500">Drop players here</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** Team colour is the chip — the old grid showed bare names and made every
 *  foursome-locked format a memory game. */
function Chip({
  member,
  children,
}: {
  member: GroupMember;
  children: React.ReactNode;
}) {
  const color = member.teamColor ?? '#71717a';
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
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-200/70 px-1 font-mono text-[9px] font-bold leading-none text-zinc-700 hover:bg-zinc-300 disabled:opacity-30 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
    >
      {children}
    </button>
  );
}
