'use client';

import { useState, useTransition } from 'react';
import { Archive } from 'lucide-react';
import { archiveTrip } from '@/lib/actions/trips';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { rethrowIfControlFlow } from '@/lib/control-flow-error';

/** Archive, not delete: scores, roster and history stay; the event just
 *  leaves the home list. Restore is one tap from home's Archived section. */
export default function ArchiveTripButton({
  tripId,
  tripName,
}: {
  tripId: string;
  tripName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setOpen(false);
    const fd = new FormData();
    fd.set('tripId', tripId);
    startTransition(async () => {
      try {
        await archiveTrip(fd);
      } catch (err) {
        rethrowIfControlFlow(err);
        console.error('Archive failed', err);
        setError(err instanceof Error ? err.message : 'Archive failed');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:border-yellow-500/40 hover:text-yellow-800 dark:hover:text-yellow-400 disabled:opacity-50"
      >
        <Archive size={12} />
        {isPending ? 'Archiving…' : 'Archive event'}
      </button>

      {error && (
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-red-500">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={open}
        title="Archive this event?"
        message={`"${tripName}" moves to your Archived list on home. Nothing is deleted — scores, roster and history stay, and you can restore it anytime.`}
        confirmLabel="Archive"
        cancelLabel="Cancel"
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
