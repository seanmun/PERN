'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteTeeTime } from '@/lib/actions/tee-times';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function DeleteTeeTimeButton({
  teeTimeId,
}: {
  teeTimeId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run() {
    setOpen(false);
    const fd = new FormData();
    fd.set('id', teeTimeId);
    startTransition(() => deleteTeeTime(fd));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        aria-label="Delete tee time"
        className="rounded-sm border border-zinc-800 p-1.5 text-zinc-500 hover:border-red-700/40 hover:text-red-400 disabled:opacity-50"
      >
        <Trash2 size={12} />
      </button>

      <ConfirmDialog
        open={open}
        tone="danger"
        title="Delete tee time?"
        message="Any matchups attached to this tee time will also be deleted. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
