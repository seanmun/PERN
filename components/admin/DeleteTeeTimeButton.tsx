'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteTeeTime } from '@/lib/actions/tee-times';

export default function DeleteTeeTimeButton({
  teeTimeId,
}: {
  teeTimeId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (
      !window.confirm(
        'Delete this tee time? Any matchups attached to it will also be deleted.'
      )
    )
      return;
    const fd = new FormData();
    fd.set('id', teeTimeId);
    startTransition(() => deleteTeeTime(fd));
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label="Delete tee time"
      className="rounded-sm border border-zinc-800 p-1.5 text-zinc-500 hover:border-red-700/40 hover:text-red-400 disabled:opacity-50"
    >
      <Trash2 size={12} />
    </button>
  );
}
