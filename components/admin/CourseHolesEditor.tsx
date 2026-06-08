'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Pencil } from 'lucide-react';
import { updateCourseHole } from '@/lib/actions/courses';

export type EditableHole = {
  id: string;
  holeNumber: number;
  par: number;
  yardage: number | null;
  handicapIndex: number;
};

export default function CourseHolesEditor({
  tripId,
  holes,
}: {
  tripId: string;
  holes: EditableHole[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="flex items-center gap-1.5 rounded-sm border border-zinc-700 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:border-yellow-500/50 hover:text-yellow-400"
        >
          <Pencil size={11} />
          {editing ? 'Done' : 'Edit holes'}
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-sm border border-zinc-800">
        <div className="grid grid-cols-[32px_1fr_1fr_1fr_24px] gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          <span>#</span>
          <span className="text-right">Par</span>
          <span className="text-right">Yards</span>
          <span className="text-right">SI</span>
          <span />
        </div>
        {holes.map((h) => (
          <HoleRow key={h.id} tripId={tripId} hole={h} editing={editing} />
        ))}
      </div>
    </div>
  );
}

function HoleRow({
  tripId,
  hole,
  editing,
}: {
  tripId: string;
  hole: EditableHole;
  editing: boolean;
}) {
  const [par, setPar] = useState(String(hole.par));
  const [yardage, setYardage] = useState(
    hole.yardage != null ? String(hole.yardage) : ''
  );
  const [si, setSi] = useState(String(hole.handicapIndex));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save() {
    setErrMsg(null);
    const fd = new FormData();
    fd.set('tripId', tripId);
    fd.set('id', hole.id);
    fd.set('par', par);
    fd.set('handicapIndex', si);
    fd.set('yardage', yardage);
    setState('saving');
    startTransition(async () => {
      try {
        await updateCourseHole(fd);
        setState('saved');
        setTimeout(() => setState('idle'), 1500);
      } catch (e) {
        setState('error');
        setErrMsg(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  const dirty =
    String(hole.par) !== par ||
    String(hole.handicapIndex) !== si ||
    (hole.yardage != null ? String(hole.yardage) : '') !== yardage;

  return (
    <div className="border-b border-zinc-900 last:border-b-0">
      <div className="grid grid-cols-[32px_1fr_1fr_1fr_24px] items-center gap-2 px-3 py-1.5 font-mono text-xs tabular-nums">
        <span className="text-yellow-400">{hole.holeNumber}</span>
        {editing ? (
          <>
            <input
              type="number"
              min={3}
              max={6}
              value={par}
              onChange={(e) => setPar(e.target.value)}
              onBlur={() => dirty && save()}
              className="rounded-sm border border-zinc-800 bg-black px-2 py-1 text-right tabular-nums text-zinc-100 focus:border-yellow-500 focus:outline-none"
            />
            <input
              type="number"
              min={50}
              max={800}
              value={yardage}
              onChange={(e) => setYardage(e.target.value)}
              onBlur={() => dirty && save()}
              placeholder="—"
              className="rounded-sm border border-zinc-800 bg-black px-2 py-1 text-right tabular-nums text-zinc-100 focus:border-yellow-500 focus:outline-none"
            />
            <input
              type="number"
              min={1}
              max={18}
              value={si}
              onChange={(e) => setSi(e.target.value)}
              onBlur={() => dirty && save()}
              className="rounded-sm border border-zinc-800 bg-black px-2 py-1 text-right tabular-nums text-zinc-100 focus:border-yellow-500 focus:outline-none"
            />
          </>
        ) : (
          <>
            <span className="text-right text-zinc-200">{hole.par}</span>
            <span className="text-right text-zinc-500">
              {hole.yardage ?? '—'}
            </span>
            <span className="text-right text-zinc-500">
              {hole.handicapIndex}
            </span>
          </>
        )}
        <SaveIcon state={state} />
      </div>
      {state === 'error' && errMsg && (
        <p className="px-3 pb-1.5 text-[10px] text-red-400">{errMsg}</p>
      )}
    </div>
  );
}

function SaveIcon({
  state,
}: {
  state: 'idle' | 'saving' | 'saved' | 'error';
}) {
  if (state === 'saving') {
    return <Loader2 size={11} className="animate-spin text-zinc-500" />;
  }
  if (state === 'saved') {
    return <CheckCircle2 size={11} className="text-emerald-400" />;
  }
  if (state === 'error') {
    return <span className="text-[10px] font-bold text-red-400">!</span>;
  }
  return <span />;
}
