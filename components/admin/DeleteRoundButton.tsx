'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteRound } from '@/lib/actions/rounds';

export default function DeleteRoundButton({ roundId }: { roundId: string }) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (
      !window.confirm(
        'Delete this round? Tee times and matchups will also be deleted.'
      )
    )
      return;
    const fd = new FormData();
    fd.set('id', roundId);
    startTransition(() => deleteRound(fd));
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="flex items-center gap-2 rounded-sm border border-red-700/40 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-red-400 hover:bg-red-900/20 disabled:opacity-50"
    >
      <Trash2 size={12} />
      {isPending ? 'Deleting…' : 'Delete round'}
    </button>
  );
}
