'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteRound } from '@/lib/actions/rounds';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function DeleteRoundButton({ roundId }: { roundId: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run() {
    setOpen(false);
    const fd = new FormData();
    fd.set('id', roundId);
    startTransition(() => deleteRound(fd));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-sm border border-red-700/40 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-red-400 hover:bg-red-900/20 disabled:opacity-50"
      >
        <Trash2 size={12} />
        {isPending ? 'Deleting…' : 'Delete round'}
      </button>

      <ConfirmDialog
        open={open}
        tone="danger"
        title="Delete round?"
        message="The round, every tee time on it, and every matchup attached to those tee times will be removed. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
