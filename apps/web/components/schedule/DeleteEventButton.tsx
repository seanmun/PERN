'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteEvent } from '@/lib/actions/events';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function DeleteEventButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run() {
    setOpen(false);
    const fd = new FormData();
    fd.set('id', eventId);
    startTransition(() => {
      deleteEvent(fd);
    });
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
        {isPending ? 'Deleting…' : 'Delete event'}
      </button>

      <ConfirmDialog
        open={open}
        tone="danger"
        title="Delete event?"
        message="This event will be removed from the schedule. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
