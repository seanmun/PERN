'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Shuffle } from 'lucide-react';
import { updateTeam } from '@/lib/actions/teams';
import { updatePlayerField } from '@/lib/actions/players';
import { autoSplitByHandicap } from '@buddycup/scoring/team-split';

type Team = { id: string; name: string; color: string | null };
type Member = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  tripHandicap: string | null;
  teamId: string | null;
};

export default function TeamsStepClient({
  teams,
  members,
}: {
  teams: Team[];
  members: Member[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const teamA = teams[0];
  const teamB = teams[1];

  function assign(memberId: string, teamId: string | null) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('id', memberId);
      fd.set('field', 'teamId');
      fd.set('value', teamId ?? '');
      await updatePlayerField(fd);
      router.refresh();
    });
  }

  function autoSplit() {
    if (!teamA || !teamB) return;
    const players = members.map((m) => ({
      id: m.id,
      handicap: m.tripHandicap ? Number(m.tripHandicap) : 18,
    }));
    const { sideA, sideB } = autoSplitByHandicap(players);
    startTransition(async () => {
      await Promise.all([
        ...sideA.map((id) => {
          const fd = new FormData();
          fd.set('id', id);
          fd.set('field', 'teamId');
          fd.set('value', teamA.id);
          return updatePlayerField(fd);
        }),
        ...sideB.map((id) => {
          const fd = new FormData();
          fd.set('id', id);
          fd.set('field', 'teamId');
          fd.set('value', teamB.id);
          return updatePlayerField(fd);
        }),
      ]);
      router.refresh();
    });
  }

  const unassigned = members.filter((m) => !m.teamId);
  const onTeamA = members.filter((m) => m.teamId === teamA?.id);
  const onTeamB = members.filter((m) => m.teamId === teamB?.id);

  if (!teamA || !teamB) {
    return (
      <p className="mt-6 text-sm text-zinc-500">
        This trip is missing its two teams — that shouldn&apos;t happen. Check
        the admin teams page.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <TeamFieldset team={teamA} />
        <TeamFieldset team={teamB} />
      </div>

      {members.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={autoSplit}
          className="flex w-full items-center justify-center gap-2 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50"
        >
          <Shuffle size={13} /> Auto-split by handicap
        </button>
      )}

      {unassigned.length > 0 && (
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Unassigned · tap to send to {teamA.name}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unassigned.map((m) => (
              <MemberChip key={m.id} member={m} color="#71717a" onClick={() => assign(m.id, teamA.id)} disabled={pending} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <TeamColumn team={teamA} members={onTeamA} onCycle={(id) => assign(id, teamB.id)} disabled={pending} />
        <TeamColumn team={teamB} members={onTeamB} onCycle={(id) => assign(id, null)} disabled={pending} />
      </div>
    </div>
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

function TeamColumn({
  team,
  members,
  onCycle,
  disabled,
}: {
  team: Team;
  members: Member[];
  onCycle: (id: string) => void;
  disabled: boolean;
}) {
  const color = team.color ?? '#71717a';
  return (
    <div className="rounded-sm border p-3" style={{ borderColor: `${color}55`, background: `${color}0a` }}>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>
        {team.name} · {members.length}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {members.length === 0 ? (
          <p className="text-[12px] text-zinc-500">Empty</p>
        ) : (
          members.map((m) => (
            <MemberChip key={m.id} member={m} color={color} onClick={() => onCycle(m.id)} disabled={disabled} />
          ))
        )}
      </div>
    </div>
  );
}

function MemberChip({
  member,
  color,
  onClick,
  disabled,
}: {
  member: Member;
  color: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50"
      style={{ borderColor: `${color}55`, color, background: `${color}0a` }}
    >
      {member.nickname}
    </button>
  );
}
